import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, unitMembers, units } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()

const PASS = 'una-contrasena-larga'

async function barrio(over: Record<string, unknown> = {}) {
  const [n] = await db.insert(neighborhoods)
    .values({ name: 'Los Aromos', ...over }).returning()
  return n
}

async function cuenta(role: 'admin' | 'resident') {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const barrioId = n?.id ?? (await barrio()).id
  const [p] = await db.insert(people).values({
    neighborhoodId: barrioId, email: `${role}@example.com`, name: role,
    role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  if (role === 'resident') {
    const [u] = await db.insert(units)
      .values({ neighborhoodId: barrioId, label: 'Lote 1' }).returning()
    await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  }
  const login = await request(app).post('/auth/login')
    .send({ email: p.email, password: PASS })
  return { cookie: login.headers['set-cookie'] as unknown as string[], id: p.id }
}

const admin = () => cuenta('admin')
const vecino = () => cuenta('resident')

describe('la marca pública', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('no pide sesión: la consume el layout antes de que haya login', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.nombre).toBe('Los Aromos')
  })

  it('informa si el barrio tiene paquetes activos', async () => {
    await barrio({ packagesEnabled: false })
    expect((await request(app).get('/branding').expect(200)).body.packagesEnabled).toBe(false)
  })

  it('sin color propio devuelve el del producto, ya resuelto', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    // Quien lo consume no tiene que saber cuál es el default.
    expect(res.body.color).toBe('#2f5bff')
  })

  it('con color propio devuelve ese', async () => {
    await barrio({ brandColor: '#7a1f3d' })
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.color).toBe('#7a1f3d')
  })

  it('informa si hay logo, sin mandarlo', async () => {
    await barrio()
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(false)

    const [n] = await db.select().from(neighborhoods)
    await db.update(neighborhoods).set({ logoMime: 'image/png' })
      .where(eq(neighborhoods.id, n.id))

    expect((await request(app).get('/branding')).body.tieneLogo).toBe(true)
  })

  it('sin barrio en la base no revienta: devuelve los valores del producto', async () => {
    // Pasa entre que levanta la API y corre el seed.
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.color).toBe('#2f5bff')
    expect(res.body.tieneLogo).toBe(false)
  })
})

/** Los primeros bytes de cada formato, que es lo único que se mira. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

describe('el logo del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const subir = (cookie: string[], bytes: Buffer, mime = 'image/png') =>
    request(app).put('/admin/branding/logo')
      .set('Cookie', cookie).set('Content-Type', mime).send(bytes)

  it('sube un PNG y lo sirve con su tipo', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, PNG).expect(200)

    const res = await request(app).get('/branding/logo').expect(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect(Buffer.from(res.body).subarray(0, 4)).toEqual(PNG.subarray(0, 4))
  })

  it('sube un JPEG', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, JPEG, 'image/jpeg').expect(200)
    const res = await request(app).get('/branding/logo').expect(200)
    expect(res.headers['content-type']).toContain('image/jpeg')
  })

  /*
   * EL test de esta tarea. Un SVG puede traer JavaScript adentro; servido desde
   * el mismo origen que la app, eso es un XSS que se lleva la sesión del admin.
   * Se manda declarando image/png para probar que lo que se mira son los bytes
   * del archivo y no lo que dijo el cliente.
   */
  it('rechaza un SVG aunque venga declarado como PNG', async () => {
    await barrio()
    const { cookie } = await admin()
    const res = await subir(cookie, SVG, 'image/png')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('formato_no_soportado')

    await request(app).get('/branding/logo').expect(404)
  })

  it('rechaza un archivo de más de 500 KB', async () => {
    await barrio()
    const { cookie } = await admin()
    const gordo = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(600 * 1024)])
    const res = await subir(cookie, gordo)
    expect(res.status).toBe(413)
  })

  it('sin logo, el GET da 404', async () => {
    await barrio()
    await request(app).get('/branding/logo').expect(404)
  })

  it('borrarlo vuelve al wordmark de texto', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, PNG).expect(200)
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(true)

    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(200)
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(false)
    await request(app).get('/branding/logo').expect(404)
  })

  it('un vecino no puede subir ni borrar', async () => {
    await barrio()
    const { cookie } = await vecino()
    await subir(cookie, PNG).expect(403)
    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(403)
  })

  it('la marca informa una versión del logo que cambia al reemplazarlo', async () => {
    await barrio()
    const { cookie } = await admin()
    expect((await request(app).get('/branding')).body.logoVersion).toBeNull()

    await subir(cookie, PNG).expect(200)
    const v1 = (await request(app).get('/branding')).body.logoVersion
    expect(typeof v1).toBe('number')

    // Sin esto el navegador sigue mostrando el logo viejo durante la hora de
    // caché: la versión va en la URL y tiene que moverse.
    await new Promise((r) => setTimeout(r, 5))
    await subir(cookie, JPEG, 'image/jpeg').expect(200)
    const v2 = (await request(app).get('/branding')).body.logoVersion
    expect(v2).toBeGreaterThan(v1)

    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(200)
    expect((await request(app).get('/branding')).body.logoVersion).toBeNull()
  })
})
