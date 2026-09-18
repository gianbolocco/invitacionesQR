'use client'
import { api } from './api'

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
    unitLabel: string
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

export const MOTIVO: Record<string, string> = {
  revoked: 'La anularon',
  not_yet: 'Todavía no empieza',
  expired: 'Venció',
  wrong_weekday: 'Hoy no está habilitado',
  no_capacity: 'Cupo agotado',
  no_esta_adentro: 'No figura adentro',
  fuera_de_plazo: 'Pasó el tiempo para deshacer',
}

export const porToken = (token: string) => api<Resultado>(`/gate/check/${token}`)
export const porId = (id: string) => api<Resultado>(`/gate/invitation/${id}`)

export const registrarIngreso = (datos: {
  invitationId: string
  guestName: string
  guestDoc?: string
  plate?: string
}) => api<Movimiento>('/gate/entries', { method: 'POST', body: JSON.stringify(datos) })

export const registrarEgreso = (invitationId: string) =>
  api<Movimiento>('/gate/exits', { method: 'POST', body: JSON.stringify({ invitationId }) })

export const deshacer = (entryId: string) =>
  api<{ deshecho: 'ingreso' | 'egreso' }>(`/gate/entries/${entryId}/undo`, { method: 'POST' })

export function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}
