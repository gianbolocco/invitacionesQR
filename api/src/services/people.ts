import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people, unitMembers, authTokens, units } from '../db/schema.js'
import { randomToken, sha256, hashPassword } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { sendMail } from '../lib/mail.js'
import { AppError } from '../lib/errors.js'

const INVITE_DAYS = 7

export type CreatePersonInput = {
  neighborhoodId: string
  email: string
  name: string
  role: 'resident' | 'guard' | 'admin'
  unitIds: string[]
  actorId: string | null
}

export async function createPerson(input: CreatePersonInput) {
  const [person] = await db.insert(people).values({
    neighborhoodId: input.neighborhoodId,
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role,
    status: 'invited',
  }).returning()

  if (input.unitIds.length) {
    await db.insert(unitMembers).values(input.unitIds.map((unitId) => ({ unitId, personId: person.id })))
  }

  const inviteToken = await issueInviteToken(person.id)

  await audit(input.actorId, input.neighborhoodId, 'person.created', 'person', person.id, { role: input.role })
  await sendInviteMail(person.email, person.name, inviteToken)

  return { person, inviteToken }
}

async function issueInviteToken(personId: string): Promise<string> {
  const token = randomToken()
  await db.insert(authTokens).values({
    personId,
    tokenHash: sha256(token),
    purpose: 'invite',
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })
  return token
}

export async function sendInviteMail(email: string, name: string, token: string): Promise<void> {
  const url = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/acceso?t=${token}`
  await sendMail(
    email,
    'Ya podés gestionar las visitas de tu casa',
    `<p>Hola ${name}, la administración te dio de alta en el sistema de invitaciones.</p>
     <p><a href="${url}">Entrar y crear mi contraseña</a></p>
     <p>El link vence en ${INVITE_DAYS} días.</p>`,
  )
}

export async function setPassword(personId: string, plain: string): Promise<void> {
  await db.update(people).set({ passwordHash: await hashPassword(plain) }).where(eq(people.id, personId))
}

export async function listPeople(neighborhoodId: string) {
  const rows = await db.select({
    id: people.id, email: people.email, name: people.name, role: people.role,
    status: people.status, lastLoginAt: people.lastLoginAt,
    unitId: units.id, unitLabel: units.label,
  })
    .from(people)
    .leftJoin(unitMembers, eq(unitMembers.personId, people.id))
    .leftJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(people.neighborhoodId, neighborhoodId))

  // Una fila por (persona, UF) -> se agrupa en memoria. El padrón de un barrio
  // entra de sobra en RAM; no justifica un json_agg.
  const byId = new Map<string, {
    id: string; email: string; name: string; role: string; status: string
    lastLoginAt: Date | null; units: { id: string; label: string }[]
  }>()

  for (const r of rows) {
    const current = byId.get(r.id) ?? {
      id: r.id, email: r.email, name: r.name, role: r.role,
      status: r.status, lastLoginAt: r.lastLoginAt, units: [],
    }
    if (r.unitId && r.unitLabel) current.units.push({ id: r.unitId, label: r.unitLabel })
    byId.set(r.id, current)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function disablePerson(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'person.disabled', 'person', personId)
}

export async function resendInvite(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
  if (!person) throw new AppError(404, 'not_found')

  const token = await issueInviteToken(personId)
  await sendInviteMail(person.email, person.name, token)
  await audit(actorId, neighborhoodId, 'person.reinvited', 'person', personId)
}

export async function setGuardPassword(
  personId: string, plain: string, actorId: string, neighborhoodId: string,
): Promise<void> {
  await setPassword(personId, plain)
  await db.update(people).set({ status: 'active' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'guard.password_reset', 'person', personId)
}
