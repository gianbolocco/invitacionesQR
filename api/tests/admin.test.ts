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

  it('el admin crea una UF por número', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ lot: 142 })
    expect(res.status).toBe(201)
    // La etiqueta se deriva del número: una sola forma de escribirla.
    expect(res.body.label).toBe('Lote 142')
  })

  it('un vecino no puede crear una UF', async () => {
    const { cookie } = await loginAs('resident')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ lot: 9 })
    expect(res.status).toBe(403)
  })

  it('sin sesión devuelve 401', async () => {
    const res = await request(app).post('/admin/units').send({ lot: 9 })
    expect(res.status).toBe(401)
  })

  it('el alta del vecino no pide unidad: la declara él al entrar', async () => {
    const { cookie } = await loginAs('admin')

    const alta = await request(app).post('/admin/people').set('Cookie', cookie).send({
      email: 'martin@example.com', name: 'Martín', role: 'resident',
    })
    expect(alta.status).toBe(201)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    expect(martin.status).toBe('invited')
    expect(martin.units).toEqual([])
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

describe('reactivar una baja', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin puede volver atrás una baja por error', async () => {
    const { cookie } = await loginAs('admin')
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [] })

    await request(app).post(`/admin/people/${alta.body.id}/disable`).set('Cookie', cookie).expect(200)
    await request(app).post(`/admin/people/${alta.body.id}/enable`).set('Cookie', cookie).expect(200)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    // Nunca creó contraseña, así que vuelve a "invitado", no a "activo".
    expect(martin.status).toBe('invited')
  })

  it('quien ya tenía contraseña vuelve a activo y puede entrar', async () => {
    const { cookie } = await loginAs('admin')
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'garita2@example.com', name: 'Carlos', role: 'guard', unitIds: [] })
    await request(app).post(`/admin/people/${alta.body.id}/password`).set('Cookie', cookie)
      .send({ password: 'clave-de-garita' }).expect(200)

    await request(app).post(`/admin/people/${alta.body.id}/disable`).set('Cookie', cookie).expect(200)
    const bloqueado = await request(app).post('/auth/login')
      .send({ email: 'garita2@example.com', password: 'clave-de-garita' })
    expect(bloqueado.status).toBe(401)

    await request(app).post(`/admin/people/${alta.body.id}/enable`).set('Cookie', cookie).expect(200)
    const login = await request(app).post('/auth/login')
      .send({ email: 'garita2@example.com', password: 'clave-de-garita' })
    expect(login.status).toBe(200)
  })
})

describe('alta con un mail que ya existe', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('devuelve 409 con un código claro, no un 500', async () => {
    const { cookie } = await loginAs('admin')
    const alta = () => request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'vecino@example.com', name: 'Vecino', role: 'resident' })

    await alta().expect(201)

    const repetida = await alta()
    expect(repetida.status).toBe(409)
    expect(repetida.body.error).toBe('mail_repetido')
  })

  it('el mail se normaliza: MAIL@X.COM choca con mail@x.com', async () => {
    const { cookie } = await loginAs('admin')
    await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'vecino@example.com', name: 'Vecino', role: 'resident' }).expect(201)

    const res = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'VECINO@example.com', name: 'Otro', role: 'guard' })
    expect(res.status).toBe(409)
  })
})

describe('color de marca del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('arranca sin color propio y ofrece la paleta', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).get('/admin/neighborhood').set('Cookie', cookie).expect(200)

    expect(res.body.brandColor).toBeNull()
    expect(res.body.paleta).toHaveLength(8)
    expect(res.body.paleta).toContain('#1e6b47')
  })

  it('guarda un color de la paleta', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#1d4e89' }).expect(200)
    expect(res.body.brandColor).toBe('#1d4e89')
  })

  it('rechaza un color que no está en la paleta', async () => {
    const { cookie } = await loginAs('admin')
    // Amarillo: el texto claro sobre este fondo no se lee. Por eso hay paleta.
    const res = await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#ffee00' })
    expect(res.status).toBe(400)
  })

  it('rechaza cualquier cosa que no sea un hex de la paleta', async () => {
    const { cookie } = await loginAs('admin')
    for (const malo of ['rojo', '#fff', 'javascript:alert(1)', '']) {
      const res = await request(app).patch('/admin/neighborhood')
        .set('Cookie', cookie).send({ brandColor: malo })
      expect(res.status).toBe(400)
    }
  })

  it('un vecino no puede cambiar el color', async () => {
    const { cookie } = await loginAs('resident')
    await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#1d4e89' }).expect(403)
  })
})

describe('reenvío y link de alta', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  async function vecinoInvitado(cookie: string[]) {
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident' })
    return alta.body.id as string
  }

  it('un segundo reenvío dentro del minuto rebota sin mandar otro mail', async () => {
    const { cookie } = await loginAs('admin')
    const id = await vecinoInvitado(cookie)

    const primero = await request(app).post(`/admin/people/${id}/resend`).set('Cookie', cookie)
    expect(primero.status).toBe(200)
    const segundo = await request(app).post(`/admin/people/${id}/resend`).set('Cookie', cookie)
    expect(segundo.status).toBe(429)

    const reenvios = await db.select().from(auditLogs).where(eq(auditLogs.action, 'person.reinvited'))
    expect(reenvios).toHaveLength(1)
  })

  it('el link copiado sirve para darse de alta', async () => {
    const { cookie } = await loginAs('admin')
    const id = await vecinoInvitado(cookie)

    const res = await request(app).post(`/admin/people/${id}/invite-link`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    const token = new URL(res.body.url).searchParams.get('t')
    expect(new URL(res.body.url).pathname).toBe('/acceso')

    const alta = await request(app).post('/auth/invite').send({ token, password: 'una-contrasena-larga', lot: 142 })
    expect(alta.status).toBe(200)
  })

  it('un vecino no puede pedir el link de otro', async () => {
    const { cookie } = await loginAs('resident')
    const res = await request(app).post('/admin/people/00000000-0000-4000-8000-000000000000/invite-link').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })
})
