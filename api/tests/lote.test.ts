import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, units } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { createPerson } from '../src/services/people.js'
import { unitsOfPerson } from '../src/services/units.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function barrio() {
  const [n] = await db.select().from(neighborhoods).limit(1)
  return n ?? (await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning())[0]
}

async function invitar(email: string, name = 'Vecino') {
  const n = await barrio()
  return createPerson({
    neighborhoodId: n.id, email, name, role: 'resident', unitIds: [], actorId: null,
  })
}

async function loginAdmin() {
  const n = await barrio()
  await db.insert(people).values({
    neighborhoodId: n.id, email: 'admin@example.com', name: 'Admin', role: 'admin',
    status: 'active', passwordHash: await hashPassword(PASS),
  })
  const res = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: PASS })
  return res.headers['set-cookie']
}

describe('el vecino declara su lote al entrar', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea la unidad si no existía y lo deja adentro', async () => {
    const { person, inviteToken } = await invitar('martin@example.com')
    await request(app).post('/auth/invite')
      .send({ token: inviteToken, password: PASS, lot: 142 }).expect(200)

    const suyas = await unitsOfPerson(person.id)
    expect(suyas).toHaveLength(1)
    expect(suyas[0].label).toBe('Lote 142')
  })

  it('dos vecinos del mismo lote caen en la MISMA unidad', async () => {
    const a = await invitar('martin@example.com', 'Martín')
    const b = await invitar('ana@example.com', 'Ana')

    await request(app).post('/auth/invite').send({ token: a.inviteToken, password: PASS, lot: 142 })
    await request(app).post('/auth/invite').send({ token: b.inviteToken, password: PASS, lot: 142 })

    const [ua] = await unitsOfPerson(a.person.id)
    const [ub] = await unitsOfPerson(b.person.id)
    expect(ua.id).toBe(ub.id)

    const todas = await db.select().from(units)
    expect(todas).toHaveLength(1)
  })

  it('reusa la unidad que ya había cargado el admin', async () => {
    const cookie = await loginAdmin()
    const creada = await request(app).post('/admin/units').set('Cookie', cookie).send({ lot: 142 })
    expect(creada.body.label).toBe('Lote 142')

    const { person, inviteToken } = await invitar('martin@example.com')
    await request(app).post('/auth/invite').send({ token: inviteToken, password: PASS, lot: 142 })

    const [suya] = await unitsOfPerson(person.id)
    expect(suya.id).toBe(creada.body.id)
    expect(await db.select().from(units)).toHaveLength(1)
  })

  it('el lote es numérico: un texto se rechaza', async () => {
    const { inviteToken } = await invitar('martin@example.com')
    const res = await request(app).post('/auth/invite')
      .send({ token: inviteToken, password: PASS, lot: 'el de la esquina' })
    expect(res.status).toBe(400)
  })

  it('si el admin ya le asignó unidad, el lote que mande se ignora', async () => {
    const cookie = await loginAdmin()
    const n = await barrio()
    const [asignada] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 7' }).returning()

    const { person, inviteToken } = await invitar('martin@example.com')
    await request(app).post(`/admin/people/${person.id}/lot`).set('Cookie', cookie).send({ lot: 7 })
    expect((await unitsOfPerson(person.id))[0].id).toBe(asignada.id)

    await request(app).post('/auth/invite').send({ token: inviteToken, password: PASS, lot: 999 })
    const suyas = await unitsOfPerson(person.id)
    expect(suyas).toHaveLength(1)
    expect(suyas[0].label).toBe('Lote 7')
  })

  it('needs-lot avisa si hay que pedirlo', async () => {
    const { inviteToken } = await invitar('martin@example.com')
    const res = await request(app).get(`/auth/invite/${inviteToken}/needs-lot`)
    expect(res.body.needsLot).toBe(true)
  })

  it('a un guardia no se le pide lote', async () => {
    const n = await barrio()
    const { inviteToken } = await createPerson({
      neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
      role: 'guard', unitIds: [], actorId: null,
    })
    const res = await request(app).get(`/auth/invite/${inviteToken}/needs-lot`)
    expect(res.body.needsLot).toBe(false)
  })
})

describe('el admin corrige el lote', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('lo mueve de unidad, sin dejarlo en las dos', async () => {
    const cookie = await loginAdmin()
    const { person, inviteToken } = await invitar('martin@example.com')
    await request(app).post('/auth/invite').send({ token: inviteToken, password: PASS, lot: 142 })

    await request(app).post(`/admin/people/${person.id}/lot`).set('Cookie', cookie)
      .send({ lot: 7 }).expect(200)

    const suyas = await unitsOfPerson(person.id)
    expect(suyas).toHaveLength(1)
    expect(suyas[0].label).toBe('Lote 7')
  })

  it('un vecino no puede cambiarse de lote', async () => {
    const { person, inviteToken } = await invitar('martin@example.com')
    const alta = await request(app).post('/auth/invite')
      .send({ token: inviteToken, password: PASS, lot: 142 })

    const res = await request(app).post(`/admin/people/${person.id}/lot`)
      .set('Cookie', alta.headers['set-cookie']).send({ lot: 7 })
    expect(res.status).toBe(403)

    const [suya] = await unitsOfPerson(person.id)
    expect(suya.label).toBe('Lote 142')
  })

  it('queda registrado en la auditoría quién lo cambió', async () => {
    const cookie = await loginAdmin()
    const { person, inviteToken } = await invitar('martin@example.com')
    await request(app).post('/auth/invite').send({ token: inviteToken, password: PASS, lot: 142 })
    await request(app).post(`/admin/people/${person.id}/lot`).set('Cookie', cookie).send({ lot: 7 })

    const { auditLogs } = await import('../src/db/schema.js')
    const filas = await db.select().from(auditLogs).where(eq(auditLogs.entityId, person.id))
    expect(filas.some((f) => f.action === 'person.lot_changed')).toBe(true)
  })
})
