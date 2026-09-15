import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, people, units, unitMembers } from '../db/schema.js'
import { randomToken } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
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

  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id))
  await audit(personId, neighborhoodId, 'invitation.revoked', 'invitation', id)
}

/** Datos públicos del QR: lo mínimo. Nada de DNI ni de personas. */
export async function findPublicByToken(token: string) {
  const [row] = await db.select({
    guestName: invitations.guestName,
    kind: invitations.kind,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    revokedAt: invitations.revokedAt,
    unitLabel: units.label,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(eq(invitations.token, token))
    .limit(1)
  return row ?? null
}
