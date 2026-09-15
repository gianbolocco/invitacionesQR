import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, people, units, unitMembers, neighborhoods } from '../db/schema.js'
import { randomToken } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'

export type CreateInvitationInput = {
  unitId: string
  createdBy: string
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  guestName: string
  guestDoc?: string
  plate?: string
  validFrom: string
  validTo: string
  weekdays?: number[]
  capacity: number
}

export async function assertMemberOfUnit(personId: string, unitId: string): Promise<void> {
  const [row] = await db.select().from(unitMembers)
    .where(and(eq(unitMembers.personId, personId), eq(unitMembers.unitId, unitId)))
    .limit(1)
  if (!row) throw new AppError(403, 'not_your_unit')
}

export async function createInvitation(input: CreateInvitationInput) {
  await assertMemberOfUnit(input.createdBy, input.unitId)

  const [inv] = await db.insert(invitations).values({
    unitId: input.unitId,
    createdBy: input.createdBy,
    kind: input.kind,
    guestName: input.guestName.trim(),
    guestDoc: input.guestDoc?.trim() || null,
    plate: input.plate?.trim().toUpperCase() || null,
    validFrom: input.validFrom,
    validTo: input.validTo,
    weekdays: input.weekdays?.length ? input.weekdays : null,
    capacity: input.capacity,
    token: randomToken(16),
  }).returning()

  return inv
}

/** Invitaciones de las UF indicadas, con cuántas veces se usó cada una. */
export async function listForUnits(unitIds: string[]) {
  if (!unitIds.length) return []
  return db.select({
    id: invitations.id,
    kind: invitations.kind,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    token: invitations.token,
    revokedAt: invitations.revokedAt,
    createdAt: invitations.createdAt,
    createdBy: invitations.createdBy,
    creatorName: people.name,
    unitId: invitations.unitId,
    unitLabel: units.label,
    usedCount: count(entryLogs.id),
  })
    .from(invitations)
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(units, eq(units.id, invitations.unitId))
    .leftJoin(entryLogs, eq(entryLogs.invitationId, invitations.id))
    .where(inArray(invitations.unitId, unitIds))
    .groupBy(invitations.id, people.name, units.label)
    .orderBy(desc(invitations.createdAt))
}

export async function revokeInvitation(id: string, personId: string, neighborhoodId: string): Promise<void> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)

  const now = new Date()
  await db.update(invitations).set({ revokedAt: now }).where(eq(invitations.id, id))
  // En cascada: anular un evento anula a todos los que se anotaron. Si no, cada
  // hija seguiría entrando con su propio QR después de cancelado el cumpleaños.
  await db.update(invitations).set({ revokedAt: now }).where(eq(invitations.parentId, id))

  await audit(personId, neighborhoodId, 'invitation.revoked', 'invitation', id)
}

/**
 * Datos públicos del QR. Muestra quién invita, la unidad y cómo llegar: es una
 * apertura deliberada respecto de la versión anterior, que exponía lo mínimo.
 * Un link reenviado deja saber quién vive en esa unidad; se acepta porque el
 * invitado necesita saber de parte de quién viene el acceso. Nunca el mail.
 */
export async function findPublicByToken(token: string) {
  const [row] = await db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    kind: invitations.kind,
    parentId: invitations.parentId,
    capacity: invitations.capacity,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    revokedAt: invitations.revokedAt,
    unitLabel: units.label,
    inviterName: people.name,
    neighborhoodName: neighborhoods.name,
    address: neighborhoods.address,
    mapUrl: neighborhoods.mapUrl,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
    .where(eq(invitations.token, token))
    .limit(1)

  if (!row) return null

  // Un evento (padre) es una puerta de anotación, no un QR personal.
  const isEventDoor = row.kind === 'evento' && !row.parentId

  return {
    guestName: row.guestName,
    kind: row.kind,
    validFrom: row.validFrom,
    validTo: row.validTo,
    revokedAt: row.revokedAt,
    unitLabel: row.unitLabel,
    inviterName: row.inviterName,
    neighborhood: { name: row.neighborhoodName, address: row.address, mapUrl: row.mapUrl },
    isEventDoor,
    // Solo se informa si YA hay datos, nunca cuáles: el link puede estar en
    // manos de cualquiera.
    hasDoc: Boolean(row.guestDoc),
    hasPlate: Boolean(row.plate),
    spotsLeft: isEventDoor ? await spotsLeft(row.id, row.capacity) : null,
    frozen: (await entriesOf(row.id)) > 0,
  }
}

