import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, auditLogs } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function loginAs(role: 'admin' | 'resident') {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const neighborhood = n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
  const email = `${role}@example.com`
  await db.insert(people).values({
    neighborhoodId: neighborhood.id, email, name: role, role,
    status: 'active', passwordHash: await hashPassword(PASS),
  })
  const res = await request(app).post('/auth/login').send({ email, password: PASS })
  return { cookie: res.headers['set-cookie'], neighborhoodId: neighborhood.id }
}

describe('padrón', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin crea una UF', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 142' })
    expect(res.status).toBe(201)
    expect(res.body.label).toBe('Lote 142')
  })

  it('un vecino no puede crear una UF', async () => {
    const { cookie } = await loginAs('resident')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 9' })
    expect(res.status).toBe(403)
  })

  it('sin sesión devuelve 401', async () => {
    const res = await request(app).post('/admin/units').send({ label: 'Lote 9' })
    expect(res.status).toBe(401)
  })

  it('el admin da de alta un vecino y queda listado con su UF', async () => {
    const { cookie } = await loginAs('admin')
    const unit = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 142' })

    const alta = await request(app).post('/admin/people').set('Cookie', cookie).send({
      email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [unit.body.id],
    })
    expect(alta.status).toBe(201)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    expect(martin.status).toBe('invited')
    expect(martin.units[0].label).toBe('Lote 142')
  })

  it('deshabilitar un vecino lo saca pero no lo borra', async () => {
    const { cookie } = await loginAs('admin')
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [] })

    const res = await request(app).post(`/admin/people/${alta.body.id}/disable`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    expect(martin.status).toBe('disabled')
  })

  it('el alta queda registrada en la auditoría', async () => {
    const { cookie, neighborhoodId } = await loginAs('admin')
    await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [] })

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.neighborhoodId, neighborhoodId))
    expect(rows.some((r) => r.action === 'person.created')).toBe(true)
  })

  it('el admin le pone contraseña a una cuenta de garita y esa cuenta puede entrar', async () => {
    const { cookie } = await loginAs('admin')
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'garita@example.com', name: 'Garita', role: 'guard', unitIds: [] })

    await request(app).post(`/admin/people/${alta.body.id}/password`).set('Cookie', cookie)
      .send({ password: 'clave-de-garita' }).expect(200)

    const login = await request(app).post('/auth/login')
      .send({ email: 'garita@example.com', password: 'clave-de-garita' })
    expect(login.status).toBe(200)
  })

  it('un admin no puede tocar el padrón de otro barrio', async () => {
    const { cookie } = await loginAs('admin')
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro barrio' }).returning()
    await db.insert(people).values({
      neighborhoodId: otro.id, email: 'ajeno@example.com', name: 'Ajeno',
      role: 'resident', status: 'active',
    })

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    expect(lista.body.some((p: { email: string }) => p.email === 'ajeno@example.com')).toBe(false)
  })
})

describe('datos del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin carga la dirección y el link de mapas', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).patch('/admin/neighborhood').set('Cookie', cookie).send({
      address: 'Ruta 8 km 62, Pilar',
      mapUrl: 'https://maps.google.com/?q=alamo+alto',
    })
    expect(res.status).toBe(200)
    expect(res.body.address).toBe('Ruta 8 km 62, Pilar')

    const get = await request(app).get('/admin/neighborhood').set('Cookie', cookie)
    expect(get.body.mapUrl).toContain('maps.google.com')
  })

  it('un campo vacío se guarda como nulo, no como string vacío', async () => {
    const { cookie } = await loginAs('admin')
    await request(app).patch('/admin/neighborhood').set('Cookie', cookie)
      .send({ address: 'Algo' }).expect(200)
    const res = await request(app).patch('/admin/neighborhood').set('Cookie', cookie)
      .send({ address: '' })
    expect(res.body.address).toBeNull()
  })

  it('rechaza un mapUrl que no es una URL', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).patch('/admin/neighborhood').set('Cookie', cookie)
      .send({ mapUrl: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
  })

  it('un vecino no puede editar el barrio', async () => {
    const { cookie } = await loginAs('resident')
    const res = await request(app).patch('/admin/neighborhood').set('Cookie', cookie)
      .send({ address: 'Me lo invento' })
    expect(res.status).toBe(403)
  })
})
