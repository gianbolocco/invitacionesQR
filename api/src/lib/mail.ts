import { Resend } from 'resend'

const key = process.env.RESEND_API_KEY
const from = process.env.MAIL_FROM ?? 'Invitaciones <noreply@example.com>'
const resend = key ? new Resend(key) : null

/** Sin RESEND_API_KEY el mail se imprime en consola: el flujo completo se puede
 *  probar en dev sin cuenta de Resend y sin mockear nada. */
export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  if (!resend) {
    console.log(`\n-- MAIL a ${to} --\n${subject}\n${body}\n--\n`)
    return
  }
  await resend.emails.send({ from, to, subject, html: body })
}
