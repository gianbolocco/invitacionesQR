import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, units, people } from '../db/schema.js'
import { canEnter, type EntryCheck } from '../authz.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'

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
    unitId: invitations.unitId,
    unitLabel: units.label,
  }).from(invitations).innerJoin(units, eq(units.id, invitations.unitId)).where(where).limit(1)
  return row ?? null
}

async function usageOf(invitationId: string) {
  const [row] = await db.select({
    used: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${entryLogs.enteredAt})`,
  }).from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return { usedCount: row?.used ?? 0, lastEntryAt: row?.last ?? null }
}

type LoadedInvitation = NonNullable<Awaited<ReturnType<typeof loadForCheck>>>

async function buildCheck(invitation: LoadedInvitation) {
  const { usedCount, lastEntryAt } = await usageOf(invitation.id)
  const check: EntryCheck = canEnter(invitation, new Date(), usedCount)
  return { invitation, check, usedCount, lastEntryAt }
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
 * El SELECT ... FOR UPDATE sobre la invitación serializa a dos guardias
 * escaneando el mismo QR al mismo tiempo: sin eso, ambos leerían used=0.
 */
export async function registerEntry(
  invitationId: string,
  guardId: string | null,
  data: { guestName: string; guestDoc?: string; plate?: string; note?: string },
) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations)
      .where(eq(invitations.id, invitationId)).for('update').limit(1)
    if (!inv) throw new AppError(404, 'not_found')

    const [{ used }] = await tx.select({ used: sql<number>`count(*)::int` })
      .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))

    const check = canEnter(inv, new Date(), used)
    if (!check.ok) throw new AppError(409, check.reason)

    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: inv.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: data.guestDoc?.trim() || null,
      plate: data.plate?.trim().toUpperCase() || null,
      note: data.note?.trim() || null,
    }).returning()

    return entry
  })
}

/** Invitaciones todavía vigentes que matchean nombre, etiqueta de UF o patente. */
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
      or(ilike(invitations.guestName, q), ilike(units.label, q), ilike(invitations.plate, q)),
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
