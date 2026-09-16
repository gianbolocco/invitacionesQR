import { Router } from 'express'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { linkOrLoginWithGoogle } from '../services/google.js'
import { createSession, setSessionCookie } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/auth/google/callback`
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

const STATE_COOKIE = 'gstate'
const STATE_MINUTES = 10

function client() {
  if (!clientId || !clientSecret) throw new AppError(501, 'google_not_configured')
  return new OAuth2Client({ clientId, clientSecret, redirectUri })
}

/** Comparación en tiempo constante, tolerante a largos distintos. */
function mismoState(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const googleRoutes = Router()

/** Le dice al front si mostrar o no el botón de Google. */
googleRoutes.get('/google/enabled', (_req, res) => {
  res.json({ enabled: Boolean(clientId && clientSecret) })
})

/*
 * El `state` no es decorativo: sin él, el callback acepta cualquier `code` que
 * le llegue. Un atacante empieza el flujo con SU cuenta de Google, se guarda el
 * code y hace que la víctima abra el callback con ese code — la víctima termina
 * logueada en la cuenta del atacante y cargando ahí sus invitaciones y su lote.
 *
 * El valor viaja por dos caminos que el atacante no controla a la vez: la URL de
 * Google y una cookie del navegador de quien empezó el flujo. Si no coinciden,
 * el flujo no lo empezó esta persona.
 */
googleRoutes.get('/google', (_req, res) => {
  const state = randomBytes(32).toString('base64url')

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' y no 'strict': la cookie tiene que sobrevivir el redirect DESDE
    // Google, que es una navegación de otro sitio.
    sameSite: 'lax',
    maxAge: STATE_MINUTES * 60_000,
    path: '/auth/google',
  })

  res.redirect(client().generateAuthUrl({
    scope: ['openid', 'email'],
    prompt: 'select_account',
    state,
  }))
})

googleRoutes.get('/google/callback', async (req, res) => {
  // El error se devuelve por redirect y no como JSON: la persona está en medio
  // de una navegación del navegador, no de un fetch.
  const volverConError = (code: string) => {
    res.clearCookie(STATE_COOKIE, { path: '/auth/google' })
    res.redirect(`${webOrigin}/login?error=${code}`)
  }

  const esperado = String(req.cookies?.[STATE_COOKIE] ?? '')
  const recibido = String(req.query.state ?? '')
  if (!esperado || !recibido || !mismoState(esperado, recibido)) {
    return volverConError('state_invalido')
  }

  const code = String(req.query.code ?? '')
  if (!code) return volverConError('missing_code')

  try {
    const oauth = client()
    const { tokens } = await oauth.getToken(code)
    if (!tokens.id_token) return volverConError('invalid_google_token')

    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId })
    const p = ticket.getPayload()
    if (!p?.sub || !p.email) return volverConError('invalid_google_token')

    const personId = await linkOrLoginWithGoogle({
      sub: p.sub, email: p.email, emailVerified: p.email_verified === true,
    })

    res.clearCookie(STATE_COOKIE, { path: '/auth/google' })
    setSessionCookie(res, await createSession(personId, req.get('user-agent')))
    res.redirect(webOrigin)
  } catch (err) {
    // Antes esto solo envolvía linkOrLogin: si fallaba el intercambio del code
    // o la verificación del token, salía un 500 en JSON en medio del redirect.
    volverConError(err instanceof AppError ? err.code : 'google_failed')
  }
})
