import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { auditLogs, entryLogs, invitations, neighborhoods, people, units, unitMembers } from '../src/db/schema.js'
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

  it('editar a un rubro que no lo pide borra el seguro', async () => {
    const { invitar, rubro, vecino } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), insurance: seguro }).expect(201)
    await request(app).patch(`/invitations/${inv.id}`).set('Cookie', vecino).send({ tradeId: await rubro('Agua') }).expect(200)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect([fila.insuranceCompany, fila.insurancePolicy, fila.insuranceExpiresOn]).toEqual([null, null, null])
  })

  it('el link público no puede borrar el seguro (null da 400)', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), insurance: seguro }).expect(201)
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: null }).expect(400)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(fila.insurancePolicy).toBe('AP-123')
  })

  it('el link público con seguro después de entrar da 409', async () => {
    const { invitar, rubro, u } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    await db.insert(entryLogs).values({ invitationId: inv.id, unitId: u.id, guestName: 'Pedro' })
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(409)
  })

  it('el link público con seguro en una visita da seguro_no_aplica', async () => {
    const { invitar } = await escenario()
    const { body: inv } = await invitar({ kind: 'visita' }).expect(201)
    const r = await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(400)
    expect(r.body.error).toBe('seguro_no_aplica')
  })

  it('una fecha inexistente da 400', async () => {
    const { invitar, rubro } = await escenario()
    await invitar({ tradeId: await rubro('Albañil', true), insurance: { ...seguro, expiresOn: '2026-02-30' } }).expect(400)
  })

  it('una fecha de mes 13 da 400 y no 500', async () => {
    const { invitar, rubro } = await escenario()
    await invitar({ tradeId: await rubro('Albañil', true), insurance: { ...seguro, expiresOn: '2026-13-45' } }).expect(400)
  })
})

describe('seguro del proveedor: barrera', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  async function conGuardia() {
    const e = await escenario()
    await db.insert(people).values({
      neighborhoodId: e.n.id, email: 'guardia@example.com', name: 'Guardia', role: 'guard', status: 'active',
      passwordHash: await hashPassword(PASS),
    })
    const r = await request(app).post('/auth/login').send({ email: 'guardia@example.com', password: PASS })
    return { ...e, guardia: r.headers['set-cookie'] as unknown as string[] }
  }
  const entrada = (invitationId: string, extra: object = {}) =>
    ({ invitationId, guestName: 'Pedro', guestDoc: '30111222', ...extra })

  it('el check de un albañil sin seguro trae no_insurance y los datos del seguro', async () => {
    const { guardia, invitar, rubro, admin } = await conGuardia()
    await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: 15 }).expect(200)
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const r = await request(app).get(`/gate/invitation/${inv.id}`).set('Cookie', guardia).expect(200)
    expect(r.body.check).toEqual({ ok: false, reason: 'no_insurance' })
    expect(r.body.invitation).toMatchObject({
      requiresInsurance: true, insuranceCompany: null, insurancePolicy: null, insuranceExpiresOn: null,
    })
    expect(r.body.insuranceWarnDays).toBe(15)
  })

  it('sin insurance la entrada da 409 no_insurance', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const r = await request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(inv.id)).expect(409)
    expect(r.body.error).toBe('no_insurance')
  })

  it('con insurance vigente entra, la invitación guarda el seguro y queda auditado', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(inv.id, { insurance: seguro })).expect(201)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(fila.insurancePolicy).toBe('AP-123')
    const [g] = await db.select().from(people).where(eq(people.email, 'guardia@example.com'))
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'invitation.insurance_updated'))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actorId: g.id, entityId: inv.id })
  })

  it('con insurance vencido da 409 insurance_expired y no deja nada guardado', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const r = await request(app).post('/gate/entries').set('Cookie', guardia)
      .send(entrada(inv.id, { insurance: { ...seguro, expiresOn: '2000-01-01' } })).expect(409)
    expect(r.body.error).toBe('insurance_expired')
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(fila.insurancePolicy).toBeNull()
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'invitation.insurance_updated'))).toHaveLength(0)
  })

  it('insurance en un rubro que no lo pide no se guarda', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Agua') }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(inv.id, { insurance: seguro })).expect(201)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(fila.insurancePolicy).toBeNull()
  })

  it('la auditoría y el Excel traen el seguro', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    await invitar({ tradeId: await rubro('Albañil', true), insurance: seguro }).expect(201)
    const r = await request(app).get('/gate/audit').set('Cookie', guardia).expect(200)
    expect(r.body.rows[0]).toMatchObject({ insuranceCompany: 'La Segunda', insurancePolicy: 'AP-123', insuranceExpiresOn: '2999-01-01' })
    await request(app).get('/gate/audit.xlsx').set('Cookie', guardia).expect(200)
  })
})

describe('seguro del proveedor: lista de vencimientos', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const en = (dias: number) => {
    const d = new Date(`${hoy}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
  }

  it('devuelve vencido, por vencer y sin cargar, y deja afuera el resto', async () => {
    const { admin, invitar, rubro, vecino } = await escenario()
    await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: 15 }).expect(200)
    const alba = await rubro('Albañil', true)
    const agua = await rubro('Agua')
    const con = (guestName: string, expiresOn: string) =>
      invitar({ tradeId: alba, guestName, insurance: { ...seguro, expiresOn } }).expect(201)
    await invitar({ tradeId: alba, guestName: 'Sin cargar' }).expect(201)
    await con('Por vencer', en(5))
    await con('Vencido', en(-3))
    await con('Lejano', en(100))
    const { body: anulada } = await con('Anulada', en(-3))
    await request(app).post(`/invitations/${anulada.id}/revoke`).set('Cookie', vecino).expect(200)
    await invitar({ tradeId: alba, guestName: 'De ventana', validFrom: en(-9), validTo: en(-8) }).expect(201)
    await invitar({ tradeId: agua, guestName: 'Agua' }).expect(201)

    const r = await request(app).get('/admin/insurance').set('Cookie', admin).expect(200)
    expect(r.body.map((f: { guestName: string; estado: string }) => [f.guestName, f.estado])).toEqual([
      ['Vencido', 'vencido'], ['Por vencer', 'por_vencer'], ['Sin cargar', 'sin_cargar'],
    ])
    expect(r.body[0]).toMatchObject({ tradeName: 'Albañil', unitLabel: 'Lote 1', company: 'La Segunda', policy: 'AP-123', expiresOn: en(-3) })
  })

  it('sin insuranceWarnDays no hay por vencer', async () => {
    const { admin, invitar, rubro } = await escenario()
    await invitar({ tradeId: await rubro('Albañil', true), insurance: { ...seguro, expiresOn: en(5) } }).expect(201)
    const r = await request(app).get('/admin/insurance').set('Cookie', admin).expect(200)
    expect(r.body).toEqual([])
  })
})
