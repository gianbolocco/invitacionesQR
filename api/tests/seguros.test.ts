import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { entryLogs, invitations, neighborhoods, people, providers, trades, units, vehicles } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'B', insuranceWarnDays: 15 }).returning()
  const crear = async (email: string, role: 'admin' | 'guard' | 'resident') => (await db.insert(people).values({
    neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning())[0]
  const g = await crear('julio@example.com', 'guard')
  await crear('admin@example.com', 'admin')
  const v = await crear('vecino@example.com', 'resident')
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 48' }).returning()
  const auto = (plate: string, expiresOn: string) => db.insert(vehicles).values({
    neighborhoodId: n.id, plate, insuranceCompany: 'La Caja', insurancePolicy: plate, insuranceExpiresOn: expiresOn, insuranceUpdatedBy: g.id,
  })
  return { n, g, v, u, auto, admin: await entrar('admin@example.com'), guardia: await entrar('julio@example.com'), vecino: await entrar('vecino@example.com') }
}

describe('seguros: listado de autos', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('ordena por vencimiento, calcula el estado y cuenta', async () => {
    const { admin, auto } = await escenario()
    await auto('AAA111', sumarDias(hoy, 200))
    await auto('BBB222', sumarDias(hoy, -1))
    await auto('CCC333', sumarDias(hoy, 5))
    const r = await request(app).get('/insurance/vehicles').set('Cookie', admin).expect(200)
    expect(r.body.rows.map((x: { plate: string; estado: string }) => [x.plate, x.estado]))
      .toEqual([['BBB222', 'vencido'], ['CCC333', 'por_vencer'], ['AAA111', 'vigente']])
    expect(r.body.counts).toEqual({ vencido: 1, por_vencer: 1, vigente: 1 })
    expect(r.body.rows[0]).toMatchObject({ company: 'La Caja', updatedByName: 'julio' })
    const f = await request(app).get('/insurance/vehicles?estado=vencido').set('Cookie', admin).expect(200)
    expect(f.body.rows).toHaveLength(1)
    expect(f.body.counts.vigente).toBe(1) // los conteos no miran el filtro de estado
    const b = await request(app).get('/insurance/vehicles?q=ccc 333').set('Cookie', admin).expect(200)
    expect(b.body.rows.map((x: { plate: string }) => x.plate)).toEqual(['CCC333'])
  })

  it('vence hoy vale (por vencer), venció ayer no; sin días de aviso nunca es por vencer', async () => {
    const { n, admin, auto } = await escenario()
    await auto('HOY111', hoy)
    await auto('AYER22', sumarDias(hoy, -1))
    const r = await request(app).get('/insurance/vehicles').set('Cookie', admin).expect(200)
    expect(r.body.rows.map((x: { plate: string; estado: string }) => [x.plate, x.estado]))
      .toEqual([['AYER22', 'vencido'], ['HOY111', 'por_vencer']])
    await db.update(neighborhoods).set({ insuranceWarnDays: null }).where(eq(neighborhoods.id, n.id))
    const s = await request(app).get('/insurance/vehicles').set('Cookie', admin).expect(200)
    expect(s.body.rows.find((x: { plate: string }) => x.plate === 'HOY111').estado).toBe('vigente')
  })

  it('trae el último ingreso y marca si entró autorizado sin seguro', async () => {
    const { u, g, auto, guardia } = await escenario()
    await auto('AE482KL', sumarDias(hoy, -14))
    const [inv] = await db.insert(invitations).values({
      unitId: u.id, createdBy: g.id, kind: 'visita', guestName: 'Hugo Ríos', validFrom: hoy, validTo: hoy, token: 't1',
    }).returning()
    await db.insert(entryLogs).values({ invitationId: inv.id, unitId: u.id, guardId: g.id, guestName: 'Hugo Ríos', plate: 'AE 482 KL', vehicleInsurance: 'vencido' })
    const r = await request(app).get('/insurance/vehicles').set('Cookie', guardia).expect(200)
    expect(r.body.rows[0].ultimoIngreso).toMatchObject({ guestName: 'Hugo Ríos', unitLabel: 'Lote 48', sinSeguro: true })
  })

  it('el vecino no lo ve', async () => {
    const { vecino } = await escenario()
    await request(app).get('/insurance/vehicles').set('Cookie', vecino).expect(403)
  })

  it('el admin no puede corregir, el guardia sí', async () => {
    const { admin, guardia } = await escenario()
    const seguro = { company: 'X', policy: 'Y', expiresOn: '2999-01-01' }
    await request(app).put('/gate/vehicles/insurance').set('Cookie', admin).send({ plate: 'AB123CD', insurance: seguro }).expect(403)
    await request(app).put('/gate/vehicles/insurance').set('Cookie', guardia).send({ plate: 'AB123CD', insurance: seguro }).expect(200)
  })

  it('exporta el Excel', async () => {
    const { admin, auto } = await escenario()
    await auto('AAA111', sumarDias(hoy, 200))
    const r = await request(app).get('/insurance/vehicles.xlsx').set('Cookie', admin).expect(200)
    expect(r.headers['content-type']).toMatch(/spreadsheetml/)
  })
})

