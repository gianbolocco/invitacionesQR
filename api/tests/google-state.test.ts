import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type { Router } from 'express'

/**
 * El `state` de OAuth, que es lo único del flujo de Google que se puede probar
 * sin hablar con Google: los tres casos malos se rechazan ANTES de canjear el
 * code, así que no hace falta red ni mocks.
 *
 * El router lee las credenciales al importarse, así que se importa recién
 * después de ponerlas en el entorno.
 */
let app: express.Express

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  process.env.WEB_ORIGIN = 'http://localhost:3000'
  const { googleRoutes } = await import('../src/routes/google.js') as { googleRoutes: Router }
  app = express()
  app.use(cookieParser())
  app.use('/auth', googleRoutes)
})

const cookieDeState = (res: request.Response): string | undefined =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith('gstate='))

describe('el state de Google', () => {
  it('manda el mismo valor por la URL y por una cookie httpOnly', async () => {
    const res = await request(app).get('/auth/google').expect(302)

    const enCookie = cookieDeState(res)
    expect(enCookie).toBeDefined()
    expect(enCookie).toContain('HttpOnly')

    const enUrl = new URL(res.headers.location).searchParams.get('state')
    expect(enUrl).toBeTruthy()
    expect(enCookie).toContain(`gstate=${enUrl}`)
  })

  it('no repite el state entre dos intentos', async () => {
    const a = new URL((await request(app).get('/auth/google')).headers.location)
    const b = new URL((await request(app).get('/auth/google')).headers.location)
    expect(a.searchParams.get('state')).not.toBe(b.searchParams.get('state'))
  })

  it('rechaza el callback sin cookie: es el CSRF de login', async () => {
    const res = await request(app)
      .get('/auth/google/callback?code=robado&state=cualquiera')
      .expect(302)

    expect(res.headers.location).toBe('http://localhost:3000/login?error=state_invalido')
    // Y sobre todo: no dejó ninguna sesión abierta.
    const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? []
    expect(cookies.some((c) => c.startsWith('sid='))).toBe(false)
  })

  it('rechaza el callback si el state no coincide con la cookie', async () => {
    const inicio = await request(app).get('/auth/google')
    const res = await request(app)
      .get('/auth/google/callback?code=robado&state=otro-distinto')
      .set('Cookie', cookieDeState(inicio)!.split(';')[0])
      .expect(302)

    expect(res.headers.location).toContain('error=state_invalido')
  })

  it('con el state bien pero sin code, tampoco entra', async () => {
    const inicio = await request(app).get('/auth/google')
    const state = new URL(inicio.headers.location).searchParams.get('state')
    const res = await request(app)
      .get(`/auth/google/callback?state=${state}`)
      .set('Cookie', `gstate=${state}`)
      .expect(302)

    expect(res.headers.location).toContain('error=missing_code')
  })

  it('un code inválido vuelve al login y no revienta con un 500 en JSON', async () => {
    const inicio = await request(app).get('/auth/google')
    const state = new URL(inicio.headers.location).searchParams.get('state')
    const res = await request(app)
      .get(`/auth/google/callback?code=no-sirve&state=${state}`)
      .set('Cookie', `gstate=${state}`)

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/login?error=')
  })
})