async function entriesOf(invitationId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return row?.n ?? 0
}

/** Lugares libres de un evento: cupo menos anotados menos ingresos directos. */
async function spotsLeft(eventId: string, capacity: number): Promise<number> {
  const [row] = await db.select({
    taken: sql<number>`
      (select count(*) from invitation h where h.parent_id = ${eventId})
      + (select count(*) from entry_log e where e.invitation_id = ${eventId})`,
  }).from(invitations).where(eq(invitations.id, eventId)).limit(1)
  return Math.max(0, capacity - Number(row?.taken ?? 0))
}

/**
 * El invitado carga su propio documento y patente desde el link.
 *
 * Escribe SOLO esos dos campos, y solo si están vacíos: un link reenviado no
 * puede pisar lo que cargó el vecino. Nunca nombre, fechas, cupo ni unidad.
 * No bloquea nada — si el invitado no completa, todo sigue funcionando.
 */
export async function fillGuestDetails(
  token: string,
  data: { guestDoc?: string; plate?: string },
): Promise<void> {
  const [inv] = await db.select().from(invitations)
    .where(eq(invitations.token, token)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  if (inv.revokedAt) throw new AppError(409, 'revoked')

  // Una vez que entró, entry_log ya guardó su copia: el histórico no se reescribe.
  if ((await entriesOf(inv.id)) > 0) throw new AppError(409, 'already_entered')

  const patch: { guestDoc?: string; plate?: string } = {}
  if (!inv.guestDoc && data.guestDoc?.trim()) patch.guestDoc = data.guestDoc.trim()
  if (!inv.plate && data.plate?.trim()) patch.plate = data.plate.trim().toUpperCase()

  if (Object.keys(patch).length) {
    await db.update(invitations).set(patch).where(eq(invitations.id, inv.id))
  }
}

/**
 * Un invitado se anota a un evento y se lleva su propia invitación, con su
 * nombre y su QR. El cupo se controla dentro de la transacción con FOR UPDATE
 * sobre el evento, igual que el registro de ingreso.
 *
 * Si ese documento ya se anotó, devuelve la hija existente en vez de crear otra
 * y quemar un lugar: el invitado que reabre el link no gasta cupo.
 */
export async function joinEvent(
  eventToken: string,
  data: { guestName: string; guestDoc?: string },
): Promise<{ token: string; alreadyJoined: boolean }> {
  return db.transaction(async (tx) => {
    const [evento] = await tx.select().from(invitations)
      .where(eq(invitations.token, eventToken)).for('update').limit(1)

    if (!evento) throw new AppError(404, 'not_found')
    if (evento.kind !== 'evento' || evento.parentId) throw new AppError(400, 'not_an_event')
    if (evento.revokedAt) throw new AppError(409, 'revoked')
    if (todayInBuenosAires() > evento.validTo) throw new AppError(409, 'expired')

    const doc = data.guestDoc?.trim() || null

    if (doc) {
      const [yaAnotado] = await tx.select().from(invitations)
        .where(and(eq(invitations.parentId, evento.id), eq(invitations.guestDoc, doc)))
        .limit(1)
      if (yaAnotado) return { token: yaAnotado.token, alreadyJoined: true }
    }

    const [{ taken }] = await tx.select({
      taken: sql<number>`
        (select count(*) from invitation h where h.parent_id = ${evento.id})
        + (select count(*) from entry_log e where e.invitation_id = ${evento.id})`,
    }).from(invitations).where(eq(invitations.id, evento.id))

    if (Number(taken) >= evento.capacity) throw new AppError(409, 'no_capacity')

    const [hija] = await tx.insert(invitations).values({
      unitId: evento.unitId,
      createdBy: evento.createdBy,
      parentId: evento.id,
      kind: 'evento',
      guestName: data.guestName.trim(),
      guestDoc: doc,
      validFrom: evento.validFrom,
      validTo: evento.validTo,
      weekdays: evento.weekdays,
      capacity: 1,
      token: randomToken(16),
    }).returning()

    return { token: hija.token, alreadyJoined: false }
  })
}

/** Anotados a un evento, para que el vecino vea quién viene. */
export async function listEventGuests(eventId: string) {
  return db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    revokedAt: invitations.revokedAt,
    createdAt: invitations.createdAt,
  })
    .from(invitations)
    .where(eq(invitations.parentId, eventId))
    .orderBy(invitations.createdAt)
}
