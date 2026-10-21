import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  for (const [email, role] of [['admin@example.com', 'admin'], ['vecino@example.com', 'resident']] as const) {
    await db.insert(people).values({
      neighborhoodId: n.id, email, name: email, role, status: 'active', passwordHash: await hashPassword(PASS),
    })
  }
  const entrar = async (email: string) => {
    const r = await request(app).post('/auth/login').send({ email, password: PASS })
    return r.headers['set-cookie'] as unknown as string[]
  }
  return { n, admin: await entrar('admin@example.com'), vecino: await entrar('vecino@example.com') }
}

const franjaOk = { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: null, trades: null }

describe('rubros y franjas de proveedores', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea un rubro y rechaza el duplicado sin importar mayúsculas', async () => {
    const { admin } = await escenario()
    await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Plomero' }).expect(201)
    const r = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'plomero' }).expect(400)
    expect(r.body.error).toBe('rubro_duplicado')
  })

  it('un rubro archivado sale de la lista del vecino pero sigue en la del admin', async () => {
    const { admin, vecino } = await escenario()
    const { body: t } = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Plomero' }).expect(201)
    await request(app).patch(`/admin/trades/${t.id}`).set('Cookie', admin).send({ archived: true }).expect(200)

    const v = await request(app).get('/invitations/trades').set('Cookie', vecino).expect(200)
    expect(v.body.trades).toEqual([])
    const a = await request(app).get('/admin/trades').set('Cookie', admin).expect(200)
    expect(a.body).toHaveLength(1)
    expect(a.body[0].archivedAt).toBeTruthy()
  })

  it('guarda las franjas y las devuelve en el GET', async () => {
    const { admin, vecino } = await escenario()
    await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ providerWindows: [franjaOk] }).expect(200)
    const r = await request(app).get('/admin/neighborhood').set('Cookie', admin).expect(200)
    expect(r.body.providerWindows).toEqual([franjaOk])
    const v = await request(app).get('/invitations/trades').set('Cookie', vecino).expect(200)
    expect(v.body.providerWindows).toEqual([franjaOk])
  })

  it.each([
    ['sin días', { days: [] }],
    ['desde mayor que hasta', { from: '17:00', to: '08:00' }],
    ['hora sin cero', { from: '8:00' }],
    ['rubro de otro barrio', { trades: ['00000000-0000-4000-8000-000000000000'] }],
  ])('franja inválida: %s', async (_n, cambio) => {
    const { admin } = await escenario()
    const r = await request(app).patch('/admin/neighborhood').set('Cookie', admin)
      .send({ providerWindows: [{ ...franjaOk, ...cambio }] }).expect(400)
    expect(r.body.error).toBe('franja_invalida')
  })
})
