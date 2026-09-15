import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, units, people } from '../db/schema.js'
import { canEnter, type EntryCheck } from '../authz.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'

/** db o una transacción: las queries de lectura sirven para las dos. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

async function loadForCheck(where: SQL) {
  const [row] = await db.select({
    id: invitations.id,
    kind: invitations.kind,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    revokedAt: invitations.revokedAt,
    parentId: invitations.parentId,
    unitId: invitations.unitId,
    unitLabel: units.label,
  }).from(invitations).innerJoin(units, eq(units.id, invitations.unitId)).where(where).limit(1)
  return row ?? null
}

/** La raíz del evento: el padre si es un anotado, o la propia invitación. */
function rootIdOf(inv: { id: string; parentId: string | null }): string {
  return inv.parentId ?? inv.id
}

/**
 * Uso de la FAMILIA: ingresos contra la raíz más los de todas sus hijas.
 * El cupo de un evento es del evento, no de cada anotado, y el QR compartido del
 * evento sigue vivo para el que no se anotó: los dos caminos descuentan igual.
 */
async function familyUsage(rootId: string, tx: Executor = db) {
  const [row] = await tx.select({
    used: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${entryLogs.enteredAt})`,
  })
    .from(entryLogs)
    .innerJoin(invitations, eq(invitations.id, entryLogs.invitationId))
    .where(or(eq(invitations.id, rootId), eq(invitations.parentId, rootId)))
  return { usedCount: row?.used ?? 0, lastEntryAt: row?.last ?? null }
}

async function ownUsage(invitationId: string, tx: Executor = db) {
  const [row] = await tx.select({ used: sql<number>`count(*)::int` })
    .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return row?.used ?? 0
}

type LoadedInvitation = NonNullable<Awaited<ReturnType<typeof loadForCheck>>>

async function buildCheck(invitation: LoadedInvitation) {
  const rootId = rootIdOf(invitation)
  const { usedCount, lastEntryAt } = await familyUsage(rootId)

  // Un anotado compara contra la capacidad del EVENTO, no contra la suya.
  const capacity = invitation.parentId
    ? (await capacityOf(rootId)) ?? invitation.capacity
    : invitation.capacity

  let check: EntryCheck = canEnter({ ...invitation, capacity }, new Date(), usedCount)

  // Y además no puede entrar dos veces, aunque al evento le sobre cupo.
  if (check.ok && invitation.parentId && (await ownUsage(invitation.id)) >= 1) {
    check = { ok: false, reason: 'no_capacity' }
  }

  return { invitation, check, usedCount, lastEntryAt }
}

async function capacityOf(id: string, tx: Executor = db): Promise<number | null> {
  const [row] = await tx.select({ capacity: invitations.capacity })
    .from(invitations).where(eq(invitations.id, id)).limit(1)
  return row?.capacity ?? null
}

export async function checkByToken(token: string) {
  const invitation = await loadForCheck(eq(invitations.token, token))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

export async function checkById(id: string) {
  const invitation = await loadForCheck(eq(invitations.id, id))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

/**
 * Registra el ingreso revalidando el cupo DENTRO de la transacción.
 *
 * El FOR UPDATE va sobre la RAÍZ del evento, no sobre la invitación escaneada:
 * es la fila que comparten todos los anotados, y por lo tanto la que serializa
 * el cupo. Bloquear la hija dejaría entrar al 31 de un evento de 30.
 */
export async function registerEntry(
  invitationId: string,
  guardId: string | null,
  data: { guestName: string; guestDoc?: string; plate?: string; note?: string },
) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(invitations)
      .where(eq(invitations.id, invitationId)).limit(1)
    if (!target) throw new AppError(404, 'not_found')

    const rootId = rootIdOf(target)
    const [root] = await tx.select().from(invitations)
      .where(eq(invitations.id, rootId)).for('update').limit(1)
    if (!root) throw new AppError(404, 'not_found')

    const { usedCount } = await familyUsage(rootId, tx)

    // La ventana y la revocación se miran en la invitación escaneada; el cupo,
    // en el evento. Una hija revocada no entra aunque al evento le sobre lugar.
    const check = canEnter({ ...target, capacity: root.capacity }, new Date(), usedCount)
    if (!check.ok) throw new AppError(409, check.reason)

    if (target.parentId && (await ownUsage(target.id, tx)) >= 1) {
      throw new AppError(409, 'no_capacity')
    }

    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: target.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: data.guestDoc?.trim() || null,
      plate: data.plate?.trim().toUpperCase() || null,
      note: data.note?.trim() || null,
    }).returning()

    return entry
  })
}

/**
 * Invitaciones todavía vigentes que matchean nombre, etiqueta de UF o patente.
 *
 * La comparación pasa por `unaccent`: con un auto esperando en la barrera nadie
 * escribe "Pérez" con tilde, y el vecino sí la escribió al cargar la invitación.
 *
 * ponytail: unaccent() no es IMMUTABLE, así que esto no usa índice y hace scan.
 * Con las invitaciones vigentes de un barrio son decenas de filas. Si alguna vez
 * duele: wrapper IMMUTABLE + índice GIN con pg_trgm.
 */
export async function searchGuests(neighborhoodId: string, query: string) {
  const q = `%${query.trim()}%`
  const hoy = todayInBuenosAires()

  return db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    kind: invitations.kind,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    unitLabel: units.label,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      gte(invitations.validTo, hoy),
      or(
        sql`unaccent(${invitations.guestName}) ilike unaccent(${q})`,
        sql`unaccent(${units.label}) ilike unaccent(${q})`,
        ilike(invitations.plate, q),
      ),
    ))
    .orderBy(desc(invitations.createdAt))
    .limit(20)
}

export async function listGuards(neighborhoodId: string) {
  return db.select({ id: people.id, name: people.name }).from(people)
    .where(and(
      eq(people.neighborhoodId, neighborhoodId),
      eq(people.role, 'guard'),
      eq(people.status, 'active'),
    ))
    .orderBy(people.name)
}

export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  joinedCount: number      // anotados, solo para eventos
  enteredCount: number     // ingresos de la familia
  lastEntryAt: Date | null
}

/**
 * Quiénes están habilitados a entrar un día dado.
 *
 * Aplica las mismas reglas que canEnter salvo el cupo: una invitación con el
 * cupo agotado igual aparece, marcada como "ya entró". El guardia necesita ver
 * quién vino, no solo quién falta.
 *
 * Los anotados a un evento NO salen como filas sueltas: un cumpleaños de 30
 * taparía las tres visitas que importan. El evento va como una fila con su
 * cupo, y se despliega aparte.
 */
export async function agendaForDay(neighborhoodId: string, day: string): Promise<AgendaRow[]> {
  // 0 = domingo, igual que weekdayInBuenosAires y que la columna weekdays.
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()

  const res = await db.execute(sql`
    select
      i.id,
      i.guest_name        as "guestName",
      i.guest_doc         as "guestDoc",
      i.plate,
      i.kind,
      u.label             as "unitLabel",
      p.name              as "inviterName",
      i.capacity,
      (select count(*) from invitation h
        where h.parent_id = i.id and h.revoked_at is null)::int as "joinedCount",
      (select count(*) from entry_log e
        where e.invitation_id = i.id
           or e.invitation_id in (select h.id from invitation h where h.parent_id = i.id))::int
        as "enteredCount",
      (select max(e.entered_at) from entry_log e
        where e.invitation_id = i.id
           or e.invitation_id in (select h.id from invitation h where h.parent_id = i.id))
        as "lastEntryAt"
    from invitation i
    join unit u on u.id = i.unit_id
    join person p on p.id = i.created_by
    where u.neighborhood_id = ${neighborhoodId}
      and i.parent_id is null            -- los anotados se ven dentro de su evento
      and i.revoked_at is null
      and ${day}::date between i.valid_from and i.valid_to
      and (i.weekdays is null or ${dow} = any(i.weekdays))
    order by i.kind = 'evento' desc, lower(i.guest_name)
  `)

  return res.rows as unknown as AgendaRow[]
}
