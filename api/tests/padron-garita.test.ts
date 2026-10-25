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

describe('padrón: el ingreso', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })
  const entrar = (guardia: string[], invitationId: string, extra: object = {}) =>
    request(app).post('/gate/entries').set('Cookie', guardia).send({ invitationId, guestName: 'Carlos', guestDoc: '30.123.456', ...extra })

  it('el guardia carga el seguro del auto, entra, y la segunda vez el auto pasa sin pedirlo', async () => {
    const { n, guardia, invitar, pedirAuto, veredicto } = await escenario()
    await pedirAuto()
    const primera = await invitar({ plate: 'AB 123 CD' })
    await entrar(guardia, primera.id, { plate: 'AB 123 CD' }).expect(409)
    const r = await entrar(guardia, primera.id, { plate: 'AB 123 CD', vehicleInsurance: seguro }).expect(201)
    expect(r.body.vehicleInsurance).toBe('vigente')
    const [v] = await db.select().from(vehicles).where(eq(vehicles.neighborhoodId, n.id))
    expect(v.plate).toBe('AB123CD')

    const segunda = await invitar({ plate: 'ab123cd' })
    expect((await veredicto(segunda.id, {}).expect(200)).body.check).toEqual({ ok: true })
  })

  it('un seguro del auto vencido no entra y no deja nada guardado', async () => {
    const { guardia, invitar, pedirAuto } = await escenario()
    await pedirAuto()
    const inv = await invitar({ plate: 'AB 123 CD' })
    const r = await entrar(guardia, inv.id, { plate: 'AB 123 CD', vehicleInsurance: vencido }).expect(409)
    expect(r.body.error).toBe('vehicle_insurance_expired')
    expect(await db.select().from(vehicles)).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'vehicle.insurance_updated'))).toHaveLength(0)
  })

  it('vehicleInsurance sin patente da 400', async () => {
    const { guardia, invitar } = await escenario()
    const inv = await invitar()
    await entrar(guardia, inv.id, { vehicleInsurance: seguro }).expect(400)
  })

  it('el ingreso de un proveedor lo deja en el padrón con su nombre, rubro y seguro', async () => {
    const { guardia, invitar, rubro, guardiaId } = await escenario()
    const tradeId = await rubro('Albañil', true)
    const inv = await invitar({ kind: 'proveedor', tradeId })
    const r = await entrar(guardia, inv.id, { guestName: 'Carlos Gómez', insurance: seguro }).expect(201)
    expect(r.body.providerInsurance).toBe('vigente')
    const [p] = await db.select().from(providers)
    expect(p).toMatchObject({ doc: '30123456', name: 'Carlos Gómez', tradeId, insurancePolicy: '4410-2231', insuranceSource: 'garita', insuranceUpdatedBy: guardiaId })
  })

  it('una visita no entra al padrón', async () => {
    const { guardia, invitar } = await escenario()
    const inv = await invitar()
    const r = await entrar(guardia, inv.id).expect(201)
    expect(r.body).toMatchObject({ providerInsurance: 'no_aplica', vehicleInsurance: 'no_aplica' })
    expect(await db.select().from(providers)).toHaveLength(0)
  })

  it('la foto del ingreso no cambia cuando el padrón se renueva', async () => {
    const { n, guardia, invitar, pedirAuto, admin } = await escenario()
    await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: 90 }).expect(200)
    await pedirAuto()
    const casiVence = { ...seguro, expiresOn: hoy }
    const inv = await invitar({ plate: 'AB 123 CD' })
    const { body: fila } = await entrar(guardia, inv.id, { plate: 'AB 123 CD', vehicleInsurance: casiVence }).expect(201)
    expect(fila.vehicleInsurance).toBe('por_vencer')
    await db.update(vehicles).set({ insuranceExpiresOn: '2999-01-01' }).where(eq(vehicles.neighborhoodId, n.id))
    const [despues] = await db.select().from(entryLogs).where(eq(entryLogs.id, fila.id))
    expect(despues.vehicleInsurance).toBe('por_vencer')
  })

  it('un alta exprés deja entrar un auto sin seguro si el barrio lo permite, y queda marcado', async () => {
    const { u, guardia, pedirAuto } = await escenario()
    await pedirAuto(true)
    const { body: alta } = await request(app).post('/gate/invitations').set('Cookie', guardia)
      .send({ unitId: u.id, guestName: 'Carlos', plate: 'AB 123 CD' }).expect(201)
    const r = await entrar(guardia, alta.id, { plate: 'AB 123 CD' }).expect(201)
    expect(r.body.vehicleInsurance).toBe('sin_cargar')
  })

  it('un alta exprés no deja entrar un auto sin seguro si el barrio no lo permite', async () => {
    const { u, guardia, pedirAuto } = await escenario()
    await pedirAuto(false)
    const { body: alta } = await request(app).post('/gate/invitations').set('Cookie', guardia)
      .send({ unitId: u.id, guestName: 'Carlos', plate: 'AB 123 CD' }).expect(201)
    expect((await entrar(guardia, alta.id, { plate: 'AB 123 CD' }).expect(409)).body.error).toBe('no_vehicle_insurance')
    await entrar(guardia, alta.id, { plate: '' }).expect(201)
  })
})

