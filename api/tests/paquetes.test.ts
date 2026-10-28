import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, packages, pushSubscriptions } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import * as eventos from '../src/lib/eventos.js'
import { enviarPush } from '../src/lib/push.js'
import { avisarPaquete, avisarPendientes } from '../src/services/avisos.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

vi.mock('../src/lib/push.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/push.js')>()),
  enviarPush: vi.fn(async () => 'ok'),
}))

const app = buildApp()
const PASS = 'una-contrasena-larga'
const push = vi.mocked(enviarPush)

async function persona(nId: string, email: string, role: 'guard' | 'resident', status: 'active' | 'disabled' = 'active') {
  const [p] = await db.insert(people).values({
    neighborhoodId: nId, email, name: email, role, status, passwordHash: await hashPassword(PASS),
  }).returning()
  return p
}
const sub = (personId: string, n: string) =>
  db.insert(pushSubscriptions).values({ personId, endpoint: `https://fcm.googleapis.com/${n}`, p256dh: 'p', auth: 'a' })

async function cookie(email: string) {
  const r = await request(app).post('/auth/login').send({ email, password: PASS })
  return r.headers['set-cookie'] as unknown as string[]
}

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 12' }).returning()
  const [otra] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 13' }).returning()
  const guardia = await persona(n.id, 'garita@example.com', 'guard')
  const ana = await persona(n.id, 'ana@example.com', 'resident')
  const beto = await persona(n.id, 'beto@example.com', 'resident', 'disabled')
  const caro = await persona(n.id, 'caro@example.com', 'resident')
  await db.insert(unitMembers).values([
    { unitId: u.id, personId: ana.id }, { unitId: u.id, personId: beto.id }, { unitId: otra.id, personId: caro.id },
  ])
  return { n, u, otra, guardia, ana, beto, caro }
}

