import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { AppError } from '../src/lib/errors.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u1] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [u2] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 2' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'vecino@example.com', name: 'Vecino', role: 'resident', status: 'active',
    passwordHash: await hashPassword(PASS),
  }).returning()
  await db.insert(unitMembers).values({ unitId: u1.id, personId: vecino.id })
  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'guardia@example.com', name: 'Guardia', role: 'guard', status: 'active',
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'vecino@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'] as unknown as string[], n, u1, u2, guardia }
}

describe('pase de delivery: alta por el vecino', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })
  afterEach(() => { vi.useRealTimers() })

  it('crea un pase de 2 horas con el nombre de la app', async () => {
    const { cookie, u1 } = await escenario()
    const antes = Date.now()
    const res = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'pedidosya' }).expect(201)
    expect(res.body).toMatchObject({ kind: 'delivery', guestName: 'PedidosYa', capacity: 1, deliveryApp: 'pedidosya' })
    const dur = new Date(res.body.expiresAt).getTime() - antes
    expect(Math.abs(dur - 2 * 3_600_000)).toBeLessThan(10_000)
    expect(res.body.validTo).toBe(todayInBuenosAires(new Date(res.body.expiresAt)))
  })

  it('"otro" pide el detalle', async () => {
    const { cookie, u1 } = await escenario()
    const sin = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'otro' }).expect(400)
    expect(sin.body.error).toBe('falta_detalle')
    const con = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'otro', otro: 'Farmacia' }).expect(201)
    expect(con.body.guestName).toBe('Farmacia')
  })

  it('rechaza una unidad ajena', async () => {
    const { cookie, u2 } = await escenario()
    await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u2.id, app: 'rappi' }).expect(403)
  })

  it('el alta común no acepta kind delivery', async () => {
    const { cookie, u1 } = await escenario()
    const hoy = todayInBuenosAires()
    await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId: u1.id, kind: 'delivery', guestName: 'X', validFrom: hoy, validTo: hoy, capacity: 1,
    }).expect(400)
  })

  it('se puede revocar', async () => {
    const { cookie, u1 } = await escenario()
    const { body } = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'rappi' }).expect(201)
    await request(app).post(`/invitations/${body.id}/revoke`).set('Cookie', cookie).expect(200)
  })

  it('pasadas las 2 horas el ingreso se rechaza por vencido', async () => {
    const { cookie, u1, guardia } = await escenario()
    const { body } = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'rappi' }).expect(201)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + (2 * 60 + 1) * 60_000)
    const err = await registerEntry(body.id, guardia.id, { guestName: 'Rappi', guestDoc: '30111222' }).catch((e) => e)
    vi.useRealTimers()
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ status: 409, message: 'expired' })
  })

  it('con seguro del auto exigido, una patente sin seguro no entra', async () => {
    const { cookie, u1, guardia, n } = await escenario()
    await db.update(neighborhoods).set({ vehicleInsuranceRequired: true, vehicleInsuranceOverride: false })
      .where(eq(neighborhoods.id, n.id))
    const { body } = await request(app).post('/invitations/delivery').set('Cookie', cookie)
      .send({ unitId: u1.id, app: 'rappi' }).expect(201)
    const err = await registerEntry(body.id, guardia.id, { guestName: 'Rappi', guestDoc: '30111222', plate: 'AB 123 CD' }).catch((e) => e)
    expect(err).toMatchObject({ status: 409, message: 'no_vehicle_insurance' })
  })
})
