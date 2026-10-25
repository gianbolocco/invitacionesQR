import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { contacts, neighborhoods, people, providers, trades, units, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
  const crear = async (email: string, role: 'admin' | 'resident') => (await db.insert(people).values({
    neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning())[0]
  const admin = await crear('admin@example.com', 'admin')
  const ana = await crear('ana@example.com', 'resident')
  const beto = await crear('beto@example.com', 'resident')
  const carla = await crear('carla@example.com', 'resident')
  const [l1] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [l2] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 2' }).returning()
  // Ana y Beto viven juntos en el Lote 1; Carla en el 2.
  await db.insert(unitMembers).values([{ unitId: l1.id, personId: ana.id }, { unitId: l1.id, personId: beto.id }, { unitId: l2.id, personId: carla.id }])
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  return { n, l1, l2, ana, admin: await entrar('admin@example.com'), sAna: await entrar('ana@example.com'), sBeto: await entrar('beto@example.com'), sCarla: await entrar('carla@example.com') }
}

describe('contactos: tabla', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('una visita no lleva rubro', async () => {
    const { n, l1, ana } = await escenario()
    const [t] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Jardinero' }).returning()
    expect(await violatedConstraint(db.insert(contacts).values({
      unitId: l1.id, kind: 'visita', name: 'Rosa', tradeId: t.id, createdBy: ana.id,
    }))).toBe('contact_trade_ck')
  })
})

describe('contactos: API', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el vecino guarda una visita y los de su casa la ven; los de otra casa no', async () => {
    const { sAna, sBeto, sCarla } = await escenario()
    const r = await request(app).post('/contacts').set('Cookie', sAna)
      .send({ kind: 'visita', name: ' Rosa Benítez ', doc: '28.443.120' }).expect(201)
    expect(r.body).toMatchObject({ kind: 'visita', name: 'Rosa Benítez', doc: '28.443.120', insuranceState: 'no_aplica' })
    expect((await request(app).get('/contacts').set('Cookie', sBeto).expect(200)).body).toHaveLength(1)
    expect((await request(app).get('/contacts').set('Cookie', sCarla).expect(200)).body).toHaveLength(0)
    await request(app).patch(`/contacts/${r.body.id}`).set('Cookie', sCarla).send({ name: 'X' }).expect(404)
    await request(app).delete(`/contacts/${r.body.id}`).set('Cookie', sCarla).expect(404)
  })

  it('un proveedor trae el estado de su seguro del padrón, por DNI escrito como sea', async () => {
    const { n, admin, sAna } = await escenario()
    const { body: t } = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Jardinero' }).expect(201)
    await request(app).patch(`/admin/trades/${t.id}`).set('Cookie', admin).send({ requiresInsurance: true }).expect(200)
    await db.insert(providers).values({
      neighborhoodId: n.id, doc: '30112445', name: 'Carlos', insuranceCompany: 'Sancor', insurancePolicy: '1',
      insuranceExpiresOn: '2999-03-12', insuranceSource: 'link',
    })
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Carlos', doc: '30.112.445', tradeId: t.id }).expect(201)
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Hugo', tradeId: t.id }).expect(201)
    const { body } = await request(app).get('/contacts').set('Cookie', sAna).expect(200)
    expect(body.map((c: { name: string; insuranceState: string }) => [c.name, c.insuranceState]))
      .toEqual([['Carlos', 'vigente'], ['Hugo', 'sin_cargar']])
    expect(body[0]).toMatchObject({ tradeName: 'Jardinero', insuranceExpiresOn: '2999-03-12' })
    expect(JSON.stringify(body)).not.toMatch(/Sancor/)
  })

  it('edita y borra', async () => {
    const { sAna } = await escenario()
    const { body: c } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Rosa' }).expect(201)
    const r = await request(app).patch(`/contacts/${c.id}`).set('Cookie', sAna).send({ name: 'Rosa B.', doc: '1' }).expect(200)
    expect(r.body).toMatchObject({ name: 'Rosa B.', doc: '1' })
    await request(app).delete(`/contacts/${c.id}`).set('Cookie', sAna).expect(200)
    expect(await db.select().from(contacts)).toHaveLength(0)
  })

  it('valida: nombre vacío, rubro en una visita, rubro de otro barrio', async () => {
    const { sAna } = await escenario()
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: '  ' }).expect(400)
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [t] = await db.insert(trades).values({ neighborhoodId: otro.id, name: 'X' }).returning()
    const r = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Y', tradeId: t.id }).expect(400)
    expect(r.body.error).toBe('rubro_invalido')
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Y', tradeId: t.id }).expect(400)
  })

  it('un unitId que no es del vecino da 403', async () => {
    const { l2, sAna } = await escenario()
    await request(app).post('/contacts').set('Cookie', sAna).send({ unitId: l2.id, kind: 'visita', name: 'Rosa' }).expect(403)
  })

  it('sin sesión, 401', async () => {
    await request(app).get('/contacts').expect(401)
  })
})
