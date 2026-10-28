import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import webpush from 'web-push'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people, pushSubscriptions } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { enviarPush } from '../src/lib/push.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }))

const PASS = 'una-contrasena-larga'
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'pk', auth: 'au' } }

async function vecino(email: string, nId: string) {
  const [p] = await db.insert(people).values({
    neighborhoodId: nId, email, name: email, role: 'resident', status: 'active',
    passwordHash: await hashPassword(PASS),
  }).returning()
  return p
}

async function sesion(app: ReturnType<typeof buildApp>, email: string) {
  const r = await request(app).post('/auth/login').send({ email, password: PASS })
  return (r.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ')
}

describe('push', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('GET /push/public-key es público', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'clave-publica')
    const r = await request(buildApp()).get('/push/public-key').expect(200)
    expect(r.body).toEqual({ key: 'clave-publica' })
  })

  it('sin clave configurada devuelve null', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    const r = await request(buildApp()).get('/push/public-key').expect(200)
    expect(r.body).toEqual({ key: null })
  })

  it('suscripciones: sin sesión 401; crea, reasigna y borra', async () => {
    const app = buildApp()
    await request(app).post('/push/subscriptions').send(sub).expect(401)
    await request(app).delete('/push/subscriptions').send({ endpoint: sub.endpoint }).expect(401)

    const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
    const ana = await vecino('ana@example.com', n.id)
    const bea = await vecino('bea@example.com', n.id)
    const cAna = await sesion(app, 'ana@example.com')
    const cBea = await sesion(app, 'bea@example.com')

    await request(app).post('/push/subscriptions').set('cookie', cAna).send(sub).expect(201)
    let filas = await db.select().from(pushSubscriptions)
    expect(filas).toHaveLength(1)
    expect(filas[0].personId).toBe(ana.id)

    await request(app).post('/push/subscriptions').set('cookie', cBea)
      .send({ ...sub, keys: { p256dh: 'pk2', auth: 'au2' } }).expect(201)
    filas = await db.select().from(pushSubscriptions)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ personId: bea.id, p256dh: 'pk2', auth: 'au2' })

    await request(app).post('/push/subscriptions').set('cookie', cBea).send({ endpoint: 'no-url', keys: sub.keys }).expect(400)

    // Otra persona no puede borrarla.
    await request(app).delete('/push/subscriptions').set('cookie', cAna).send({ endpoint: sub.endpoint }).expect(200)
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1)

    await request(app).delete('/push/subscriptions').set('cookie', cBea).send({ endpoint: sub.endpoint }).expect(200)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))).toHaveLength(0)
  })

  it('endpoints: solo https y servicios de push conocidos', async () => {
    const app = buildApp()
    const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
    await vecino('ana@example.com', n.id)
    const c = await sesion(app, 'ana@example.com')
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://api:8080/x', 'https://169.254.169.254/', 'https://fcm.googleapis.com.evil.com/x', 'basura']) {
      const r = await request(app).post('/push/subscriptions').set('cookie', c).send({ endpoint, keys: sub.keys }).expect(400)
      expect(r.body.error).toBe('endpoint_invalido')
    }
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/xyz']) {
      await request(app).post('/push/subscriptions').set('cookie', c).send({ endpoint, keys: sub.keys }).expect(201)
    }
  })

  describe('enviarPush', () => {
    const s = { endpoint: sub.endpoint, p256dh: 'pk', auth: 'au' }
    const payload = { titulo: 'Paquete', cuerpo: 'Llegó algo', url: '/paquetes' }
    beforeEach(() => {
      vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
      vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
      vi.stubEnv('VAPID_SUBJECT', 'mailto:a@example.com')
    })

    it('ok: manda el JSON con titulo, cuerpo y url', async () => {
      vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
      expect(await enviarPush(s, payload)).toBe('ok')
      expect(vi.mocked(webpush.sendNotification).mock.calls[0][1]).toBe(JSON.stringify(payload))
    })

    it.each([404, 410])('%i: vencida', async (statusCode) => {
      vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error('x'), { statusCode }))
      expect(await enviarPush(s, payload)).toBe('vencida')
    })

    it('500: error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 500 }))
      expect(await enviarPush(s, payload)).toBe('error')
    })

    it('sin claves: loguea y devuelve ok sin enviar', async () => {
      vi.stubEnv('VAPID_PRIVATE_KEY', '')
      vi.spyOn(console, 'log').mockImplementation(() => {})
      expect(await enviarPush(s, payload)).toBe('ok')
      expect(webpush.sendNotification).not.toHaveBeenCalled()
    })
  })
})
