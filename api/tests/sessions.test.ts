import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { sessions, people } from '../src/db/schema.js'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { createSession, resolveSession, revokeSession } from '../src/services/sessions.js'
import { setPassword, setGuardPassword } from '../src/services/people.js'
import { requestPasswordReset } from '../src/services/auth.js'
import { sha256, hashPassword } from '../src/lib/crypto.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'
import { resetDb, seedBasics } from './helpers/db.js'

describe('sesiones', () => {
  beforeEach(resetDb)

  it('crea una sesión y la resuelve', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId, 'vitest')
    const person = await resolveSession(token)
    expect(person?.id).toBe(personId)
    expect(person?.role).toBe('resident')
  })

  it('nunca guarda el token en claro', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    const [row] = await db.select().from(sessions).where(eq(sessions.personId, personId))
    expect(row.tokenHash).toBe(sha256(token))
    expect(row.tokenHash).not.toBe(token)
  })

  it('permite varias sesiones simultáneas del mismo usuario', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId, 'celular')
    const b = await createSession(personId, 'compu')
    expect(await resolveSession(a)).not.toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('revocar una sesión no afecta a la otra', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId)
    const b = await createSession(personId)
    await revokeSession(a)
    expect(await resolveSession(a)).toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('no resuelve la sesión de una persona deshabilitada', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
    expect(await resolveSession(token)).toBeNull()
  })

  it('un token inventado no resuelve nada', async () => {
    await seedBasics()
    expect(await resolveSession('no-existe')).toBeNull()
  })
})

describe('cambiar la contraseña cierra todas las sesiones', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const app = buildApp()
  const PASS = 'una-contrasena-larga'
  const NUEVA = 'otra-contrasena-larga'

  async function conCuenta(role: 'resident' | 'guard' = 'resident') {
    const { personId, neighborhoodId } = await seedBasics()
    await db.update(people)
      .set({ role, status: 'active', passwordHash: await hashPassword(PASS) })
      .where(eq(people.id, personId))
    const [p] = await db.select().from(people).where(eq(people.id, personId))
    return { personId, neighborhoodId, email: p.email }
  }

  const entrar = (email: string, password: string) =>
    request(app).post('/auth/login').send({ email, password })

  it('el admin le resetea la clave a un guardia y lo saca de la garita', async () => {
    const { personId, email, neighborhoodId } = await conCuenta('guard')

    const enLaGarita = await entrar(email, PASS).expect(200)
    const cookie = enLaGarita.headers['set-cookie']
    await request(app).get('/auth/me').set('Cookie', cookie).expect(200)

    // OJO: un segundo seedBasics() acá crea otra persona con el MISMO mail en
    // otro barrio, y el login —que busca solo por mail— puede agarrar esa. Es
    // el bug del login ambiguo, anotado en tests/aislamiento-barrios.test.ts.
    await setGuardPassword(personId, NUEVA, personId, neighborhoodId)

    // El guardia que estaba en la barrera queda afuera.
    await request(app).get('/auth/me').set('Cookie', cookie).expect(401)
    await entrar(email, NUEVA).expect(200)
  })

  it('el olvidé mi contraseña echa al que tenga el celular robado', async () => {
    const { email } = await conCuenta()

    const ladron = await entrar(email, PASS).expect(200)
    const suCookie = ladron.headers['set-cookie']

    const token = await requestPasswordReset(email)
    const reset = await request(app).post('/auth/reset')
      .send({ token, password: NUEVA }).expect(200)

    await request(app).get('/auth/me').set('Cookie', suCookie).expect(401)
    // Y quien hizo el reset queda adentro con la sesión nueva.
    await request(app).get('/auth/me').set('Cookie', reset.headers['set-cookie']).expect(200)
  })

  it('cierra TODOS los dispositivos, no solo uno', async () => {
    const { personId, email } = await conCuenta()
    const a = await createSession(personId, 'celular')
    const b = await createSession(personId, 'compu')
    const c = await createSession(personId, 'tablet')

    await setPassword(personId, NUEVA)

    for (const t of [a, b, c]) expect(await resolveSession(t)).toBeNull()
    await entrar(email, NUEVA).expect(200)
  })

  it('no toca las sesiones de otra persona', async () => {
    const { personId } = await conCuenta()
    const otra = await db.insert(people).values({
      neighborhoodId: (await db.select().from(people).where(eq(people.id, personId)))[0].neighborhoodId,
      email: 'otra@example.com', name: 'Otra', role: 'resident', status: 'active',
      passwordHash: await hashPassword(PASS),
    }).returning()

    const ajena = await createSession(otra[0].id)
    await setPassword(personId, NUEVA)
    expect(await resolveSession(ajena)).not.toBeNull()
  })
})
