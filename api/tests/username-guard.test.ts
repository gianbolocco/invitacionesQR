import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'
import { resetDb } from './helpers/db.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function adminCookie() {
  const [neighborhood] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  await db.insert(people).values({
    neighborhoodId: neighborhood.id,
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    status: 'active',
    passwordHash: await hashPassword(PASS),
  })
  const login = await request(app).post('/auth/login')
    .send({ email: 'admin@example.com', password: PASS })
  return login.headers['set-cookie']
}

describe('guardias con usuario y sin correo', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin crea el guardia activo sin email y puede entrar con su usuario', async () => {
    const cookie = await adminCookie()
    const alta = await request(app).post('/admin/guards').set('Cookie', cookie).send({
      name: 'Carlos Ruiz', username: 'CRuiz', password: PASS,
    }).expect(201)

    const [guard] = await db.select().from(people).where(eq(people.id, alta.body.id))
    expect(guard).toMatchObject({ email: null, username: 'cruiz', role: 'guard', status: 'active' })
    expect(guard.passwordHash).not.toBeNull()

    const login = await request(app).post('/auth/login')
      .send({ identifier: 'CRUIZ', password: PASS }).expect(200)
    const me = await request(app).get('/auth/me').set('Cookie', login.headers['set-cookie']).expect(200)
    expect(me.body).toMatchObject({ email: null, username: 'cruiz', role: 'guard' })
  })

  it('rechaza nombres de usuario repetidos sin crear una segunda cuenta', async () => {
    const cookie = await adminCookie()
    await request(app).post('/admin/guards').set('Cookie', cookie).send({
      name: 'Carlos Ruiz', username: 'cruiz', password: PASS,
    }).expect(201)

    const repetido = await request(app).post('/admin/guards').set('Cookie', cookie).send({
      name: 'Otro Guardia', username: 'CRUIZ', password: PASS,
    }).expect(409)
    expect(repetido.body.error).toBe('usuario_repetido')
    expect(await db.select().from(people).where(eq(people.role, 'guard'))).toHaveLength(1)
  })

  it('rechaza un usuario que no cumple el formato', async () => {
    const cookie = await adminCookie()
    await request(app).post('/admin/guards').set('Cookie', cookie).send({
      name: 'Carlos Ruiz', username: 'carlos ruiz', password: PASS,
    }).expect(400)
  })
})
