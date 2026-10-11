import { Resend } from 'resend'

export type MailContent = { html: string; text: string }

const key = process.env.RESEND_API_KEY
const from = process.env.MAIL_FROM ?? 'Invitaciones <noreply@example.com>'
const resend = key ? new Resend(key) : null

/*
 * En producción, sin Resend no se arranca. El fallback de consola imprime el
 * mail entero, links de alta y de reset incluidos: en un server real eso deja
 * cualquier cuenta a un `docker logs` de distancia.
 */
if (process.env.NODE_ENV === 'production' && (!key || !process.env.MAIL_FROM)) {
  throw new Error('En producción hacen falta RESEND_API_KEY y MAIL_FROM')
}

/** Sin RESEND_API_KEY el mail se imprime en consola: el flujo completo se puede
 *  probar en dev sin cuenta de Resend y sin mockear nada. */
export async function sendMail(to: string, subject: string, body: MailContent): Promise<void> {
  if (!resend) {
    console.log(`\n-- MAIL a ${to} --\n${subject}\n${body.text}\n--\n`)
    return
  }
  const { data, error } = await resend.emails.send({ from, to, subject, html: body.html, text: body.text })
  if (error) {
    console.error(`Resend rechazó el mail a ${to}:`, error)
    throw new Error(`Resend rechazó el mail: ${error.message}`)
  }
  console.log(`Resend aceptó el mail a ${to} (${data.id})`)
}