describe('padrón: corregir sin registrar', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el guardia corrige el seguro de un auto y queda auditado con el antes', async () => {
    const { guardia, guardiaId } = await escenario()
    await request(app).put('/gate/vehicles/insurance').set('Cookie', guardia).send({ plate: 'AB 123 CD', insurance: vencido }).expect(200)
    await request(app).put('/gate/vehicles/insurance').set('Cookie', guardia).send({ plate: 'ab123cd', insurance: seguro }).expect(200)
    const [v] = await db.select().from(vehicles)
    expect(v).toMatchObject({ plate: 'AB123CD', insuranceExpiresOn: seguro.expiresOn, insuranceUpdatedBy: guardiaId })
    const logs = await db.select().from(auditLogs)
      .where(eq(auditLogs.action, 'vehicle.insurance_updated'))
      .orderBy(auditLogs.at)
    expect(logs.map((l) => l.meta)).toEqual([
      { plate: 'AB123CD', antes: null, despues: vencido },
      { plate: 'AB123CD', antes: vencido, despues: seguro },
    ])
  })

  it('el guardia corrige el seguro de un proveedor', async () => {
    const { guardia } = await escenario()
    await request(app).put('/gate/providers/insurance').set('Cookie', guardia)
      .send({ doc: '30.123.456', name: 'Carlos', insurance: seguro }).expect(200)
    const [p] = await db.select().from(providers)
    expect(p).toMatchObject({ doc: '30123456', insuranceSource: 'garita' })
  })

  it('una patente o un DNI vacíos dan 400', async () => {
    const { guardia } = await escenario()
    await request(app).put('/gate/vehicles/insurance').set('Cookie', guardia).send({ plate: ' - ', insurance: seguro }).expect(400)
    const r = await request(app).put('/gate/providers/insurance').set('Cookie', guardia).send({ doc: '..', name: 'C', insurance: seguro }).expect(400)
    expect(r.body.error).toBe('doc_required')
  })

  it('un vecino no puede corregir', async () => {
    const { vecino } = await escenario()
    await request(app).put('/gate/vehicles/insurance').set('Cookie', vecino).send({ plate: 'AB123CD', insurance: seguro }).expect(403)
  })
})

describe('padrón: switches del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin prende el pedido del seguro del auto y apaga la excepción', async () => {
    const { admin } = await escenario()
    const antes = await request(app).get('/admin/neighborhood').set('Cookie', admin).expect(200)
    expect(antes.body).toMatchObject({ vehicleInsuranceRequired: false, vehicleInsuranceOverride: true })
    const r = await request(app).patch('/admin/neighborhood').set('Cookie', admin)
      .send({ vehicleInsuranceRequired: true, vehicleInsuranceOverride: false }).expect(200)
    expect(r.body).toMatchObject({ vehicleInsuranceRequired: true, vehicleInsuranceOverride: false })
  })
})
