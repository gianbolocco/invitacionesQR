export type Invitation = {
  id: string
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
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
  joinedCount: number
}

export const KIND_LABEL: Record<Invitation['kind'], string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  evento: 'Evento',
  proveedor: 'Proveedor',
}

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** 'YYYY-MM-DD' de hoy en Buenos Aires, igual que en la API. */
export function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** "14 sep" — corto, para tarjetas. */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
    .format(new Date(y, m - 1, d))
}

export function vigencia(inv: Invitation): string {
  if (inv.validFrom === inv.validTo) {
    return inv.validFrom === hoyISO() ? 'Hoy' : fechaCorta(inv.validFrom)
  }
  const dias = inv.weekdays?.length ? ` · ${inv.weekdays.map((d) => DIAS[d]).join(' ')}` : ''
  return `${fechaCorta(inv.validFrom)} a ${fechaCorta(inv.validTo)}${dias}`
}

export function estaVigente(inv: Invitation): boolean {
  return !inv.revokedAt && inv.validTo >= hoyISO() && inv.usedCount < inv.capacity
}
