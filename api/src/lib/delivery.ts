import { todayInBuenosAires } from './dates.js'
import { AppError } from './errors.js'

export const DELIVERY_HORAS = 2
export const APPS = ['pedidosya', 'rappi', 'mercadolibre', 'otro'] as const
export type App = typeof APPS[number]
export const APP_LABEL: Record<Exclude<App, 'otro'>, string> = { pedidosya: 'PedidosYa', rappi: 'Rappi', mercadolibre: 'Mercado Libre' }

/** Lo que tiene de distinto un delivery: el nombre es la app y vence por hora. */
export function valoresDeDelivery(app: App, otro: string | undefined, ahora: Date) {
  const nombre = app === 'otro' ? otro?.trim() : APP_LABEL[app]
  if (!nombre) throw new AppError(400, 'falta_detalle')
  const expiresAt = new Date(ahora.getTime() + DELIVERY_HORAS * 3_600_000)
  return { kind: 'delivery' as const, deliveryApp: app, guestName: nombre, expiresAt,
    validFrom: todayInBuenosAires(ahora), validTo: todayInBuenosAires(expiresAt), capacity: 1 }
}
