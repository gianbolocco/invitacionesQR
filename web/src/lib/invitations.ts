import { hoyISO, fechaCorta } from './fechas'
export { hoyISO, fechaCorta } from './fechas'

export type Invitation = {
  id: string
  kind: 'visita' | 'frecuente' | 'proveedor'
  guestName: string
  guestDoc: string | null
  plate: string | null
  validFrom: string
  validTo: string
  weekdays: number[] | null
  capacity: number
  token: string
  revokedAt: string | null
  createdAt: string
  createdBy: string
  creatorName: string
  unitId: string
  unitLabel: string
  usedCount: number
}

export const KIND_LABEL: Record<Invitation['kind'], string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  proveedor: 'Proveedor',
}

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function vigencia(inv: Invitation): string {
  if (inv.validFrom === inv.validTo) {
    return inv.validFrom === hoyISO() ? 'Hoy' : fechaCorta(inv.validFrom)
  }
  const dias = inv.weekdays?.length ? ` · ${inv.weekdays.map((d) => DIAS[d]).join(' ')}` : ''
  return `${fechaCorta(inv.validFrom)} a ${fechaCorta(inv.validTo)}${dias}`
}