describe('paquetes', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits(); push.mockClear(); push.mockResolvedValue('ok') })
  afterEach(() => { vi.restoreAllMocks() })

  it('POST /gate/packages: 201 con notifyAt a 5 s; valida unidad, nota, feature y rol', async () => {
    const { n, u, ana } = await escenario()
    const c = await cookie('garita@example.com')
    const antes = Date.now()
    const r = await request(app).post('/gate/packages').set('Cookie', c).send({ unitId: u.id, note: 'caja grande' }).expect(201)
    expect(new Date(r.body.notifyAt).getTime() - antes).toBeGreaterThan(4000)
    expect(new Date(r.body.notifyAt).getTime() - antes).toBeLessThan(7000)

    const [otroBarrio] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [uAjena] = await db.insert(units).values({ neighborhoodId: otroBarrio.id, label: 'X' }).returning()
    const ajena = await request(app).post('/gate/packages').set('Cookie', c).send({ unitId: uAjena.id }).expect(403)
    expect(ajena.body.error).toBe('not_your_neighborhood')

    await request(app).post('/gate/packages').set('Cookie', c).send({ unitId: u.id, note: 'x'.repeat(81) }).expect(400)

    await request(app).post('/gate/packages').set('Cookie', await cookie(ana.email)).send({ unitId: u.id }).expect(403)

    await db.update(neighborhoods).set({ packagesEnabled: false }).where(eq(neighborhoods.id, n.id))
    const apagada = await request(app).post('/gate/packages').set('Cookie', c).send({ unitId: u.id }).expect(403)
    expect(apagada.body.error).toBe('paquetes_apagados')
  })

  it('cancel: antes del aviso no envía nada; dos veces 200; después 409; ajeno 404', async () => {
    const { u, ana } = await escenario()
    await sub(ana.id, 'a')
    const c = await cookie('garita@example.com')
    const { body } = await request(app).post('/gate/packages').set('Cookie', c).send({ unitId: u.id }).expect(201)
    await request(app).post(`/gate/packages/${body.id}/cancel`).set('Cookie', c).expect(200)
    await request(app).post(`/gate/packages/${body.id}/cancel`).set('Cookie', c).expect(200)
    await avisarPaquete(body.id)
    expect(push).not.toHaveBeenCalled()

    const [p2] = await db.insert(packages).values({ unitId: u.id, createdBy: (await db.select().from(people).where(eq(people.role, 'guard')))[0].id, notifyAt: new Date() }).returning()
    await avisarPaquete(p2.id)
    const r = await request(app).post(`/gate/packages/${p2.id}/cancel`).set('Cookie', c).expect(409)
    expect(r.body.error).toBe('ya_avisado')

    await request(app).post('/gate/packages/00000000-0000-4000-8000-000000000000/cancel').set('Cookie', c).expect(404)
  })

  it('avisarPaquete: push y SSE solo a vecinos activos de la unidad; marca; no reenvía; borra vencidas', async () => {
    const { u, ana, beto, caro, guardia } = await escenario()
    await sub(ana.id, 'ana'); await sub(beto.id, 'beto'); await sub(caro.id, 'caro')
    const emitir = vi.spyOn(eventos, 'emitir')
    const [p] = await db.insert(packages).values({ unitId: u.id, note: 'caja', createdBy: guardia.id, notifyAt: new Date() }).returning()

    await avisarPaquete(p.id)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0].endpoint).toContain('ana')
    expect(push.mock.calls[0][1]).toEqual({ titulo: 'Llegó un paquete', cuerpo: 'Lote 12 · caja', url: '/' })
    expect(emitir).toHaveBeenCalledTimes(1)
    expect(emitir.mock.calls[0][0]).toBe(ana.id)
    expect(emitir.mock.calls[0][1]).toBe('package')
    expect(emitir.mock.calls[0][2]).toMatchObject({ id: p.id, unitLabel: 'Lote 12', note: 'caja' })
    const [fila] = await db.select().from(packages).where(eq(packages.id, p.id))
    expect(fila.notifiedAt).not.toBeNull()

    await avisarPaquete(p.id)
    expect(push).toHaveBeenCalledTimes(1)

    push.mockResolvedValue('vencida')
    const [p2] = await db.insert(packages).values({ unitId: u.id, createdBy: guardia.id, notifyAt: new Date() }).returning()
    await avisarPaquete(p2.id)
    const subs = await db.select().from(pushSubscriptions)
    expect(subs.map((s) => s.personId).sort()).toEqual([beto.id, caro.id].sort())
  })

  it('avisarPendientes: avisa los vencidos sin avisar ni deshacer', async () => {
    const { u, guardia } = await escenario()
    const pasado = new Date(Date.now() - 60_000)
    const futuro = new Date(Date.now() + 60_000)
    const [venc] = await db.insert(packages).values({ unitId: u.id, createdBy: guardia.id, notifyAt: pasado }).returning()
    await db.insert(packages).values({ unitId: u.id, createdBy: guardia.id, notifyAt: pasado, canceledAt: pasado })
    await db.insert(packages).values({ unitId: u.id, createdBy: guardia.id, notifyAt: pasado, notifiedAt: pasado })
    await db.insert(packages).values({ unitId: u.id, createdBy: guardia.id, notifyAt: futuro })
    expect(await avisarPendientes()).toBe(1)
    const [f] = await db.select().from(packages).where(eq(packages.id, venc.id))
    expect(f.notifiedAt).not.toBeNull()
  })

  it('GET /packages y /packages/seen', async () => {
    const { u, otra, ana, guardia } = await escenario()
    const hace = (d: number) => new Date(Date.now() - d * 86_400_000)
    const base = { createdBy: guardia.id, notifyAt: hace(1) }
    await db.insert(packages).values([
      { ...base, unitId: u.id, note: 'reciente', notifiedAt: hace(1) },
      { ...base, unitId: u.id, note: 'viejo', notifiedAt: hace(31) },
      { ...base, unitId: u.id, note: 'deshecho', canceledAt: hace(1) },
      { ...base, unitId: u.id, note: 'pendiente' },
      { ...base, unitId: otra.id, note: 'ajeno', notifiedAt: hace(1) },
    ])
    const c = await cookie(ana.email)
    const r = await request(app).get('/packages').set('Cookie', c).expect(200)
    expect(r.body).toHaveLength(1)
    expect(r.body[0]).toMatchObject({ unitLabel: 'Lote 12', note: 'reciente', sinVer: true })

    await request(app).post('/packages/seen').set('Cookie', c).expect(200)
    const r2 = await request(app).get('/packages').set('Cookie', c).expect(200)
    expect(r2.body[0].sinVer).toBe(false)
  })

  it('GET /gate/packages/hoy: los avisados hoy del barrio', async () => {
    const { u, guardia } = await escenario()
    await db.insert(packages).values([
      { unitId: u.id, note: 'hoy', createdBy: guardia.id, notifyAt: new Date(), notifiedAt: new Date() },
      { unitId: u.id, note: 'ayer', createdBy: guardia.id, notifyAt: new Date(), notifiedAt: new Date(Date.now() - 2 * 86_400_000) },
      { unitId: u.id, note: 'sin avisar', createdBy: guardia.id, notifyAt: new Date() },
    ])
    const r = await request(app).get('/gate/packages/hoy').set('Cookie', await cookie('garita@example.com')).expect(200)
    expect(r.body).toHaveLength(1)
    expect(r.body[0]).toMatchObject({ unitLabel: 'Lote 12', note: 'hoy' })
    expect(r.body[0].notifiedAt).toBeTruthy()
  })
})
