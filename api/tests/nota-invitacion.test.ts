import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
}).format(new Date())

async function neighborhood() {
  const [n] = await db.select().from(neighborhoods).limit(1)
  return n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
}

async function resident(email: string, label: string) {
  const barrio = await neighborhood()
  const [u] = await db.insert(units).values({ neighborhoodId: barrio.id, label }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: barrio.id, email, name: email.split('@')[0], role: 'resident',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  const login = await request(app).post('/auth/login').send({ email, password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, personId: p.id }
}

async function guardia() {
  const barrio = await neighborhood()
  const [g] = await db.insert(people).values({
    neighborhoodId: barrio.id, email: 'garita@example.com', name: 'Rulo', role: 'guard',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], id: g.id }
}
type Cookie = Awaited<ReturnType<typeof resident>>['cookie']
const crear = (cookie: Cookie, unitId: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/invitations').set('Cookie', cookie).send({
    unitId, kind: 'visita', guestName: 'Juan Pérez', validFrom: DIA, validTo: DIA, capacity: 1, ...extra,
  })

describe('nota de la invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('se guarda recortada y vacía queda null', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    expect((await crear(v.cookie, v.unitId, { note: '  Viene en un Gol rojo ' })).body.note).toBe('Viene en un Gol rojo')
    expect((await crear(v.cookie, v.unitId, { note: '   ' })).body.note).toBeNull()
  })

  it('más de 140 caracteres es 400', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    expect((await crear(v.cookie, v.unitId, { note: 'x'.repeat(141) })).status).toBe(400)
  })

  it('se edita mientras está pendiente, no después de un ingreso', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const { body: inv } = await crear(v.cookie, v.unitId, { note: 'Deja un paquete' })
    const ok = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', v.cookie).send({ note: null })
    expect(ok.body.note).toBeNull()
    await registerEntry(inv.id, g.id, { guestName: 'Juan Pérez' })
    const no = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', v.cookie).send({ note: 'Otra' })
    expect(no.status).toBe(409)
    expect(no.body.error).toBe('ya_usada')
  })

  it('la ve la garita y el vecino, el invitado no', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const { body: inv } = await crear(v.cookie, v.unitId, { note: 'Es el plomero' })
    expect((await request(app).get(`/invitations/${inv.id}`).set('Cookie', v.cookie)).body.note).toBe('Es el plomero')
    expect((await request(app).get(`/gate/invitation/${inv.id}`).set('Cookie', g.cookie)).body.invitation.note).toBe('Es el plomero')
    expect((await request(app).get('/gate/agenda').set('Cookie', g.cookie)).body[0].note).toBe('Es el plomero')
    expect((await request(app).post('/gate/search').set('Cookie', g.cookie).send({ q: 'juan' })).body[0].note).toBe('Es el plomero')
    const pub = await request(app).get(`/invitations/public/${inv.token}`)
    expect(JSON.stringify(pub.body)).not.toContain('plomero')
  })

  it('el alta exprés lleva nota', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const res = await request(app).post('/gate/invitations').set('Cookie', g.cookie)
      .send({ unitId: v.unitId, guestName: 'Flete', guestDoc: '30123456', note: 'Va al fondo' })
    expect(res.body.note).toBe('Va al fondo')
  })
})
