export type EstadoBanner = 'oculto' | 'activar' | 'instalar'

/**
 * Qué mostrar en el banner de "activá los avisos". Todo entra como dato plano
 * para que sea puro; quien lo usa lee del navegador:
 * - habilitado: la sesión es de vecino y el barrio tiene paquetes activos.
 * - soportaPush: `'PushManager' in window`.
 * - permiso: `Notification.permission` ('default' | 'granted' | 'denied').
 * - standalone: `matchMedia('(display-mode: standalone)').matches` o `navigator.standalone`.
 * - esIos: detección por user agent (iPhone/iPad).
 * - ahoraNo: la marca de "ahora no" guardada en localStorage.
 *
 * En iOS el push solo existe con la app instalada en la pantalla de inicio:
 * antes de eso `soportaPush` es falso, y lo que corresponde es explicar cómo instalarla.
 */
export function estadoBanner(e: {
  habilitado: boolean
  soportaPush: boolean
  permiso: string
  standalone: boolean
  esIos: boolean
  ahoraNo: boolean
}): EstadoBanner {
  if (!e.habilitado || e.ahoraNo || e.permiso === 'granted' || e.permiso === 'denied') return 'oculto'
  if (e.esIos && !e.standalone) return 'instalar'
  return e.soportaPush ? 'activar' : 'oculto'
}

export function sinVerCount(paquetes: { sinVer: boolean }[]): number {
  return paquetes.filter((p) => p.sinVer).length
}
