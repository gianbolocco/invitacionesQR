import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { neighborhoods, people, units, unitMembers } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
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

  it('un rubro se puede crear pidiendo seguro; sin decirlo, no lo pide', async () => {
    const { admin } = await escenario()
    const gasista = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Gasista', requiresInsurance: true }).expect(201)
    const flete = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Flete' }).expect(201)
    expect([gasista.body.requiresInsurance, flete.body.requiresInsurance]).toEqual([true, false])
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

describe('rubro en la invitación y horario en la barrera', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  // Siempre cerrada salvo el minuto de medianoche (BA): el test solo se rompería a las 00:00.
  const cerrada = { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:01', season: null, trades: null }
  const hoy = todayInBuenosAires()

  async function barrera() {
    const base = await escenario()
    const [u] = await db.insert(units).values({ neighborhoodId: base.n.id, label: 'Lote 1' }).returning()
    const [v] = await db.select().from(people).where(eq(people.email, 'vecino@example.com'))
    await db.insert(unitMembers).values({ unitId: u.id, personId: v.id })
    await db.insert(people).values({
      neighborhoodId: base.n.id, email: 'garita@example.com', name: 'Garita', role: 'guard',
      status: 'active', passwordHash: await hashPassword(PASS),
    })
    const l = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
    const garita = l.headers['set-cookie'] as unknown as string[]
    const invitar = (extra: object) => request(app).post('/invitations').set('Cookie', base.vecino).send({
      unitId: u.id, kind: 'proveedor', guestName: 'Pedro', validFrom: hoy, validTo: hoy, capacity: 1, ...extra,
    })
    const rubro = async (name: string) =>
      (await request(app).post('/admin/trades').set('Cookie', base.admin).send({ name }).expect(201)).body.id as string
    const franjas = (providerWindows: object[]) =>
      request(app).patch('/admin/neighborhood').set('Cookie', base.admin).send({ providerWindows }).expect(200)
    return { ...base, u, garita, invitar, rubro, franjas }
  }

  it('con rubros cargados el proveedor exige rubro; sin rubros no', async () => {
    const { invitar, rubro } = await barrera()
    await invitar({}).expect(201)
    await rubro('Plomero')
    const r = await invitar({}).expect(400)
    expect(r.body.error).toBe('rubro_requerido')
  })

  it('rubro_invalido en visita, frecuente de visita y rubro archivado', async () => {
    const { invitar, rubro, admin } = await barrera()
    const t = await rubro('Plomero')
    for (const extra of [{ kind: 'visita' }, { kind: 'frecuente', frequentAs: 'visita' }]) {
      const r = await invitar({ ...extra, tradeId: t }).expect(400)
      expect(r.body.error).toBe('rubro_invalido')
    }
    await request(app).patch(`/admin/trades/${t}`).set('Cookie', admin).send({ archived: true }).expect(200)
    const r = await invitar({ tradeId: t }).expect(400)
    expect(r.body.error).toBe('rubro_invalido')
  })

  it('una frecuente como proveedor acepta rubro', async () => {
    const { invitar, rubro } = await barrera()
    const t = await rubro('Jardinero')
    const r = await invitar({ kind: 'frecuente', frequentAs: 'proveedor', tradeId: t }).expect(201)
    expect(r.body.tradeId).toBe(t)
  })

  it('fuera de franja: check y alta de ingreso rechazan; con [] pasa; la visita pasa', async () => {
    const { invitar, rubro, franjas, garita } = await barrera()
    const t = await rubro('Plomero')
    const prov = (await invitar({ tradeId: t }).expect(201)).body
    const vis = (await invitar({ kind: 'visita' }).expect(201)).body
    await franjas([cerrada])

    const c = await request(app).get(`/gate/check/${prov.token}`).set('Cookie', garita).expect(200)
    expect(c.body.check).toEqual({ ok: false, reason: 'outside_hours' })
    expect(c.body.invitation.tradeName).toBe('Plomero')
    expect(c.body.franjas).toEqual([cerrada])
    expect(c.body.invitation.providerWindows).toBeUndefined()
    const ingreso = (id: string) => request(app).post('/gate/entries').set('Cookie', garita)
      .send({ invitationId: id, guestName: 'Pedro', guestDoc: '123' })
    const e = await ingreso(prov.id).expect(409)
    expect(e.body.error).toBe('outside_hours')

    const cv = await request(app).get(`/gate/check/${vis.token}`).set('Cookie', garita).expect(200)
    expect(cv.body.check).toEqual({ ok: true })
    await ingreso(vis.id).expect(201)

    await franjas([])
    await ingreso(prov.id).expect(201)
  })

  it('la página pública y la búsqueda traen el rubro', async () => {
    const { invitar, rubro, franjas, garita } = await barrera()
    const t = await rubro('Plomero')
    const prov = (await invitar({ tradeId: t }).expect(201)).body
    await franjas([cerrada])
    const p = await request(app).get(`/invitations/public/${prov.token}`).expect(200)
    expect(p.body.tradeName).toBe('Plomero')
    expect(p.body.franjas).toEqual([cerrada])
    const s = await request(app).post('/gate/search').set('Cookie', garita).send({ q: 'Pedro' }).expect(200)
    expect(JSON.stringify(s.body)).toContain('Plomero')
  })

  it('las visitas no reciben franjas de proveedor', async () => {
    const { invitar, franjas, garita } = await barrera()
    const vis = (await invitar({ kind: 'visita' }).expect(201)).body
    const fre = (await invitar({ kind: 'frecuente', frequentAs: 'visita' }).expect(201)).body
    await franjas([cerrada])
    const c = await request(app).get(`/gate/check/${vis.token}`).set('Cookie', garita).expect(200)
    expect(c.body.franjas).toEqual([])
    const p = await request(app).get(`/invitations/public/${fre.token}`).expect(200)
    expect(p.body.franjas).toEqual([])
  })

  it('editar una frecuente con el rubro archivado no lo revalida si no cambia', async () => {
    const { invitar, rubro, vecino, admin } = await barrera()
    const t = await rubro('Plomero')
    const fre = (await invitar({ kind: 'frecuente', frequentAs: 'proveedor', tradeId: t }).expect(201)).body
    await request(app).patch(`/admin/trades/${t}`).set('Cookie', admin).send({ archived: true }).expect(200)
    const r = await request(app).patch(`/invitations/${fre.id}`).set('Cookie', vecino)
      .send({ guestName: 'otro', frequentAs: 'proveedor' }).expect(200)
    expect(r.body.tradeId).toBe(t)
  })

  it('editar el rubro', async () => {
    const { invitar, rubro, vecino } = await barrera()
    const t = await rubro('Plomero')
    const editar = (id: string, body: object) =>
      request(app).patch(`/invitations/${id}`).set('Cookie', vecino).send(body)

    const fre = (await invitar({ kind: 'frecuente', frequentAs: 'proveedor', tradeId: t }).expect(201)).body
    const r = await editar(fre.id, { frequentAs: 'visita' }).expect(200)
    expect(r.body.tradeId).toBeNull()

    const prov = (await invitar({ tradeId: t }).expect(201)).body
    expect((await editar(prov.id, { tradeId: null }).expect(400)).body.error).toBe('rubro_requerido')

    const vis = (await invitar({ kind: 'visita' }).expect(201)).body
    expect((await editar(vis.id, { tradeId: t }).expect(400)).body.error).toBe('rubro_invalido')
  })
})
