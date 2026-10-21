'use client'
import { api, ApiError } from './api'
import { fechaNumerica } from './fechas'
import { DIAS } from './invitations'
import type { ItemManual } from './carga-manual'
import { detalleFueraDeHorario, type Franja } from './franjas'

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
    unitId: string
    unitLabel: string
    /** El vecino que invita, o PORTERIA si fue un alta exprés. */
    inviterName: string
    note: string | null
    tradeName: string | null
  }
  /** Las franjas del rubro de un proveedor; [] para el resto. */
  franjas: Franja[]
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
  kind: 'visita' | 'frecuente' | 'proveedor'
  frequentAs: 'visita' | 'proveedor' | null
  tradeName: string | null
  anulada: boolean
  adentro: boolean
  note: string | null
}

export type UnidadHit = { unitId: string; unitLabel: string; residentName: string }

export const MOTIVO: Record<string, string> = {
  revoked: 'La anularon',
  not_yet: 'Todavía no empieza',
  expired: 'Venció',
  wrong_weekday: 'Hoy no está habilitado',
  no_capacity: 'Cupo agotado',
  outside_hours: 'Fuera de horario',
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
  extra?: { franjas: Franja[]; tradeName: string | null },
): string | null {
  if (reason === 'outside_hours') {
    if (!extra) return null
    return detalleFueraDeHorario(extra.franjas, extra.tradeName ?? 'Proveedor', new Date())
  }
  if (reason === 'expired') return `Era válida hasta el ${fechaNumerica(inv.validTo)}`
  if (reason === 'not_yet') return `Es válida desde el ${fechaNumerica(inv.validFrom)}`
  if (reason === 'wrong_weekday' && inv.weekdays?.length) {
    return `Habilitada solo ${inv.weekdays.map((d) => DIAS.at(d)).join(' ')}`
  }
  return null
}

export const porToken = (token: string) => api<Resultado>(`/gate/check/${token}`)
export const buscar = (q: string, signal?: AbortSignal) =>
  api<Hit[]>('/gate/search', { method: 'POST', body: JSON.stringify({ q }), signal })

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'
    if (error.status === 403) return 'Esta cuenta no tiene permiso para usar la garita.'
    if (error.status === 404) return 'Ese QR no es de una invitación válida.'
  }
  return 'No se pudo validar el QR. Revisá la conexión y probá de nuevo.'
}

export const porId = (id: string) => api<Resultado>(`/gate/invitation/${id}`)

export const registrarIngreso = (datos: {
  invitationId: string
  guestName: string
  guestDoc?: string
  plate?: string
}) => api<Movimiento>('/gate/entries', { method: 'POST', body: JSON.stringify(datos) })

export const registrarEgreso = (invitationId: string) =>
  api<Movimiento>('/gate/exits', { method: 'POST', body: JSON.stringify({ invitationId }) })

export const buscarUnidades = (q: string) => api<UnidadHit[]>(`/gate/units?q=${encodeURIComponent(q)}`)

export const altaExpres = (datos: { unitId: string; guestName: string; guestDoc?: string; plate?: string; note?: string }) =>
  api<{ id: string }>('/gate/invitations', { method: 'POST', body: JSON.stringify(datos) })

export const deshacer = (entryId: string) =>
  api<{ deshecho: 'ingreso' | 'egreso' }>(`/gate/entries/${entryId}/undo`, { method: 'POST' })

export { hora } from './fechas'

export const cargarManual = (items: ItemManual[]) =>
  api<{ cargados: number }>('/gate/manual', { method: 'POST', body: JSON.stringify({ items }) })

/** Qué le dice la API al guardia cuando una tanda de carga manual no se guarda. */
export function mensajeCargaManual(error: unknown): string {
  const codigo = error instanceof ApiError ? error.code : ''
  return ({
    fecha_futura: 'Esa hora todavía no pasó.',
    fuera_de_ventana: 'Solo se puede cargar lo de las últimas 48 horas.',
    salida_anterior: 'La salida es anterior al ingreso.',
    se_superpone: 'Se superpone con otro movimiento ya registrado de esa persona.',
    not_found: 'No se encontró esa invitación.',
    tanda_invalida: 'Se guardan de 1 a 50 movimientos por vez, cada uno con su persona.',
    not_your_neighborhood: 'Ese lote no es de este barrio.',
  } as Record<string, string>)[codigo] ?? 'No se pudo guardar. No se cargó nada: probá de nuevo.'
}

export const anularPorPorteria = (datos: { id: string; reason?: string }) =>
  api<{ ok: true }>(`/gate/invitations/${datos.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: datos.reason }) })

export function mensajeAnulacion(error: unknown): string {
  const codigo = error instanceof ApiError ? error.code : ''
  return ({
    guest_inside: 'No se puede anular: esa persona está adentro. Primero registrá su salida.',
    already_revoked: 'Esa invitación ya estaba anulada.',
  } as Record<string, string>)[codigo] ?? 'No se pudo anular. Probá de nuevo.'
}
