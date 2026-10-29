import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { AddressInfo } from 'node:net'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { emitir, conexionesDe } from '../src/lib/eventos.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const PASS = 'una-contrasena-larga'

async function vecino(email: string, n: { id: string }) {
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email, name: email, role: 'resident', status: 'active',
    passwordHash: await hashPassword(PASS),
  }).returning()
  return p
}

/** Lee del stream hasta que el texto acumulado cumple `ok` o vence el plazo. */
async function leerHasta(reader: ReadableStreamDefaultReader<Uint8Array>, ok: (t: string) => boolean, ms = 1500) {
  const dec = new TextDecoder()
  let texto = ''
  const fin = Date.now() + ms
  while (!ok(texto) && Date.now() < fin) {
    const r = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 200))])
    if (r && !r.done) texto += dec.decode(r.value)
  }
  return texto
}

describe('eventos en vivo', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('sin sesión: 401', async () => {
    await request(buildApp()).get('/events').expect(401)
  })

  it('llega lo emitido a la persona y no lo de otra; se suelta al cortar', async () => {
    const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
    const ana = await vecino('ana@example.com', n)
    const bea = await vecino('bea@example.com', n)
    const app = buildApp()
    const login = await request(app).post('/auth/login').send({ email: 'ana@example.com', password: PASS })
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ')

    const server = app.listen(0)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://localhost:${port}/events`, { headers: { cookie } })
      expect(res.status).toBe(200)
      const reader = res.body!.getReader()
      await leerHasta(reader, (t) => t.includes(': hola'))
      expect(conexionesDe(ana.id)).toBe(1)

      emitir(bea.id, 'package', { id: 'ajeno' })
      emitir(ana.id, 'package', { id: 'x' })
      const texto = await leerHasta(reader, (t) => t.includes('event: package'))
      expect(texto).toContain('event: package\ndata: {"id":"x"}')
      expect(texto).not.toContain('ajeno')

      await reader.cancel()
      for (let i = 0; i < 20 && conexionesDe(ana.id) > 0; i++) await new Promise((r) => setTimeout(r, 50))
      expect(conexionesDe(ana.id)).toBe(0)
    } finally {
      server.close()
      server.closeAllConnections()
    }
  })
})
