import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { contacts, invitations, neighborhoods, people, providers, trades, units, unitMembers } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
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
    expect(body[0]).not.toHaveProperty('insuranceCompany')
    expect(body[0]).not.toHaveProperty('insurancePolicy')
  })

  it('edita y borra', async () => {
    const { sAna } = await escenario()
    const { body: c } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Rosa' }).expect(201)
    const r = await request(app).patch(`/contacts/${c.id}`).set('Cookie', sAna).send({ name: 'Rosa B.', doc: '1' }).expect(200)
    expect(r.body).toMatchObject({ name: 'Rosa B.', doc: '1' })
    const sinCambios = await request(app).patch(`/contacts/${c.id}`).set('Cookie', sAna).send({}).expect(200)
    expect(sinCambios.body).toEqual(r.body)
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

  it('un vecino con dos casas guarda el contacto en la que elige', async () => {
    const { l2, ana, sAna, sBeto, sCarla } = await escenario()
    await db.insert(unitMembers).values({ unitId: l2.id, personId: ana.id })
    const r = await request(app).post('/contacts').set('Cookie', sAna).send({ unitId: l2.id, kind: 'visita', name: 'Rosa' }).expect(201)
    expect(r.body.unitId).toBe(l2.id)
    expect((await request(app).get('/contacts').set('Cookie', sCarla).expect(200)).body).toHaveLength(1)
    expect((await request(app).get('/contacts').set('Cookie', sBeto).expect(200)).body).toHaveLength(0)
  })

  it('sin sesión, 401', async () => {
    await request(app).get('/contacts').expect(401)
  })
})

describe('contactos: el DNI que llega después', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const hoy = todayInBuenosAires()
  const invitar = (s: string[], unitId: string, extra: object = {}) => request(app).post('/invitations').set('Cookie', s)
    .send({ unitId, kind: 'visita', guestName: 'Rosa', validFrom: hoy, validTo: hoy, capacity: 1, ...extra })
  const contactosDe = async (s: string[]) => (await request(app).get('/contacts').set('Cookie', s).expect(200)).body
  async function conGuardia() {
    const e = await escenario()
    await db.insert(people).values({
      neighborhoodId: e.n.id, email: 'guardia@example.com', name: 'Guardia', role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
    })
    const guardia = (await request(app).post('/auth/login').send({ email: 'guardia@example.com', password: PASS })).headers['set-cookie'] as unknown as string[]
    return { ...e, guardia }
  }

  it('"guardar en contactos" crea el contacto vinculado; si la invitación falla, no crea nada', async () => {
    const { l1, sAna } = await escenario()
    const { body: inv } = await invitar(sAna, l1.id, { saveContact: true }).expect(201)
    const [c] = await contactosDe(sAna)
    expect(c).toMatchObject({ kind: 'visita', name: 'Rosa', doc: null })
    expect(inv.contactId).toBe(c.id)

    await invitar(sAna, l1.id, { saveContact: true, kind: 'frecuente', validTo: '2999-01-01', guestName: 'Otra' }).expect(400)
    expect(await contactosDe(sAna)).toHaveLength(1)
  })

  it('un contacto de otra casa no se puede usar', async () => {
    const { l2, sAna, sCarla } = await escenario()
    const { body: c } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Rosa' }).expect(201)
    const r = await invitar(sCarla, l2.id, { contactId: c.id }).expect(404)
    expect(r.body.error).toBe('contact_not_found')
  })

  it('el DNI del link no llega al contacto hasta que la garita lo registra', async () => {
    const { l1, sAna, guardia } = await conGuardia()
    const { body: inv } = await invitar(sAna, l1.id, { saveContact: true }).expect(201)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    await request(app).patch(`/invitations/public/${fila.token}`).send({ guestDoc: '28.443.120' }).expect(200)
    expect((await contactosDe(sAna))[0].doc).toBeNull()

    await request(app).post('/gate/entries').set('Cookie', guardia).send({ invitationId: inv.id, guestName: 'Rosa', guestDoc: '28.443.120', plate: '' }).expect(201)
    expect((await contactosDe(sAna))[0].doc).toBe('28.443.120')
  })

  it('el DNI que carga la garita completa el contacto; uno ya escrito no se pisa', async () => {
    const { l1, sAna, guardia } = await conGuardia()
    const { body: sinDni } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Rosa' }).expect(201)
    const { body: conDni } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Sara', doc: '1.111.111' }).expect(201)
    const { body: a } = await invitar(sAna, l1.id, { contactId: sinDni.id }).expect(201)
    const { body: b } = await invitar(sAna, l1.id, { contactId: conDni.id, guestName: 'Sara' }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send({ invitationId: a.id, guestName: 'Rosa', guestDoc: '28443120', plate: '' }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send({ invitationId: b.id, guestName: 'Sara', guestDoc: '22.222.222', plate: '' }).expect(201)
    const docs = Object.fromEntries((await contactosDe(sAna)).map((c: { name: string; doc: string }) => [c.name, c.doc]))
    expect(docs).toEqual({ Rosa: '28443120', Sara: '1.111.111' })
  })

  it('borrar el contacto deja la invitación sin vínculo', async () => {
    const { l1, sAna } = await escenario()
    const { body: inv } = await invitar(sAna, l1.id, { saveContact: true }).expect(201)
    await request(app).delete(`/contacts/${inv.contactId}`).set('Cookie', sAna).expect(200)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(fila.contactId).toBeNull()
  })
})
