import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, people, units, unitMembers, neighborhoods } from '../db/schema.js'
import { randomToken } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'

export type CreateInvitationInput = {
  unitId: string
  createdBy: string
  kind: 'visita' | 'frecuente' | 'proveedor'
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

/**
 * Las invitaciones VIGENTES de las UF indicadas, con cuántas veces se usó cada
 * una. Es lo que muestra la home del vecino; el pasado vive en el historial.
 *
 * El filtro está acá y no en el navegador porque antes esto devolvía todas las
 * invitaciones que la unidad tuvo en su vida —50 filas y 23 KB para mostrar 12,
 * en una base de unas semanas— y solo empeora con el tiempo.
 *
 * "Vigente" es: no anulada, todavía dentro de la ventana, y con cupo libre. El
 * día de la semana NO entra: una frecuente de lunes y miércoles sigue siendo
 * una invitación vigente un martes.
 */
export async function listForUnits(unitIds: string[]) {
  if (!unitIds.length) return []
  const hoy = todayInBuenosAires()
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
    .where(and(
      inArray(invitations.unitId, unitIds),
      isNull(invitations.revokedAt),
      gte(invitations.validTo, hoy),
    ))
    .groupBy(invitations.id, people.name, units.label)
    // El cupo se mide sobre el count de ingresos, así que va en HAVING.
    .having(sql`count(${entryLogs.id}) < ${invitations.capacity}`)
    .orderBy(desc(invitations.createdAt))
}

export type HistoryFilters = {
  q?: string
  kind?: 'visita' | 'frecuente' | 'proveedor'
  estado?: 'entro' | 'no_entro' | 'anulada'
  /** Id del vecino, para el filtro "solo las mías". */
  createdBy?: string
  page?: number
  pageSize?: number
}

export type HistoryPage = {
  rows: Awaited<ReturnType<typeof listForUnits>>
  total: number
  page: number
  pageSize: number
}

/**
 * El historial: lo mismo que la lista, pero buscable, filtrable y paginado.
 *
 * El filtro y el conteo van del lado del servidor. Filtrar la página que llegó
 * daría un "3 resultados" que en realidad son 3 de esta página, y el buscador
 * no encontraría a nadie que esté más atrás en el tiempo.
 *
 * El estado se resuelve con un EXISTS sobre entry_log y no con el count de
 * ingresos: así la condición entra en el WHERE y el total sale de un count
 * simple, sin que el join de ingresos multiplique filas.
 */
export async function searchInvitations(
  unitIds: string[],
  f: HistoryFilters,
): Promise<HistoryPage> {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20))
  if (!unitIds.length) return { rows: [], total: 0, page, pageSize }

  const entro = sql`exists (select 1 from entry_log e where e.invitation_id = ${invitations.id})`

  const donde = and(
    inArray(invitations.unitId, unitIds),
    f.kind ? eq(invitations.kind, f.kind) : undefined,
    f.createdBy ? eq(invitations.createdBy, f.createdBy) : undefined,
    // unaccent para que "martin" encuentre a "Martín". Documento y patente van
    // sin unaccent: no llevan tildes.
    f.q
      ? sql`(unaccent(${invitations.guestName}) ilike unaccent(${'%' + f.q + '%'})
             or ${invitations.guestDoc} ilike ${'%' + f.q + '%'}
             or ${invitations.plate} ilike ${'%' + f.q + '%'})`
      : undefined,
    f.estado === 'anulada' ? sql`${invitations.revokedAt} is not null` : undefined,
    f.estado === 'entro' ? and(isNull(invitations.revokedAt), entro) : undefined,
    f.estado === 'no_entro' ? and(isNull(invitations.revokedAt), sql`not ${entro}`) : undefined,
  )

  const [rows, [conteo]] = await Promise.all([
    db.select({
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
      .where(donde)
      .groupBy(invitations.id, people.name, units.label)
      .orderBy(desc(invitations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` })
      .from(invitations)
      .where(donde),
  ])

  return { rows, total: conteo?.n ?? 0, page, pageSize }
}

export async function revokeInvitation(id: string, personId: string, neighborhoodId: string): Promise<void> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)

  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id))
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

  return {
    guestName: row.guestName,
    kind: row.kind,
    validFrom: row.validFrom,
    validTo: row.validTo,
    revokedAt: row.revokedAt,
    unitLabel: row.unitLabel,
    inviterName: row.inviterName,
    neighborhood: { name: row.neighborhoodName, address: row.address, mapUrl: row.mapUrl },
    // Solo se informa si YA hay datos, nunca cuáles: el link puede estar en
    // manos de cualquiera.
    hasDoc: Boolean(row.guestDoc),
    hasPlate: Boolean(row.plate),
    frozen: (await entriesOf(row.id)) > 0,
  }
}

async function entriesOf(invitationId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return row?.n ?? 0
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

/** Deshacer una anulación. */
export async function restoreInvitation(
  id: string,
  personId: string,
  neighborhoodId: string,
): Promise<void> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)
  if (!inv.revokedAt) return

  await db.update(invitations).set({ revokedAt: null }).where(eq(invitations.id, id))
  await audit(personId, neighborhoodId, 'invitation.restored', 'invitation', id)
}

export type EditInvitationInput = {
  guestName?: string
  guestDoc?: string | null
  plate?: string | null
  validFrom?: string
  validTo?: string
  weekdays?: number[] | null
  capacity?: number
}

/**
 * Editar una invitación ya creada.
 *
 * No se puede cambiar de unidad ni de tipo: eso es otra invitación, no la misma
 * editada, y el guardia ya vio la anterior. Tampoco se puede bajar el cupo por
 * debajo de la gente que ya entró, porque dejaría el contador mintiendo.
 */
export async function editInvitation(
  id: string,
  personId: string,
  input: EditInvitationInput,
) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)

  if (inv.revokedAt) throw new AppError(409, 'revoked')

  const [{ usados }] = await db.select({ usados: sql<number>`count(*)::int` })
    .from(entryLogs).where(eq(entryLogs.invitationId, id))

  const validFrom = input.validFrom ?? inv.validFrom
  const validTo = input.validTo ?? inv.validTo
  if (validTo < validFrom) throw new AppError(400, 'ventana_invertida')

  const capacity = input.capacity ?? inv.capacity
  if (capacity < Math.max(1, usados)) throw new AppError(409, 'cupo_menor_al_usado')

  const [actualizada] = await db.update(invitations).set({
    ...(input.guestName !== undefined ? { guestName: input.guestName.trim() } : {}),
    ...(input.guestDoc !== undefined ? { guestDoc: input.guestDoc?.trim() || null } : {}),
    ...(input.plate !== undefined ? { plate: input.plate?.trim().toUpperCase() || null } : {}),
    validFrom,
    validTo,
    ...(input.weekdays !== undefined ? { weekdays: input.weekdays?.length ? input.weekdays : null } : {}),
    capacity,
  }).where(eq(invitations.id, id)).returning()

  return actualizada
}
