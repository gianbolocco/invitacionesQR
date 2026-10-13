import { describe, it, expect, beforeEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function persona(neighborhoodId: string, email: string, role: 'resident' | 'guard') {
  const [p] = await db.insert(people).values({
    neighborhoodId, email, name: email, role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email, password: PASS })
  const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]
  return { id: p.id, cookie }
}

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const vecino = await persona(n.id, 'martin@example.com', 'resident')
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  const guardia = await persona(n.id, 'rulo@example.com', 'guard')
  return { unitId: u.id, vecino, guardia }
}

/** Un servidor de verdad: supertest no deja leer un stream que no termina. */
async function abrirAvisos(cookie: string) {
  const server = app.listen(0)
  const { port } = server.address() as AddressInfo
  const corte = new AbortController()
  const res = await fetch(`http://127.0.0.1:${port}/gate/eventos`, { headers: { cookie }, signal: corte.signal })
  const lector = res.body!.getReader()
  const texto = new TextDecoder()
  let leido = ''
  return {
    res,
    async esperar(fragmento: string) {
      while (!leido.includes(fragmento)) {
        const { value, done } = await lector.read()
        if (done) break
        leido += texto.decode(value)
      }
      return leido
    },
    cerrar() { corte.abort(); server.close() },
  }
}

describe('avisos en vivo a la garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('la garita se entera cuando un vecino crea una invitación', async () => {
    const { unitId, vecino, guardia } = await escenario()
    const avisos = await abrirAvisos(guardia.cookie)
    try {
      expect(avisos.res.headers.get('content-type')).toMatch(/^text\/event-stream/)
      await avisos.esperar('retry:')

      const hoy = todayInBuenosAires()
      await request(app).post('/invitations').set('Cookie', vecino.cookie).send({
        unitId, kind: 'visita', guestName: 'Juan Pérez', validFrom: hoy, validTo: hoy, capacity: 1,
      }).expect(201)

      expect(await avisos.esperar('data: cambio')).toContain('data: cambio')
    } finally {
      avisos.cerrar()
    }
  })

  it('un vecino no puede escuchar los avisos de la garita', async () => {
    const { vecino } = await escenario()
    await request(app).get('/gate/eventos').set('Cookie', vecino.cookie).expect(403)
  })
})
