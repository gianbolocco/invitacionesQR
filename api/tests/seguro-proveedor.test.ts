import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { invitations, neighborhoods, people, units, unitMembers } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()
const seguro = { company: 'La Segunda', policy: 'AP-123', expiresOn: '2999-01-01' }

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
  const admin = await entrar('admin@example.com')
  const vecino = await entrar('vecino@example.com')
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [v] = await db.select().from(people).where(eq(people.email, 'vecino@example.com'))
  await db.insert(unitMembers).values({ unitId: u.id, personId: v.id })
  const rubro = async (name: string, requiresInsurance = false) => {
    const id = (await request(app).post('/admin/trades').set('Cookie', admin).send({ name }).expect(201)).body.id as string
    if (requiresInsurance) {
      await request(app).patch(`/admin/trades/${id}`).set('Cookie', admin).send({ requiresInsurance }).expect(200)
    }
    return id
  }
  const invitar = (extra: object) => request(app).post('/invitations').set('Cookie', vecino).send({
    unitId: u.id, kind: 'proveedor', guestName: 'Pedro', validFrom: hoy, validTo: hoy, capacity: 1, ...extra,
  })
  return { n, admin, vecino, u, rubro, invitar }
}

describe('seguro del proveedor: configuración', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el rubro guarda requiresInsurance y el vecino lo ve por rubro', async () => {
    const { admin, vecino, rubro } = await escenario()
    const alba = await rubro('Albañil', true)
    const agua = await rubro('Agua')
    const a = await request(app).get('/admin/trades').set('Cookie', admin).expect(200)
    expect(a.body.find((t: { id: string }) => t.id === alba).requiresInsurance).toBe(true)
    const v = await request(app).get('/invitations/trades').set('Cookie', vecino).expect(200)
    const por = Object.fromEntries(v.body.trades.map((t: { id: string; requiresInsurance: boolean }) => [t.id, t.requiresInsurance]))
    expect(por).toEqual({ [alba]: true, [agua]: false })
  })

  it('insuranceWarnDays se guarda y rechaza 0 y 91', async () => {
    const { admin } = await escenario()
    const r = await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: 15 }).expect(200)
    expect(r.body.insuranceWarnDays).toBe(15)
    for (const dias of [0, 91]) {
      await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: dias }).expect(400)
    }
  })
})

describe('seguro del proveedor: carga en la invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el alta con seguro completo lo guarda', async () => {
    const { invitar, rubro } = await escenario()
    const r = await invitar({ tradeId: await rubro('Albañil', true), insurance: seguro }).expect(201)
    expect(r.body).toMatchObject({
      insuranceCompany: 'La Segunda', insurancePolicy: 'AP-123', insuranceExpiresOn: '2999-01-01',
    })
  })

  it('el seguro a medias lo rechaza zod', async () => {
    const { invitar, rubro } = await escenario()
    const tradeId = await rubro('Albañil', true)
    await invitar({ tradeId, insurance: { company: 'La Segunda' } }).expect(400)
  })

  it('seguro en un rubro que no lo pide: seguro_no_aplica', async () => {
    const { invitar, rubro } = await escenario()
    const r = await invitar({ tradeId: await rubro('Agua'), insurance: seguro }).expect(400)
    expect(r.body.error).toBe('seguro_no_aplica')
  })

  it('el invitado lo carga por el link y la página pública no filtra los datos', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const antes = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(antes.body).toMatchObject({ requiresInsurance: true, insuranceState: 'sin_cargar' })

    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    const r = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(r.body).toMatchObject({ requiresInsurance: true, insuranceState: 'vigente' })
    expect(JSON.stringify(r.body)).not.toMatch(/La Segunda|AP-123|insuranceCompany|insurancePolicy/)

    await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ insurance: { ...seguro, expiresOn: '2000-01-01' } }).expect(200)
    const v = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(v.body.insuranceState).toBe('vencido')
  })

  it('editar a visita borra el seguro', async () => {
    const { invitar, rubro, vecino } = await escenario()
    const { body: inv } = await invitar({
      kind: 'frecuente', frequentAs: 'proveedor', tradeId: await rubro('Albañil', true), insurance: seguro,
    }).expect(201)
    await request(app).patch(`/invitations/${inv.id}`).set('Cookie', vecino).send({ frequentAs: 'visita' }).expect(200)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect([fila.insuranceCompany, fila.insurancePolicy, fila.insuranceExpiresOn]).toEqual([null, null, null])
  })
})
