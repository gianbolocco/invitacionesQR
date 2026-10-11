import { and, eq, isNull } from 'drizzle-orm'
import { db, pool } from './db/index.js'
import { authTokens, people } from './db/schema.js'
import { audit } from './lib/audit.js'
import { randomToken, sha256 } from './lib/crypto.js'
import { sendInviteMail } from './services/people.js'

async function resendAdminInvite(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) throw new Error('ADMIN_EMAIL no está configurado')

  const [admin] = await db.select().from(people).where(and(
    eq(people.email, email),
    eq(people.role, 'admin'),
    eq(people.status, 'invited'),
  )).limit(1)

  if (!admin) throw new Error(`No hay un admin invitado pendiente para ${email}`)

  const token = randomToken()
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(
    eq(authTokens.personId, admin.id),
    eq(authTokens.purpose, 'invite'),
    isNull(authTokens.usedAt),
  ))
  await db.insert(authTokens).values({
    personId: admin.id,
    tokenHash: sha256(token),
    purpose: 'invite',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  })

  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  console.log(`Link de alta: ${origin}/acceso?t=${token}`)
  await sendInviteMail(admin.email, admin.name, token)
  await audit(null, admin.neighborhoodId, 'person.reinvited', 'person', admin.id)
  console.log(`Invitación reemitida para ${email}`)
}

try {
  await resendAdminInvite()
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await pool.end()
}
