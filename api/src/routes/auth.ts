import { Router } from 'express'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { peekToken, consumeToken, requestPasswordReset } from '../services/auth.js'
import { setPassword } from '../services/people.js'
import { verifyPassword } from '../lib/crypto.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { unitsOfPerson, findOrCreateLot, joinUnit, personNeedsLot } from '../services/units.js'
import {
  createSession, setSessionCookie, clearSessionCookie, revokeSession,
} from '../services/sessions.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { AppError } from '../lib/errors.js'

export const authRoutes = Router()

const passwordSchema = z.string().min(10, 'La contraseña necesita al menos 10 caracteres')

// GET solo mira: si el escáner de links del cliente de mail pasa por acá, no
// consume nada y el vecino todavía puede usar su invitación.
authRoutes.get('/invite/:token', async (req, res) => {
  const row = await peekToken(req.params.token, 'invite')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ name: row.name, email: row.email })
})

authRoutes.post('/invite', async (req, res) => {
  const { token, password, lot } = z.object({
    token: z.string(),
    password: passwordSchema,
    // El vecino declara su lote al entrar. Numérico a propósito: derivar la
    // etiqueta de un número evita "lote 142" y "Lote 142" como dos unidades.
    lot: z.coerce.number().int().min(1).max(99999).optional(),
  }).parse(req.body)

  const personId = await consumeToken(token, 'invite')
  await setPassword(personId, password)

  const [person] = await db.update(people)
    .set({ status: 'active', lastLoginAt: new Date() })
    .where(eq(people.id, personId))
    .returning()

  // Solo los vecinos tienen lote, y solo si el admin no se lo asignó ya.
  if (lot && person.role === 'resident' && (await unitsOfPerson(personId)).length === 0) {
    const unidad = await findOrCreateLot(person.neighborhoodId, lot)
    await joinUnit(unidad.id, personId)
  }

  setSessionCookie(res, await createSession(personId, req.get('user-agent')))
  res.json({ ok: true })
})

/** Le dice a la pantalla de acceso si tiene que pedir el lote. */
authRoutes.get('/invite/:token/needs-lot', async (req, res) => {
  const row = await peekToken(req.params.token, 'invite')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ needsLot: await personNeedsLot(row.personId) })
})

const loginLimiter = rateLimit({
  max: 5,
  windowMs: 15 * 60_000,
  key: (req) => `login:${String(req.body?.email ?? '').toLowerCase()}`,
})

authRoutes.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)

  const [person] = await db.select().from(people)
    .where(and(eq(people.email, email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  // Mismo error en los tres casos (no existe, sin contraseña, contraseña mala):
  // no se filtra si el mail está en el padrón.
  if (!person?.passwordHash || !(await verifyPassword(person.passwordHash, password))) {
    throw new AppError(401, 'invalid_credentials')
  }

  await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, person.id))
  setSessionCookie(res, await createSession(person.id, req.get('user-agent')))
  res.json({ ok: true })
})

authRoutes.post('/forgot',
  rateLimit({ max: 3, windowMs: 15 * 60_000, key: (req) => `forgot:${String(req.body?.email ?? '')}` }),
  async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    // Se ignora el retorno a propósito: la respuesta es idéntica exista o no la cuenta.
    await requestPasswordReset(email)
    res.json({ ok: true })
  })

authRoutes.get('/reset/:token', async (req, res) => {
  const row = await peekToken(req.params.token, 'reset')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ name: row.name })
})

authRoutes.post('/reset', async (req, res) => {
  const { token, password } = z.object({ token: z.string(), password: passwordSchema }).parse(req.body)
  const personId = await consumeToken(token, 'reset')
  await setPassword(personId, password)
  setSessionCookie(res, await createSession(personId, req.get('user-agent')))
  res.json({ ok: true })
})

authRoutes.post('/logout', async (req, res) => {
  if (req.cookies?.sid) await revokeSession(req.cookies.sid)
  clearSessionCookie(res)
  res.json({ ok: true })
})

authRoutes.get('/me', requireAuth, async (req, res) => {
  res.json({ ...req.person, units: await unitsOfPerson(req.person!.id) })
})
