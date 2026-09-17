'use client'
import { api } from './api'

export type Check = { ok: true } | { ok: false; reason: string }

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
}

export type Hit = { id: string; guestName: string; unitLabel: string; plate: string | null }

export const MOTIVO: Record<string, string> = {
  revoked: 'La anularon',
  not_yet: 'Todavía no empieza',
  expired: 'Venció',
  wrong_weekday: 'Hoy no está habilitado',
  no_capacity: 'Cupo agotado',
}

export const porToken = (token: string) => api<Resultado>(`/gate/check/${token}`)
export const porId = (id: string) => api<Resultado>(`/gate/invitation/${id}`)

export function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}
