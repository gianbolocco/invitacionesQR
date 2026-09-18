import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function admin() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'admin@example.com', name: 'Admin', role: 'admin',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  const login = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: PASS })
  return login.headers['set-cookie']
}

/**
 * Un id mal formado es un pedido mal hecho (400), no un servidor roto (500).
 * Antes se iba tal cual a Postgres y volvía "invalid input syntax for type uuid"
 * como 500, que es justo el ruido que esconde los 500 de verdad en el log.
 */
describe('ids mal formados', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const rutas: [string, string][] = [
    ['post', '/invitations/no-es-uuid/revoke'],
    ['post', '/invitations/no-es-uuid/restore'],
    ['patch', '/invitations/no-es-uuid'],
    ['get', '/gate/invitation/no-es-uuid'],
    ['post', '/gate/entries/no-es-uuid/undo'],
    ['post', '/admin/people/no-es-uuid/disable'],
    ['post', '/admin/people/no-es-uuid/enable'],
    ['post', '/admin/people/no-es-uuid/resend'],
    ['post', '/admin/people/no-es-uuid/password'],
    ['post', '/admin/people/no-es-uuid/lot'],
  ]

  it.each(rutas)('%s %s devuelve 400 y no 500', async (metodo, ruta) => {
    const cookie = await admin()
    const res = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo](ruta)
      .set('Cookie', cookie)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('id_invalido')
  })

  it('un uuid bien formado que no existe sigue siendo 404', async () => {
    const cookie = await admin()
    const res = await request(app)
      .post('/invitations/00000000-0000-4000-8000-000000000000/revoke')
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })

  it('el token del QR no es un uuid y no se toca', async () => {
    const res = await request(app).get('/invitations/public/un-token-cualquiera')
    expect(res.status).toBe(404)
  })
})
