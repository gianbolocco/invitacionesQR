import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { linkOrLoginWithGoogle } from '../services/google.js'
import { createSession, setSessionCookie } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/auth/google/callback`
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

function client() {
  if (!clientId || !clientSecret) throw new AppError(501, 'google_not_configured')
  return new OAuth2Client({ clientId, clientSecret, redirectUri })
}

export const googleRoutes = Router()

/** Le dice al front si mostrar o no el botón de Google. */
googleRoutes.get('/google/enabled', (_req, res) => {
  res.json({ enabled: Boolean(clientId && clientSecret) })
})

googleRoutes.get('/google', (_req, res) => {
  res.redirect(client().generateAuthUrl({ scope: ['openid', 'email'], prompt: 'select_account' }))
})

googleRoutes.get('/google/callback', async (req, res) => {
  const code = String(req.query.code ?? '')
  if (!code) throw new AppError(400, 'missing_code')

  const oauth = client()
  const { tokens } = await oauth.getToken(code)
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token!, audience: clientId })
  const p = ticket.getPayload()
  if (!p?.sub || !p.email) throw new AppError(400, 'invalid_google_token')

  try {
    const personId = await linkOrLoginWithGoogle({
      sub: p.sub, email: p.email, emailVerified: p.email_verified === true,
    })
    setSessionCookie(res, await createSession(personId, req.get('user-agent')))
    res.redirect(webOrigin)
  } catch (err) {
    // El usuario está en medio de un redirect del navegador: el error vuelve al
    // front como query param, no como JSON.
    const code = err instanceof AppError ? err.code : 'google_failed'
    res.redirect(`${webOrigin}/login?error=${code}`)
  }
})
