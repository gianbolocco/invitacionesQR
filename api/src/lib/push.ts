import { parse } from 'node:url'
import webpush from 'web-push'

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string }
export type PayloadPush = { titulo: string; cuerpo: string; url: string }

/*
 * Igual que mail.ts: en producción, sin claves no se arranca. Un aviso que
 * nunca sale es peor que un deploy que falla a la vista.
 */
if (
  process.env.NODE_ENV === 'production' &&
  !(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
) {
  throw new Error('En producción hacen falta VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT')
}

/*
 * El servidor hace POST al endpoint que manda el cliente: aceptar cualquier URL
 * es un SSRF contra la red interna. Solo se admiten los servicios de push de
 * los navegadores (Chrome/Edge/Android, Safari, Firefox, Windows).
 */
const HOSTS_PUSH = ['fcm.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com']

/*
 * web-push manda con el url.parse legacy y acá se valida con WHATWG: para
 * 'https://evil.com;.fcm.googleapis.com/x' discrepan (uno ve evil.com, el otro
 * ve un host que termina en fcm.googleapis.com). Por eso el hostname se limita
 * a letras, números, guiones y puntos, y los dos parsers tienen que coincidir.
 */
export function endpointPermitido(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'https:' || u.port !== '' || u.username || u.password) return false
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(u.hostname)) return false
  if (parse(url).hostname !== u.hostname) return false
  return HOSTS_PUSH.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
}

/** La clave pública que el navegador necesita para suscribirse; null si no hay. */
export function clavePublica(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

/** Las claves se leen en cada envío y se pasan por llamada, sin estado global
 *  de web-push. Sin claves, el aviso se imprime en consola: en dev se prueba
 *  el flujo entero sin configurar nada. 'vencida' = el navegador ya no la
 *  acepta (404/410) y conviene borrarla. */
export async function enviarPush(sub: SuscripcionPush, payload: PayloadPush): Promise<'ok' | 'vencida' | 'error'> {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env
  if (!publicKey || !privateKey || !subject) {
    console.log(`\n-- PUSH a ${sub.endpoint} --\n${JSON.stringify(payload)}\n--\n`)
    return 'ok'
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ titulo: payload.titulo, cuerpo: payload.cuerpo, url: payload.url }),
      { vapidDetails: { subject, publicKey, privateKey } },
    )
    return 'ok'
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'vencida'
    console.error(`Push a ${sub.endpoint} falló:`, e)
    return 'error'
  }
}
