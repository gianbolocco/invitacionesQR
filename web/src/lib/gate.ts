'use client'
import { api, ApiError } from './api'
import { fechaNumerica } from './fechas'
import { DIAS } from './invitations'

export type Check = { ok: true } | { ok: false; reason: string }

export type Adentro = { entryId: string; enteredAt: string } | null

export type Resultado = {
  invitation: {
    id: string
    kind: 'visita' | 'frecuente' | 'proveedor'
    guestName: string
    guestDoc: string | null
    plate: string | null
    validFrom: string
    validTo: string
    capacity: number
    weekdays: number[] | null
    unitLabel: string
    /** El vecino que invita, o PORTERIA si fue un alta exprés. */
    inviterName: string
  }
  check: Check
  usedCount: number
  lastEntryAt: string | null
  /** Si viene, el próximo movimiento es un egreso y `check` no aplica. */
  adentro: Adentro
}

/** Una fila de la bitácora, como la devuelven el ingreso y el egreso. */
export type Movimiento = {
  id: string
  enteredAt: string
  exitedAt: string | null
}

export type Hit = {
  id: string
  guestName: string
  guestDoc: string | null
  unitLabel: string
  plate: string | null
  adentro: boolean
}

export type UnidadHit = { unitId: string; unitLabel: string; residentName: string }

export const MOTIVO: Record<string, string> = {
  revoked: 'La anularon',
  not_yet: 'Todavía no empieza',
  expired: 'Venció',
  wrong_weekday: 'Hoy no está habilitado',
  no_capacity: 'Cupo agotado',
  no_esta_adentro: 'No figura adentro',
  fuera_de_plazo: 'Pasó el tiempo para deshacer',
}

/**
 * El dato concreto detrás del motivo, para que el guardia se lo pueda decir al
 * invitado sin llamar a nadie: no solo "Venció", sino hasta cuándo valía.
 */
export function detalleRechazo(
  reason: string,
  inv: { validFrom: string; validTo: string; weekdays: number[] | null },
): string | null {
  if (reason === 'expired') return `Era válida hasta el ${fechaNumerica(inv.validTo)}`
  if (reason === 'not_yet') return `Es válida desde el ${fechaNumerica(inv.validFrom)}`
  if (reason === 'wrong_weekday' && inv.weekdays?.length) {
    return `Habilitada solo ${inv.weekdays.map((d) => DIAS.at(d)).join(' ')}`
  }
  return null
}

export const porToken = (token: string) => api<Resultado>(`/gate/check/${token}`)
export const buscar = (q: string, signal?: AbortSignal) =>
  api<Hit[]>(`/gate/search?q=${encodeURIComponent(q)}`, { signal })

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'
    if (error.status === 403) return 'Esta cuenta no tiene permiso para usar la garita.'
    if (error.status === 404) return 'Ese QR no es de una invitación válida.'
  }
  return 'No se pudo validar el QR. Revisá la conexión y probá de nuevo.'
}

export const porId =(id: string) => api<Resultado>(`/gate/invitation/${id}`)

export const registrarIngreso = (datos: {
  invitationId: string
  guestName: string
  guestDoc?: string
  plate?: string
}) => api<Movimiento>('/gate/entries', { method: 'POST', body: JSON.stringify(datos) })

export const registrarEgreso = (invitationId: string) =>
  api<Movimiento>('/gate/exits', { method: 'POST', body: JSON.stringify({ invitationId }) })

export const buscarUnidades = (q: string) => api<UnidadHit[]>(`/gate/units?q=${encodeURIComponent(q)}`)

export const altaExpres = (datos: { unitId: string; guestName: string; guestDoc?: string; plate?: string }) =>
  api<{ id: string }>('/gate/invitations', { method: 'POST', body: JSON.stringify(datos) })

export const deshacer = (entryId: string) =>
  api<{ deshecho: 'ingreso' | 'egreso' }>(`/gate/entries/${entryId}/undo`, { method: 'POST' })

export { hora } from './fechas'
