import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods } from '../src/db/schema.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()

async function barrio(over: Record<string, unknown> = {}) {
  const [n] = await db.insert(neighborhoods)
    .values({ name: 'Los Aromos', ...over }).returning()
  return n
}

describe('la marca pública', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('no pide sesión: la consume el layout antes de que haya login', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.nombre).toBe('Los Aromos')
  })

  it('sin color propio devuelve el del producto, ya resuelto', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    // Quien lo consume no tiene que saber cuál es el default.
    expect(res.body.color).toBe('#1e6b47')
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
    expect(res.body.color).toBe('#1e6b47')
    expect(res.body.tieneLogo).toBe(false)
  })
})
