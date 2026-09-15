import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people, unitMembers, authTokens } from '../db/schema.js'
import { randomToken, sha256, hashPassword } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { sendMail } from '../lib/mail.js'

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
