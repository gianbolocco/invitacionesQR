import { Router, type Request } from 'express'
import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { peekToken, consumeToken, requestPasswordReset } from '../services/auth.js'
import { setPassword } from '../services/people.js'
import { verifyPassword } from '../lib/crypto.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { unitsOfPerson, findOrCreateLot, joinUnit, lotInfoForPerson } from '../services/units.js'
import {
  createSession, setSessionCookie, clearSessionCookie, revokeSession,
} from '../services/sessions.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { AppError } from '../lib/errors.js'
import { contrasena } from '../lib/contrasena.js'

export const authRoutes = Router()


// GET solo mira: si el escáner de links del cliente de mail pasa por acá, no
// consume nada y el vecino todavía puede usar su invitación.
authRoutes.get('/invite/:token', async (req, res) => {
  const row = await peekToken(req.params.token, 'invite')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ name: row.name, email: row.email, ...await lotInfoForPerson(row.personId) })
})

authRoutes.post('/invite', async (req, res) => {
  const { token, password, lot } = z.object({
    token: z.string(),
    password: contrasena,
    // Si administración no lo asignó, el vecino declara el lote al entrar.
    // Numérico para que "lote 142" y "Lote 142" no terminen como unidades distintas.
    lot: z.coerce.number().int().min(1).max(99999).optional(),
  }).parse(req.body)

  const invite = await peekToken(token, 'invite')
  if (!invite) throw new AppError(400, 'invalid_token')
  const { needsLot } = await lotInfoForPerson(invite.personId)
  if (needsLot && lot === undefined) throw new AppError(400, 'lote_requerido')

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
  res.json(await lotInfoForPerson(row.personId))
})

const mailDe = (req: Request) => String(req.body?.email ?? '').toLowerCase().trim()
const identificadorDe = (req: Request) =>
  String(req.body?.identifier ?? req.body?.email ?? '').toLowerCase().trim()

/*
 * Dos límites, y los dos cuentan solo los intentos fallidos.
 *
 * Por IP + identificador y no por identificador solo: si no, cualquiera que supiera el
 * guardia lo dejaba afuera todo el turno con cinco contraseñas malas cada
 * quince minutos. Ahora el que se bloquea es el que prueba.
 *
 * Por IP sola, para el que prueba una contraseña contra muchos mails.
 */
const loginPorIdentificador = rateLimit({
  max: 5,
  windowMs: 15 * 60_000,
  key: (req) => `login:${req.ip}:${identificadorDe(req)}`,
  cuenta: (status) => status === 401,
})
const loginPorIp = rateLimit({
  max: 30,
  windowMs: 15 * 60_000,
  key: (req) => `login-ip:${req.ip}`,
  cuenta: (status) => status === 401,
})

authRoutes.post('/login', loginPorIp, loginPorIdentificador, async (req, res) => {
  const { identifier, email, password } = z.object({
    identifier: z.string().trim().min(1).max(254).optional(),
    // Se conserva `email` para pestañas con la versión anterior del front.
    email: z.string().trim().min(1).max(254).optional(),
    password: z.string(),
  }).refine((body) => body.identifier || body.email, { path: ['identifier'] }).parse(req.body)
  const login = (identifier ?? email!).toLowerCase().trim()

  const [person] = await db.select().from(people)
    .where(and(or(eq(people.email, login), eq(people.username, login)), eq(people.status, 'active')))
    .limit(1)

  // Mismo error en los tres casos: no se filtra si el mail/usuario está en el padrón.
  if (!person?.passwordHash || !(await verifyPassword(person.passwordHash, password))) {
    throw new AppError(401, 'invalid_credentials')
  }

  await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, person.id))
  setSessionCookie(res, await createSession(person.id, req.get('user-agent')))
  res.json({ ok: true })
})

authRoutes.post('/forgot',
  rateLimit({ max: 3, windowMs: 15 * 60_000, key: (req) => `forgot:${mailDe(req)}` }),
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
  const { token, password } = z.object({ token: z.string(), password: contrasena }).parse(req.body)
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