describe('seguros: listado de proveedores', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('lista los que tienen seguro o cuyo rubro lo pide, con los lotes donde trabajan', async () => {
    const { n, u, v, admin } = await escenario()
    const [pide] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Gasista', requiresInsurance: true }).returning()
    const [noPide] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Plomero' }).returning()
    await db.insert(providers).values([
      { neighborhoodId: n.id, doc: '1', name: 'Con seguro', tradeId: pide.id, insuranceCompany: 'Sancor', insurancePolicy: 'P', insuranceExpiresOn: sumarDias(hoy, 3), insuranceSource: 'link' },
      { neighborhoodId: n.id, doc: '2', name: 'Sin cargar', tradeId: pide.id },
      { neighborhoodId: n.id, doc: '3', name: 'No aplica', tradeId: noPide.id },
    ])
    await db.insert(invitations).values({
      unitId: u.id, createdBy: v.id, kind: 'proveedor', tradeId: pide.id, guestName: 'Con seguro', guestDoc: ' 1. ',
      validFrom: hoy, validTo: sumarDias(hoy, 30), token: 't2',
    })
    const r = await request(app).get('/insurance/providers').set('Cookie', admin).expect(200)
    expect(r.body.rows.map((x: { name: string; estado: string }) => [x.name, x.estado]))
      .toEqual([['Con seguro', 'por_vencer'], ['Sin cargar', 'sin_cargar']])
    expect(r.body.rows[0]).toMatchObject({ tradeName: 'Gasista', lotes: ['Lote 48'], source: 'link' })
    expect(r.body.counts).toEqual({ vencido: 0, por_vencer: 1, vigente: 0, sin_cargar: 1 })
    const b = await request(app).get('/insurance/providers?q=sin car').set('Cookie', admin).expect(200)
    expect(b.body.rows.map((x: { name: string }) => x.name)).toEqual(['Sin cargar'])
    const x = await request(app).get('/insurance/providers.xlsx').set('Cookie', admin).expect(200)
    expect(x.headers['content-type']).toMatch(/spreadsheetml/)
  })

  it('el proveedor marca autorizado sin seguro por SU seguro, no por el del auto', async () => {
    const { n, u, g, admin } = await escenario()
    const [pide] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Gasista', requiresInsurance: true }).returning()
    await db.insert(providers).values({ neighborhoodId: n.id, doc: '7', name: 'Pedro', tradeId: pide.id })
    const [inv] = await db.insert(invitations).values({
      unitId: u.id, createdBy: g.id, kind: 'proveedor', tradeId: pide.id, guestName: 'Pedro', validFrom: hoy, validTo: hoy, token: 't3',
    }).returning()
    await db.insert(entryLogs).values({
      invitationId: inv.id, unitId: u.id, guardId: g.id, guestName: 'Pedro', guestDoc: '7',
      providerInsurance: 'vigente', vehicleInsurance: 'sin_cargar',
    })
    const r = await request(app).get('/insurance/providers').set('Cookie', admin).expect(200)
    expect(r.body.rows[0].ultimoIngreso).toMatchObject({ unitLabel: 'Lote 48', sinSeguro: false })
  })
})
