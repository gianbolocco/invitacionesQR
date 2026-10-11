import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'

// Resend caído: dominio sin verificar, cuota agotada, red. Todo mail falla.
vi.mock('../src/lib/mail.js', () => ({
  sendMail: vi.fn().mockRejectedValue(new Error('Resend rechazó el mail')),
}))

const { buildApp } = await import('../src/app.js')
const { db } = await import('../src/db/index.js')
const { neighborhoods, people } = await import('../src/db/schema.js')
const { hashPassword } = await import('../src/lib/crypto.js')
const { resetDb } = await import('./helpers/db.js')
const { resetRateLimits } = await import('../src/middleware/rateLimit.js')

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function admin() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  await db.insert(people).values({
    neighborhoodId: n.id, email: 'admin@example.com', name: 'Admin', role: 'admin',
    status: 'active', passwordHash: await hashPassword(PASS),
  })
  const res = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: PASS })
  return res.headers['set-cookie']
}

describe('con el mail caído', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el alta queda hecha y avisa que el mail no salió', async () => {
    const cookie = await admin()
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident' })
    expect(alta.status).toBe(201)
    expect(alta.body.mailEnviado).toBe(false)

    const [p] = await db.select().from(people).where(eq(people.email, 'martin@example.com'))
    expect(p.status).toBe('invited')
  })

  it('reenviar devuelve un error que el admin puede ver', async () => {
    const cookie = await admin()
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident' })
    const res = await request(app).post(`/admin/people/${alta.body.id}/resend`).set('Cookie', cookie)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('mail_no_enviado')
  })

  it('/auth/forgot responde igual exista o no la cuenta', async () => {
    await admin()
    const existe = await request(app).post('/auth/forgot').send({ email: 'admin@example.com' })
    const noExiste = await request(app).post('/auth/forgot').send({ email: 'nadie@example.com' })
    expect(existe.status).toBe(200)
    expect(existe.body).toEqual(noExiste.body)
  })
})
