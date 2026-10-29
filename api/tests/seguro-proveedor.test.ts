import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { eq } from 'drizzle-orm'
import { auditLogs, entryLogs, invitations, neighborhoods, people, providers, units, unitMembers } from '../src/db/schema.js'
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

  it('el invitado lo carga por el link al padrón y la página pública no filtra los datos', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const antes = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(antes.body).toMatchObject({ requiresInsurance: true, insuranceState: 'sin_cargar', insuranceExpiresOn: null })

    const r0 = await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(400)
    expect(r0.body.error).toBe('doc_required')

    await request(app).patch(`/invitations/public/${inv.token}`).send({ guestDoc: '30.111.222', insurance: seguro }).expect(200)
    const r = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(r.body).toMatchObject({ requiresInsurance: true, insuranceState: 'vigente', insuranceExpiresOn: '2999-01-01' })
    expect(JSON.stringify(r.body)).not.toMatch(/La Segunda|AP-123|insuranceCompany|insurancePolicy/)
    const [p] = await db.select().from(providers)
    expect(p).toMatchObject({ doc: '30111222', name: 'Pedro', insuranceSource: 'link', insuranceUpdatedBy: null })

    await db.update(providers).set({ insuranceExpiresOn: '2000-01-01' })
    const v = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(v.body.insuranceState).toBe('vencido')
  })

  it('otra invitación del mismo DNI, de otro lote, ya ve el seguro vigente', async () => {
    const { invitar, rubro } = await escenario()
    const tradeId = await rubro('Albañil', true)
    const { body: a } = await invitar({ tradeId, guestDoc: '30.111.222' }).expect(201)
    await request(app).patch(`/invitations/public/${a.token}`).send({ insurance: seguro }).expect(200)
    const { body: b } = await invitar({ tradeId, guestDoc: '30111222' }).expect(201)
    expect((await request(app).get(`/invitations/public/${b.token}`).expect(200)).body.insuranceState).toBe('vigente')
  })

  it('el vecino ya no carga el seguro: la clave se ignora', async () => {
    const { invitar, rubro } = await escenario()
    await invitar({ tradeId: await rubro('Albañil', true), guestDoc: '1', insurance: seguro }).expect(201)
    expect(await db.select().from(providers)).toHaveLength(0)
  })

  it('el link público no puede borrar el seguro (null da 400)', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), guestDoc: '30111222' }).expect(201)
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: null }).expect(400)
    const [p] = await db.select().from(providers)
    expect(p.insurancePolicy).toBe('AP-123')
  })

  it('después de entrar el link renueva el seguro pero no el documento', async () => {
    const { invitar, rubro, u } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), guestDoc: '30111222' }).expect(201)
    await db.insert(entryLogs).values({ invitationId: inv.id, unitId: u.id, guestName: 'Pedro' })
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    const [p] = await db.select().from(providers)
    expect(p.insurancePolicy).toBe('AP-123')
    const r = await request(app).patch(`/invitations/public/${inv.token}`).send({ guestDoc: '111', insurance: seguro }).expect(409)
    expect(r.body.error).toBe('already_entered')
  })

  it('el link público no carga un vencimiento que ya pasó', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const r = await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ insurance: { ...seguro, expiresOn: '2000-01-01' } }).expect(400)
    expect(r.body.error).toBe('seguro_vencido')
  })

  it('el link no pisa un seguro vigente que verificó la guardia', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), guestDoc: '30111222' }).expect(201)
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    await db.update(providers).set({ insuranceSource: 'garita' })

    const r = await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ insurance: { ...seguro, policy: 'OTRA-9' } }).expect(409)
    expect(r.body.error).toBe('seguro_verificado')
    const [p] = await db.select().from(providers)
    expect(p).toMatchObject({ insurancePolicy: 'AP-123', insuranceSource: 'garita' })
    const g = await request(app).get(`/invitations/public/${inv.token}`).expect(200)
    expect(g.body.insuranceVerified).toBe(true)
    expect(JSON.stringify(g.body)).not.toMatch(/La Segunda|AP-123/)
  })

  it('si el seguro de la guardia venció, el link lo puede reemplazar', async () => {
    const { invitar, rubro } = await escenario()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true), guestDoc: '30111222' }).expect(201)
    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    await db.update(providers).set({ insuranceSource: 'garita', insuranceExpiresOn: '2000-01-01' })
    expect((await request(app).get(`/invitations/public/${inv.token}`).expect(200)).body.insuranceVerified).toBe(false)

    await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(200)
    const [p] = await db.select().from(providers)
    expect(p).toMatchObject({ insuranceSource: 'link', insuranceExpiresOn: '2999-01-01' })
  })

  it('el link público con seguro en una visita da seguro_no_aplica', async () => {
    const { invitar } = await escenario()
    const { body: inv } = await invitar({ kind: 'visita' }).expect(201)
    const r = await request(app).patch(`/invitations/public/${inv.token}`).send({ insurance: seguro }).expect(400)
    expect(r.body.error).toBe('seguro_no_aplica')
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

  it('con insurance vigente entra, el padrón guarda el seguro y queda auditado', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    await invitar({ tradeId: await rubro('Albañil', true) }).expect(201).then(({ body: inv }) =>
      request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(inv.id, { insurance: seguro })).expect(201))
    const [p] = await db.select().from(providers)
    expect(p.insurancePolicy).toBe('AP-123')
    const [g] = await db.select().from(people).where(eq(people.email, 'guardia@example.com'))
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'provider.insurance_updated'))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actorId: g.id, entityId: p.id })
  })

  it('con insurance vencido da 409 insurance_expired y no deja nada guardado', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Albañil', true) }).expect(201)
    const r = await request(app).post('/gate/entries').set('Cookie', guardia)
      .send(entrada(inv.id, { insurance: { ...seguro, expiresOn: '2000-01-01' } })).expect(409)
    expect(r.body.error).toBe('insurance_expired')
    expect(await db.select().from(providers)).toHaveLength(0)
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'provider.insurance_updated'))).toHaveLength(0)
  })

  it('insurance en un rubro que no lo pide no se guarda', async () => {
    const { guardia, invitar, rubro } = await conGuardia()
    const { body: inv } = await invitar({ tradeId: await rubro('Agua') }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(inv.id, { insurance: seguro })).expect(201)
    const [p] = await db.select().from(providers)
    expect(p.insurancePolicy).toBeNull()
  })

  it('la auditoría y el Excel traen el detalle del proveedor', async () => {
    const { guardia, invitar, rubro, admin } = await conGuardia()
    await request(app).patch('/admin/neighborhood').set('Cookie', admin).send({ insuranceWarnDays: 30 }).expect(200)
    const alba = await rubro('Albañil', true)
    const [n] = await db.select().from(neighborhoods)
    const enPadron = (doc: string, expiresOn: string) => db.insert(providers).values({
      neighborhoodId: n.id, doc, name: doc, insuranceCompany: 'La Segunda', insurancePolicy: 'AP-123',
      insuranceExpiresOn: expiresOn, insuranceSource: 'link',
    })
    await enPadron('1', '2999-01-01')
    await enPadron('3', hoy)
    await invitar({ tradeId: alba, guestName: 'Con seguro', guestDoc: '1', note: 'Gol rojo', weekdays: [1, 3, 5] }).expect(201)
    await invitar({ tradeId: alba, guestName: 'Sin seguro', guestDoc: '2' }).expect(201)
    await invitar({ tradeId: alba, guestName: 'Por vencer', guestDoc: '3' }).expect(201)
    await invitar({ tradeId: await rubro('Agua'), guestName: 'No aplica' }).expect(201)
    const { body: entra } = await invitar({ tradeId: alba, guestName: 'Entra', guestDoc: '1' }).expect(201)
    await request(app).post('/gate/entries').set('Cookie', guardia).send(entrada(entra.id, { guestDoc: '1' })).expect(201)

    const r = await request(app).get('/gate/audit').set('Cookie', guardia).expect(200)
    expect(r.body.insuranceWarnDays).toBe(30)
    const fila = r.body.rows.find((x: { guestName: string }) => x.guestName === 'Con seguro')
    expect(fila).toMatchObject({
      insuranceCompany: 'La Segunda', insurancePolicy: 'AP-123', insuranceExpiresOn: '2999-01-01',
      requiresInsurance: true, weekdays: [1, 3, 5], note: 'Gol rojo', porteria: false, frequentAs: null,
    })

    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', guardia)
      .buffer(true).parse((q, cb) => {
        const t: Buffer[] = []
        q.on('data', (d: Buffer) => t.push(d))
        q.on('end', () => cb(null, Buffer.concat(t)))
      }).expect(200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)
    const leer = (hoja: string) => {
      const ws = wb.getWorksheet(hoja)!
      const cab = (ws.getRow(1).values as unknown[]).map(String)
      const filas = new Map<string, (t: string) => unknown>()
      ws.eachRow((row, n) => {
        if (n > 1) filas.set(String(row.getCell(cab.indexOf('Invitado')).value), (t) => row.getCell(cab.indexOf(t)).value)
      })
      return { cab, filas }
    }
    const inv1 = leer('Invitaciones')
    expect(inv1.cab).not.toContain('Seguro')
    expect(inv1.cab).toEqual(expect.arrayContaining(['Frecuente como', 'Días', 'Compañía', 'Póliza', 'Vence seguro', 'Estado seguro', 'Nota del vecino', 'Autorizó portería']))
    const con = inv1.filas.get('Con seguro')!
    expect(con('Compañía')).toBe('La Segunda')
    expect(con('Póliza')).toBe('AP-123')
    expect(con('Vence seguro')).toBeInstanceOf(Date)
    expect(con('Estado seguro')).toBe('Vigente')
    expect(con('Días')).toBe('Lun, Mié, Vie')
    expect(con('Nota del vecino')).toBe('Gol rojo')
    expect(inv1.filas.get('Sin seguro')!('Estado seguro')).toBe('Sin cargar')
    expect(inv1.filas.get('Por vencer')!('Estado seguro')).toBe('Por vencer')
    expect(inv1.filas.get('No aplica')!('Estado seguro')).toBe('No aplica')

    const ing = leer('Ingresos')
    expect(ing.cab).toContain('Rubro')
    expect(ing.filas.get('Pedro')!('Rubro')).toBe('Albañil')
  })
})
