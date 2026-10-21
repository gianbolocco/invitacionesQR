export type EmailBrand = {
  name: string
  color: string
  /** El logo del barrio o, si no subió uno, el ícono de Pazzit en su color. */
  logoUrl: string
}

export type EmailMessage = {
  subject: string
  html: string
  text: string
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]!)

// Neutros cálidos de Pazzit (web/src/app/globals.css), en claro: los clientes
// de correo no leen variables CSS.
const INK = '#14130f'
const INK_SOFT = '#6b645a'
const SURFACE = '#f6f3ee'
const LINE = '#e6e0d6'

const colorSeguro = (color: string) => /^#[\da-f]{6}$/i.test(color) ? color : '#2f5bff'
const nombreAsunto = (name: string) => name.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

type Contenido = {
  preheader: string
  etiqueta: string
  titulo: string
  parrafos: string[]
  boton: { texto: string; url: string }
  notas: string[]
}

/** Header blanco con el logo: un logo de barrio cualquiera y el ícono de
 *  Pazzit (ya un cuadrado de color) se leen bien los dos sobre blanco. */
function layout(brand: EmailBrand, c: Contenido): string {
  const name = escapeHtml(brand.name)
  const color = colorSeguro(brand.color)
  const url = escapeHtml(c.boton.url)

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Onest,'Segoe UI',Arial,Helvetica,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(c.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${SURFACE};">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid ${LINE};border-top:4px solid ${color};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="padding-right:12px;"><img src="${escapeHtml(brand.logoUrl)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;object-fit:contain;border-radius:10px;"></td>
              <td valign="middle" style="font-size:17px;line-height:22px;font-weight:700;color:${INK};">${name}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 32px 30px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;color:${color};">${escapeHtml(c.etiqueta)}</p>
          <h1 style="margin:0 0 16px;font-size:26px;line-height:32px;font-weight:700;color:${INK};">${c.titulo}</h1>
          ${c.parrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:25px;color:${INK};">${p}</p>`).join('\n          ')}
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0 24px;">
            <tr><td align="center" bgcolor="${color}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:14px 26px;border-radius:999px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">${escapeHtml(c.boton.texto)}</a>
            </td></tr>
          </table>
          ${c.notas.map((n) => `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${INK_SOFT};">${n}</p>`).join('\n          ')}
          <p style="margin:0;font-size:13px;line-height:20px;color:${INK_SOFT};">Si el botón no abre, copiá este enlace en el navegador:<br><a href="${url}" style="color:${color};word-break:break-all;">${url}</a></p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:${SURFACE};border-top:1px solid ${LINE};font-size:12px;line-height:19px;color:${INK_SOFT};">
          Te escribimos por pedido de la administración de ${name}. Si no esperabas este correo, avisales.
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:${INK_SOFT};">Enviado con Pazzit · Invitaciones y control de acceso</p>
    </td></tr>
  </table>
</body>
</html>`
}

function texto(brand: EmailBrand, lineas: string[]): string {
  return [`${brand.name} · Pazzit`, '', ...lineas].join('\n')
}

export function invitationEmail(
  brand: EmailBrand,
  recipient: string,
  url: string,
  expiresDays: number,
): EmailMessage {
  const neighborhood = escapeHtml(brand.name)
  const subject = `Activá tu acceso a ${nombreAsunto(brand.name)}`
  const html = layout(brand, {
    preheader: `La administración de ${brand.name} te dio de alta para gestionar tus visitas.`,
    etiqueta: 'INVITACIÓN DE ACCESO',
    titulo: `Hola, ${escapeHtml(recipient)}`,
    parrafos: [
      `La administración de <strong>${neighborhood}</strong> te dio de alta para que invites a tus visitas y sigas sus ingresos desde el celular.`,
      'Activá tu cuenta y elegí una contraseña.',
    ],
    boton: { texto: 'Activar mi acceso', url },
    notas: [`El enlace vence en ${expiresDays} días y solo se puede usar una vez.`],
  })
  const text = texto(brand, [
    `Hola, ${recipient}.`,
    `La administración de ${brand.name} te dio de alta para que invites a tus visitas y sigas sus ingresos desde el celular.`,
    'Activá tu cuenta y elegí una contraseña:',
    url,
    '',
    `El enlace vence en ${expiresDays} días y solo se puede usar una vez.`,
    'Si no esperabas esta invitación, avisale a la administración de tu barrio.',
  ])

  return { subject, html, text }
}

export function passwordResetEmail(
  brand: EmailBrand,
  recipient: string,
  url: string,
  expiresMinutes: number,
): EmailMessage {
  const neighborhood = escapeHtml(brand.name)
  const subject = `Restablecé tu contraseña de ${nombreAsunto(brand.name)}`
  const html = layout(brand, {
    preheader: `Enlace para elegir una contraseña nueva en ${brand.name}.`,
    etiqueta: 'SEGURIDAD DE LA CUENTA',
    titulo: 'Elegí una contraseña nueva',
    parrafos: [
      `Hola, ${escapeHtml(recipient)}. Recibimos un pedido para cambiar la contraseña de tu cuenta en <strong>${neighborhood}</strong>.`,
      'Si lo pediste vos, seguí desde este enlace:',
    ],
    boton: { texto: 'Restablecer contraseña', url },
    notas: [
      `Por seguridad, el enlace vence en ${expiresMinutes} minutos y solo se puede usar una vez.`,
      'Si no pediste este cambio, ignorá el correo: tu contraseña sigue igual.',
    ],
  })
  const text = texto(brand, [
    `Hola, ${recipient}.`,
    `Recibimos un pedido para cambiar la contraseña de tu cuenta en ${brand.name}.`,
    'Si lo pediste vos, seguí desde este enlace:',
    url,
    '',
    `Por seguridad, el enlace vence en ${expiresMinutes} minutos y solo se puede usar una vez.`,
    'Si no pediste este cambio, ignorá el correo: tu contraseña sigue igual.',
  ])

  return { subject, html, text }
}
