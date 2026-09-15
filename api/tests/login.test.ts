import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, authTokens } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function activePerson(email = 'martin@example.com') {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email, name: 'Martín', role: 'resident',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  return p
}

describe('login con contraseña', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('entra con la contraseña correcta y devuelve la cookie', async () => {
    await activePerson()
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/)
  })

  it('rechaza la contraseña incorrecta sin decir si el mail existe', async () => {
    await activePerson()
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: 'incorrecta!!' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  it('devuelve el mismo error para un mail inexistente', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nadie@example.com', password: PASS })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  it('no deja entrar a una persona deshabilitada', async () => {
    const p = await activePerson()
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, p.id))
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(401)
  })

  it('corta al sexto intento fallido del mismo mail', async () => {
    await activePerson()
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').send({ email: 'martin@example.com', password: 'mal-mal-mal' })
    }
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(429)
  })

  it('/auth/me devuelve la persona logueada con sus UF', async () => {
    await activePerson()
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/auth/me').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Martín')
    expect(res.body.units).toEqual([])
  })

  it('/auth/forgot responde ok aunque el mail no exista', async () => {
    const res = await request(app).post('/auth/forgot').send({ email: 'nadie@example.com' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('/auth/forgot emite un token de reset para un mail real', async () => {
    const p = await activePerson()
    await request(app).post('/auth/forgot').send({ email: 'martin@example.com' }).expect(200)
    const [row] = await db.select().from(authTokens).where(eq(authTokens.personId, p.id))
    expect(row.purpose).toBe('reset')
  })

  it('el reset cambia la contraseña y deja la sesión abierta', async () => {
    await activePerson()
    // Emitimos el token vía el endpoint y lo recuperamos del log de la consola
    // no es posible: lo generamos directo por el servicio para poder usarlo.
    const { requestPasswordReset } = await import('../src/services/auth.js')
    const token = await requestPasswordReset('martin@example.com')
    expect(token).not.toBeNull()

    const res = await request(app).post('/auth/reset').send({ token, password: 'nueva-contrasena-larga' })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/)

    const login = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: 'nueva-contrasena-larga' })
    expect(login.status).toBe(200)
  })
})
