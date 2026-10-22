import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, trades } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u142] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [u200] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 200' }).returning()
  const [martin] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín Pérez',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u142.id, personId: martin.id })

  const [otroBarrio] = await db.insert(neighborhoods).values({ name: 'Otro Barrio' }).returning()
  const [uOtro] = await db.insert(units).values({ neighborhoodId: otroBarrio.id, label: 'Lote 142' }).returning()
  const [deOtro] = await db.insert(people).values({
    neighborhoodId: otroBarrio.id, email: 'ajeno@example.com', name: 'Ajeno',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: uOtro.id, personId: deOtro.id })

  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], neighborhoodId: n.id, unit142: u142, unit200: u200, martin, guardia }
}

describe('buscar unidades en la garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('encuentra por lote', async () => {
    const { cookie, unit142 } = await escenario()
    const res = await request(app).get('/gate/units?q=142').set('Cookie', cookie).expect(200)
    expect(res.body).toEqual([{ unitId: unit142.id, unitLabel: 'Lote 142', residentName: 'Martín Pérez' }])
  })

  it('encuentra por apellido, sin tilde', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=perez').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].residentName).toBe('Martín Pérez')
  })

  it('no devuelve unidades de otro barrio', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=142').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
  })

  it('una unidad sin nadie cargado no aparece', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=200').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(0)
  })

  it('exige q', async () => {
    const { cookie } = await escenario()
    await request(app).get('/gate/units').set('Cookie', cookie).expect(400)
  })
})

describe('alta exprés de invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea con los defaults de una visita de un día', async () => {
    const { cookie, unit142, guardia } = await escenario()
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Invitado Exprés' }).expect(201)

    expect(res.body.kind).toBe('visita')
    expect(res.body.capacity).toBe(1)
    expect(res.body.validFrom).toBe(res.body.validTo)
    expect(res.body.createdBy).toBe(guardia.id)

    // El veredicto no muestra el nombre del guardia como si invitara él.
    const veredicto = await request(app).get(`/gate/invitation/${res.body.id}`).set('Cookie', cookie).expect(200)
    expect(veredicto.body.invitation.inviterName).toBe('Autorizado por portería')
    expect(res.body.guestName).toBe('Invitado Exprés')
  })

  it('acepta la patente opcional', async () => {
    const { cookie, unit142 } = await escenario()
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Con patente', plate: 'ab123cd' }).expect(201)
    expect(res.body.plate).toBe('AB123CD')
  })

  it('acepta el documento opcional, si el guardia ya lo tiene', async () => {
    const { cookie, unit142 } = await escenario()
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Con doc', guestDoc: '30123456' }).expect(201)
    expect(res.body.guestDoc).toBe('30123456')
  })

  it('rechaza una unidad de otro barrio', async () => {
    const { cookie } = await escenario()
    const [otroBarrio] = await db.insert(neighborhoods).values({ name: 'Lejano' }).returning()
    const [unidadAjena] = await db.insert(units).values({ neighborhoodId: otroBarrio.id, label: 'Lote 1' }).returning()

    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unidadAjena.id, guestName: 'Intruso' }).expect(403)
  })

  it('el ingreso recién creado se puede registrar como cualquier otro', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Invitado Exprés' }).expect(201).then((r) => r.body)

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.check).toEqual({ ok: true })

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Invitado Exprés', guestDoc: '30555666' }).expect(201)
  })
})

describe('el documento es obligatorio al ingreso', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('rechaza el ingreso sin documento', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Sin Doc' }).expect(201).then((r) => r.body)

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Sin Doc' }).expect(400)
  })

  it('si la invitación no tenía documento, el tipeado en la puerta queda guardado en la invitación', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Carga en la puerta' }).expect(201).then((r) => r.body)
    expect(creada.guestDoc).toBeNull()

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Carga en la puerta', guestDoc: '30777888' }).expect(201)

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.invitation.guestDoc).toBe('30777888')
  })

  it('si ya tenía documento, no lo pisa con otro distinto', async () => {
    const { cookie, unit142, guardia } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Con Doc Previo' }).expect(201).then((r) => r.body)

    await db.update(invitations).set({ guestDoc: '30111111', capacity: 5, kind: 'frecuente' })
      .where(eq(invitations.id, creada.id))

    await registerEntry(creada.id, guardia.id, { guestName: 'Con Doc Previo', guestDoc: '30999999' })

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.invitation.guestDoc).toBe('30111111')
  })
})

