export type EmailBrand = {
  name: string
  color: string
  logoUrl: string | null
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

const colorSeguro = (color: string) => /^#[\da-f]{6}$/i.test(color) ? color : '#1e6b47'
const nombreAsunto = (name: string) => name.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

function layout(brand: EmailBrand, preheader: string, content: string): string {
  const name = escapeHtml(brand.name)
  const color = colorSeguro(brand.color)
  const mark = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="48" height="48" alt="${name}" style="display:block;width:48px;height:48px;object-fit:contain;background:#ffffff;border-radius:10px;padding:4px;">`
    : `<span style="display:block;width:48px;height:48px;border-radius:10px;background:#ffffff;color:${color};font-size:22px;font-weight:800;line-height:48px;text-align:center;">V</span>`

  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f3ef;font-family:Arial,Helvetica,sans-serif;color:#202820;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1f3ef;">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e1e5df;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:22px 28px;background:${color};">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="padding-right:13px;">${mark}</td>
              <td valign="middle">
                <div style="font-size:18px;line-height:23px;font-weight:700;color:#ffffff;">${name}</div>
                <div style="padding-top:3px;font-size:11px;line-height:15px;font-weight:700;letter-spacing:1.8px;color:#ffffff;opacity:.82;">VISITPASS</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:32px 32px 28px;">
          ${content}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f7f8f6;border-top:1px solid #e8ebe6;font-size:12px;line-height:19px;color:#667067;">
          Correo enviado por VisitPass para ${name}. Si no esperabas este mensaje, contactá a la administración de tu barrio.
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#7a837a;">VisitPass · Acceso y control de visitas</p>
    </td></tr>
  </table>
</body>
</html>`
}

export function invitationEmail(
  brand: EmailBrand,
  recipient: string,
  url: string,
  expiresDays: number,
): EmailMessage {
  const neighborhood = escapeHtml(brand.name)
  const name = escapeHtml(recipient)
  const safeUrl = escapeHtml(url)
  const color = colorSeguro(brand.color)
  const preheader = `La administración de ${brand.name} te invitó a activar tu acceso.`
  const subject = `Invitación de ${nombreAsunto(brand.name)} | VisitPass`
  const html = layout(brand, preheader, `
    <p style="margin:0 0 9px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;color:${color};">INVITACIÓN DE ACCESO</p>
    <h1 style="margin:0 0 16px;font-size:27px;line-height:34px;color:#202820;">Hola, ${name}</h1>
    <p style="margin:0 0 14px;font-size:16px;line-height:25px;color:#39433a;">La administración de <strong>${neighborhood}</strong> creó tu acceso a VisitPass para que puedas gestionar las visitas de tu casa.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:25px;color:#39433a;">Activá tu cuenta y elegí una contraseña segura.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;">
      <tr><td align="center" bgcolor="${color}" style="border-radius:8px;">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid ${color};border-radius:8px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">Activar mi acceso</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#667067;">El enlace vence en ${expiresDays} días y solo se puede usar una vez.</p>
    <p style="margin:0;font-size:13px;line-height:20px;color:#667067;">Si el botón no abre, copiá este enlace en el navegador:<br><a href="${safeUrl}" style="color:${color};word-break:break-all;">${safeUrl}</a></p>
  `)
  const text = [
    `VISITPASS · ${brand.name}`,
    '',
    `Hola, ${recipient}.`,
    `La administración de ${brand.name} creó tu acceso a VisitPass para que puedas gestionar las visitas de tu casa.`,
    'Activá tu cuenta y elegí una contraseña segura:',
    url,
    '',
    `El enlace vence en ${expiresDays} días y solo se puede usar una vez.`,
    'Si no esperabas esta invitación, contactá a la administración de tu barrio.',
  ].join('\n')

  return { subject, html, text }
}

export function passwordResetEmail(
  brand: EmailBrand,
  recipient: string,
  url: string,
  expiresMinutes: number,
): EmailMessage {
  const neighborhood = escapeHtml(brand.name)
  const name = escapeHtml(recipient)
  const safeUrl = escapeHtml(url)
  const color = colorSeguro(brand.color)
  const preheader = `Enlace seguro para restablecer tu contraseña de VisitPass en ${brand.name}.`
  const subject = `Restablecé tu contraseña | VisitPass · ${nombreAsunto(brand.name)}`
  const html = layout(brand, preheader, `
    <p style="margin:0 0 9px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;color:${color};">SEGURIDAD DE LA CUENTA</p>
    <h1 style="margin:0 0 16px;font-size:27px;line-height:34px;color:#202820;">Nueva contraseña</h1>
    <p style="margin:0 0 14px;font-size:16px;line-height:25px;color:#39433a;">Hola, ${name}. Recibimos un pedido para cambiar la contraseña de tu cuenta de VisitPass en <strong>${neighborhood}</strong>.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:25px;color:#39433a;">Si lo pediste vos, elegí una contraseña nueva desde este enlace:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;">
      <tr><td align="center" bgcolor="${color}" style="border-radius:8px;">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid ${color};border-radius:8px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">Restablecer contraseña</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#667067;">Por seguridad, el enlace vence en ${expiresMinutes} minutos y solo se puede usar una vez.</p>
    <p style="margin:0;font-size:13px;line-height:20px;color:#667067;">Si no pediste este cambio, ignorá el correo; tu contraseña seguirá igual.</p>
  `)
  const text = [
    `VISITPASS · ${brand.name}`,
    '',
    `Hola, ${recipient}.`,
    `Recibimos un pedido para cambiar la contraseña de tu cuenta de VisitPass en ${brand.name}.`,
    'Si lo pediste vos, elegí una contraseña nueva desde este enlace:',
    url,
    '',
    `Por seguridad, el enlace vence en ${expiresMinutes} minutos y solo se puede usar una vez.`,
    'Si no pediste este cambio, ignorá el correo; tu contraseña seguirá igual.',
  ].join('\n')

  return { subject, html, text }
}
