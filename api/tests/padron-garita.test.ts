import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { auditLogs, entryLogs, neighborhoods, people, providers, units, unitMembers, vehicles } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()
const seguro = { company: 'La Caja', policy: '4410-2231', expiresOn: '2999-03-12' }
const vencido = { ...seguro, expiresOn: '2000-01-01' }

export async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  for (const [email, role] of [['admin@example.com', 'admin'], ['vecino@example.com', 'resident'], ['guardia@example.com', 'guard']] as const) {
    await db.insert(people).values({
      neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
    })
  }
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  const [admin, vecino, guardia] = await Promise.all(['admin@example.com', 'vecino@example.com', 'guardia@example.com'].map(entrar))
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [v] = await db.select().from(people).where(eq(people.email, 'vecino@example.com'))
  const [g] = await db.select().from(people).where(eq(people.email, 'guardia@example.com'))
  await db.insert(unitMembers).values({ unitId: u.id, personId: v.id })
  const rubro = async (name: string, requiresInsurance = false) => {
    const id = (await request(app).post('/admin/trades').set('Cookie', admin).send({ name }).expect(201)).body.id as string
    if (requiresInsurance) await request(app).patch(`/admin/trades/${id}`).set('Cookie', admin).send({ requiresInsurance }).expect(200)
    return id
  }
  const invitar = async (extra: object = {}) => (await request(app).post('/invitations').set('Cookie', vecino).send({
    unitId: u.id, kind: 'visita', guestName: 'Carlos', validFrom: hoy, validTo: hoy, capacity: 1, ...extra,
  }).expect(201)).body as { id: string; token: string }
  const pedirAuto = (override = true) => db.update(neighborhoods)
    .set({ vehicleInsuranceRequired: true, vehicleInsuranceOverride: override }).where(eq(neighborhoods.id, n.id))
  const veredicto = (id: string, body: object) =>
    request(app).post(`/gate/invitation/${id}/verdict`).set('Cookie', guardia).send(body)
  return { n, u, admin, vecino, guardia, guardiaId: g.id, rubro, invitar, pedirAuto, veredicto }
}

describe('padrón: el check de la garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('con el pedido apagado, un auto sin seguro pasa', async () => {
    const { invitar, veredicto } = await escenario()
    const inv = await invitar({ plate: 'AB 123 CD' })
    const r = await veredicto(inv.id, {}).expect(200)
    expect(r.body.check).toEqual({ ok: true })
    expect(r.body).toMatchObject({ vehicleInsuranceRequired: false, vehicle: null })
  })

  it('con el pedido prendido, un auto sin seguro no pasa y a pie sí', async () => {
    const { invitar, veredicto, pedirAuto } = await escenario()
    await pedirAuto()
    const inv = await invitar({ plate: 'AB 123 CD' })
    expect((await veredicto(inv.id, {}).expect(200)).body.check).toEqual({ ok: false, reason: 'no_vehicle_insurance' })
    expect((await veredicto(inv.id, { plate: '' }).expect(200)).body.check).toEqual({ ok: true })
  })

  it('la patente que tipea el guardia manda sobre la de la invitación, escrita como sea', async () => {
    const { n, invitar, veredicto, pedirAuto, guardiaId } = await escenario()
    await pedirAuto()
    await db.insert(vehicles).values({
      neighborhoodId: n.id, plate: 'AB123CD', insuranceCompany: 'La Caja', insurancePolicy: '4410-2231',
      insuranceExpiresOn: '2999-03-12', insuranceUpdatedBy: guardiaId,
    })
    const inv = await invitar({ plate: 'ZZ 999 ZZ' })
    const r = await veredicto(inv.id, { plate: 'ab-123 cd' }).expect(200)
    expect(r.body.check).toEqual({ ok: true })
    expect(r.body.vehicle).toMatchObject({ plate: 'AB123CD', insurance: seguro, updatedByName: 'guardia' })
  })

  it('el seguro del proveedor sale del padrón por el DNI cargado en la garita', async () => {
    const { n, invitar, rubro, veredicto } = await escenario()
    const tradeId = await rubro('Albañil', true)
    await db.insert(providers).values({
      neighborhoodId: n.id, doc: '30123456', name: 'Carlos', insuranceCompany: 'La Caja', insurancePolicy: '4410-2231',
      insuranceExpiresOn: '2999-03-12', insuranceSource: 'link',
    })
    const inv = await invitar({ kind: 'proveedor', tradeId })
    expect((await veredicto(inv.id, {}).expect(200)).body.check).toEqual({ ok: false, reason: 'no_insurance' })
    const r = await veredicto(inv.id, { doc: '30.123.456' }).expect(200)
    expect(r.body.check).toEqual({ ok: true })
    expect(r.body.provider).toMatchObject({ insurance: seguro, insuranceSource: 'link' })
    expect(r.body.invitation).toMatchObject({ insuranceCompany: 'La Caja', insuranceExpiresOn: '2999-03-12' })
  })

  it('trae la última patente con la que entró ese DNI', async () => {
    const { u, invitar, veredicto } = await escenario()
    const vieja = await invitar()
    await db.insert(entryLogs).values({ invitationId: vieja.id, unitId: u.id, guestName: 'Carlos', guestDoc: '30123456', plate: 'AB 123 CD' })
    const inv = await invitar()
    expect((await veredicto(inv.id, { doc: '30.123.456' }).expect(200)).body.lastPlate).toBe('AB 123 CD')
  })

  it('el veredicto en vivo no avisa a las garitas (es una lectura)', async () => {
    const { invitar, veredicto } = await escenario()
    const inv = await invitar()
    await veredicto(inv.id, { doc: '1' }).expect(200)
    expect(await db.select().from(auditLogs)).toHaveLength(0)
  })
})