describe('a quién se le atribuye una invitación de garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const ETIQUETA = 'Autorizado por portería'

  it('en el historial del vecino', async () => {
    const { cookie, unit142 } = await escenario()
    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés' }).expect(201)

    // El vecino de la unidad 142 ve su historial.
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const loginVecino = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const res = await request(app).get('/invitations/historial').set('Cookie', loginVecino.headers['set-cookie']).expect(200)
    const fila = res.body.rows.find((r: { guestName: string }) => r.guestName === 'Exprés')
    expect(fila.creatorName).toBe(ETIQUETA)
  })

  it('en la auditoría del admin', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Auditoría' }).expect(201).then((r) => r.body)

    const res = await request(app).get('/gate/audit').set('Cookie', cookie).expect(200)
    const fila = res.body.rows.find((r: { id: string }) => r.id === creada.id)
    expect(fila.inviterName).toBe(ETIQUETA)
  })

  it('en la agenda del día', async () => {
    const { cookie, unit142 } = await escenario()
    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Agenda' }).expect(201)

    const hoy = todayInBuenosAires()
    const res = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', cookie).expect(200)
    const fila = res.body.find((r: { guestName: string }) => r.guestName === 'Exprés Agenda')
    expect(fila.inviterName).toBe(ETIQUETA)
  })

  it('en el link público, si alguien lo abre', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Público' }).expect(201).then((r) => r.body)

    const res = await request(app).get(`/invitations/public/${creada.token}`).expect(200)
    expect(res.body.inviterName).toBe(ETIQUETA)
  })

  it('una invitación normal sigue mostrando el nombre del vecino', async () => {
    const { cookie, unit142 } = await escenario()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const loginVecino = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const hoy = todayInBuenosAires()
    await request(app).post('/invitations').set('Cookie', loginVecino.headers['set-cookie']).send({
      unitId: unit142.id, kind: 'visita', guestName: 'Normal', validFrom: hoy, validTo: hoy, capacity: 1,
    }).expect(201)

    const res = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', cookie).expect(200)
    const fila = res.body.find((r: { guestName: string }) => r.guestName === 'Normal')
    expect(fila.inviterName).toBe('Martín Pérez')
  })
})

describe('alta exprés de proveedor', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const rubro = async (neighborhoodId: string, requiresInsurance = false) =>
    (await db.insert(trades).values({ neighborhoodId, name: 'Electricista', requiresInsurance }).returning())[0]

  it('crea un proveedor con rubro y seguro', async () => {
    const { cookie, unit142, neighborhoodId } = await escenario()
    const t = await rubro(neighborhoodId, true)
    const seguro = { company: 'La Segunda', policy: 'P-1', expiresOn: '2099-01-01' }
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Plomero', kind: 'proveedor', tradeId: t.id, insurance: seguro }).expect(201)
    expect(res.body.kind).toBe('proveedor')
    expect(res.body.tradeId).toBe(t.id)
    expect(res.body.insuranceCompany).toBe('La Segunda')
    expect(res.body.insurancePolicy).toBe('P-1')
    expect(res.body.insuranceExpiresOn).toBe('2099-01-01')
  })

  it('con rubros cargados exige el rubro', async () => {
    const { cookie, unit142, neighborhoodId } = await escenario()
    await rubro(neighborhoodId)
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Plomero', kind: 'proveedor' }).expect(400)
    expect(res.body.error).toBe('rubro_requerido')
  })

  it('rechaza seguro en un rubro que no lo pide', async () => {
    const { cookie, unit142, neighborhoodId } = await escenario()
    const t = await rubro(neighborhoodId, false)
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Plomero', kind: 'proveedor', tradeId: t.id,
        insurance: { company: 'X', policy: 'Y', expiresOn: '2099-01-01' } }).expect(400)
    expect(res.body.error).toBe('seguro_no_aplica')
  })

  it('un proveedor de portería entra fuera de franja y sin seguro', async () => {
    const { cookie, unit142, neighborhoodId } = await escenario()
    const t = await rubro(neighborhoodId, true)
    await db.update(neighborhoods).set({
      providerWindows: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:01', season: null, trades: null }],
    }).where(eq(neighborhoods.id, neighborhoodId))
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Plomero', kind: 'proveedor', tradeId: t.id }).expect(201).then((r) => r.body)

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.check.ok).toBe(true)
    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Plomero', guestDoc: '30111222' }).expect(201)
  })
})
