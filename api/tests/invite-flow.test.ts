import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, authTokens } from '../src/db/schema.js'
import { resetDb } from './helpers/db.js'
import { createPerson } from '../src/services/people.js'

const app = buildApp()

describe('alta por magic link', () => {
  beforeEach(resetDb)

  async function invitedPerson() {
    const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
    const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
    return createPerson({
      neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
      role: 'resident', unitIds: [u.id], actorId: null,
    })
  }

  it('crea la persona en estado invited y emite un token de invitación', async () => {
    const { person, inviteToken } = await invitedPerson()
    expect(person.status).toBe('invited')
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]+$/)

    const [row] = await db.select().from(authTokens).where(eq(authTokens.personId, person.id))
    expect(row.purpose).toBe('invite')
    expect(row.tokenHash).not.toBe(inviteToken)
  })

  it('GET no consume el token (los escáneres de mail no deben romper el alta)', async () => {
    const { inviteToken } = await invitedPerson()
    const res = await request(app).get(`/auth/invite/${inviteToken}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Martín')

    const segundo = await request(app).get(`/auth/invite/${inviteToken}`)
    expect(segundo.status).toBe(200)
  })

  it('POST consume el token, crea la contraseña y deja la sesión abierta', async () => {
    const { person, inviteToken } = await invitedPerson()
    const res = await request(app)
      .post('/auth/invite')
      .send({ token: inviteToken, password: 'una-contrasena-larga' })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/)

    const [row] = await db.select().from(people).where(eq(people.id, person.id))
    expect(row.status).toBe('active')
    expect(row.passwordHash).not.toBeNull()
    expect(row.lastLoginAt).not.toBeNull()
  })

  it('el token es de un solo uso', async () => {
    const { inviteToken } = await invitedPerson()
    await request(app).post('/auth/invite').send({ token: inviteToken, password: 'una-contrasena-larga' })
    const res = await request(app).post('/auth/invite').send({ token: inviteToken, password: 'otra-contrasena-larga' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_token')
  })

  it('rechaza contraseñas de menos de 10 caracteres', async () => {
    const { inviteToken } = await invitedPerson()
    const res = await request(app).post('/auth/invite').send({ token: inviteToken, password: 'corta' })
    expect(res.status).toBe(400)
  })

  it('logout revoca la sesión', async () => {
    const { inviteToken } = await invitedPerson()
    const alta = await request(app).post('/auth/invite')
      .send({ token: inviteToken, password: 'una-contrasena-larga' })
    const cookie = alta.headers['set-cookie']

    await request(app).post('/auth/logout').set('Cookie', cookie).expect(200)
    const res = await request(app).get('/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(401)
  })
})
