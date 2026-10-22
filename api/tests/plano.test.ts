import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, unitMembers, units } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { tipoDePlano } from '../src/lib/marca.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g id="lote-87"><rect/><text>87</text></g></svg>'

async function cuenta(role: 'admin' | 'resident') {
  const [n0] = await db.select().from(neighborhoods).limit(1)
  const barrioId = n0?.id ?? (await db.insert(neighborhoods).values({ name: 'Los Aromos' }).returning())[0].id
  const [p] = await db.insert(people).values({
    neighborhoodId: barrioId, email: `${role}@example.com`, name: role,
    role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  if (role === 'resident') {
    const [u] = await db.insert(units).values({ neighborhoodId: barrioId, label: 'Lote 1' }).returning()
    await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  }
  const login = await request(app).post('/auth/login').send({ email: p.email, password: PASS })
  return login.headers['set-cookie'] as unknown as string[]
}

const subir = (cookie: string[], body: Buffer | string, tipo = 'image/svg+xml') =>
  request(app).put('/admin/branding/plano').set('Cookie', cookie).set('Content-Type', tipo).send(body)

describe('el plano del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin sube un SVG y /branding avisa', async () => {
    const cookie = await cuenta('admin')
    await subir(cookie, SVG).expect(200)
    const b = (await request(app).get('/branding')).body
    expect(b.tienePlano).toBe(true)
    expect(typeof b.planoVersion).toBe('number')
  })

  it('acepta PNG, rechaza texto y a un vecino', async () => {
    const cookie = await cuenta('admin')
    await subir(cookie, PNG, 'image/png').expect(200)
    const res = await subir(cookie, 'hola', 'image/svg+xml').expect(400)
    expect(res.body.error).toBe('formato_no_soportado')
    await resetDb()
    const v = await cuenta('resident')
    await subir(v, SVG).expect(403)
  })

  it('resalta el lote en un SVG, con CSP y nosniff', async () => {
    await subir(await cuenta('admin'), SVG).expect(200)
    const res = await request(app).get('/branding/plano?lote=87').buffer(true).expect(200)
    expect(res.body.toString()).toContain('#lote-87 rect{fill:')
    expect(res.headers['content-type']).toContain('image/svg+xml')
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('sin lote o con lote inválido sale el original', async () => {
    await subir(await cuenta('admin'), SVG).expect(200)
    for (const q of ['', '?lote=abc', '?lote=1234567', '?lote=1}x']) {
      const res = await request(app).get(`/branding/plano${q}`).buffer(true).expect(200)
      expect(res.body.toString()).toBe(SVG)
    }
  })

  it('con un PNG salen los bytes originales', async () => {
    await subir(await cuenta('admin'), PNG, 'image/png').expect(200)
    const res = await request(app).get('/branding/plano?lote=87').buffer(true)
      .parse((r, cb) => { const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))) })
    expect(Buffer.compare(res.body, PNG)).toBe(0)
  })

  it('borrar deja sin plano y /plano da 404', async () => {
    const cookie = await cuenta('admin')
    await subir(cookie, SVG).expect(200)
    await request(app).delete('/admin/branding/plano').set('Cookie', cookie).expect(200)
    expect((await request(app).get('/branding')).body.tienePlano).toBe(false)
    await request(app).get('/branding/plano').expect(404)
  })
})

describe('el plano de Alamo Alto', () => {
  it('lo acepta tipoDePlano y trae los lotes y la entrada', () => {
    const f = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/barrios/alamo-alto-plano.svg')
    const bytes = readFileSync(f)
    expect(tipoDePlano(bytes)).toBe('image/svg+xml')
    const txt = bytes.toString('utf8')
    for (const id of ['lote-1', 'lote-153', 'entrada']) expect(txt).toContain(`id="${id}"`)
  })
})
