import { invitationEmail, passwordResetEmail } from '../lib/mail-templates.js'
import { sendMail } from '../lib/mail.js'
import { getBranding } from './branding.js'

async function marcaDeCorreo() {
  const brand = await getBranding()
  const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '')
  const apiOrigin = (process.env.API_ORIGIN ?? `${webOrigin}/api`).replace(/\/+$/, '')

  return {
    name: brand.nombre,
    color: brand.color,
    logoUrl: brand.tieneLogo
      ? `${apiOrigin}/branding/logo${brand.logoVersion ? `?v=${brand.logoVersion}` : ''}`
      : null,
  }
}

export async function sendInvitationEmail(
  to: string,
  name: string,
  url: string,
  expiresDays: number,
): Promise<void> {
  const email = invitationEmail(await marcaDeCorreo(), name, url, expiresDays)
  await sendMail(to, email.subject, { html: email.html, text: email.text })
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  url: string,
  expiresMinutes: number,
): Promise<void> {
  const email = passwordResetEmail(await marcaDeCorreo(), name, url, expiresMinutes)
  await sendMail(to, email.subject, { html: email.html, text: email.text })
}
