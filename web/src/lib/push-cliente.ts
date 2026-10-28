import { api } from '@/lib/api'

/** Lo que el navegador dice de este dispositivo; solo en el cliente. */
export function entornoPush() {
  const ua = navigator.userAgent
  return {
    soportaPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permiso: 'Notification' in window ? Notification.permission : 'denied',
    // iPadOS se presenta como Mac: se distingue por la pantalla táctil.
    esIos: /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    standalone: matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  }
}

const CLAVE_AHORA_NO = 'avisos-ahora-no'
// Tocar "Ahora no" es por dispositivo: localStorage puede estar bloqueado, y ahí simplemente no se recuerda.
export function leerAhoraNo(): boolean {
  try { return localStorage.getItem(CLAVE_AHORA_NO) === '1' } catch { return false }
}
export function guardarAhoraNo() {
  try { localStorage.setItem(CLAVE_AHORA_NO, '1') } catch { /* sin storage no se recuerda */ }
}

function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Suscripción vigente de este dispositivo, si hay. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Registra el worker, pide permiso y suscribe. Devuelve el permiso resultante. */
export async function activarPush(): Promise<NotificationPermission> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return permiso
  const { key } = await api<{ key: string | null }>('/push/public-key')
  if (!key) throw new Error('push_sin_clave')
  await navigator.serviceWorker.register('/sw.js')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(key) })
  const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api('/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint, keys }) })
  return permiso
}

export async function desactivarPush(): Promise<void> {
  const sub = await suscripcionActual()
  if (!sub) return
  await api('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
  await sub.unsubscribe()
}
