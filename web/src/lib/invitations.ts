import { hoyISO, fechaCorta } from './fechas'
import type { DatosPase } from '@/components/dominio/pase'
export { hoyISO, fechaCorta } from './fechas'

export type Invitation = {
  id: string
  kind: 'visita' | 'frecuente' | 'proveedor'
  /** Solo en las frecuentes: si viene de visita o como proveedor. */
  frequentAs?: 'visita' | 'proveedor' | null
  guestName: string
  guestDoc: string | null
  plate: string | null
  note: string | null
  validFrom: string
  validTo: string
  weekdays: number[] | null
  capacity: number
  token: string
  revokedAt: string | null
  /** null = no la anuló la portería. '' = la anuló sin dejar motivo. */
  revokedReason: string | null
  createdAt: string
  createdBy: string
  creatorName: string
  unitId: string
  unitLabel: string
  usedCount: number
  /** Hay un ingreso sin salida: está en el barrio ahora. */
  adentro: boolean
  /** ISO del último ingreso, o null si nunca entró. */
  ultimoIngreso: string | null
}

export const KIND_LABEL: Record<Invitation['kind'], string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  proveedor: 'Proveedor',
}

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/**
 * Lo que la API pone en lugar del nombre cuando la invitación la creó la
 * portería (alta exprés). Mismo literal que api/src/lib/porteria.ts.
 */
export const PORTERIA = 'Autorizado por portería'

/** "invita Martín", o "Autorizado por portería" solo: con prefijo no se lee. */
export function quienInvita(nombre: string, prefijo = 'invita'): string {
  return nombre === PORTERIA ? PORTERIA : `${prefijo} ${nombre}`
}

/** "Hoy", "14 sept" o "11 oct a 9 ene · Lun Mié Vie". Sirve para la lista y para el invitado. */
export function vigencia(v: { validFrom: string; validTo: string; weekdays: number[] | null }): string {
  if (v.validFrom === v.validTo) {
    return v.validFrom === hoyISO() ? 'Hoy' : fechaCorta(v.validFrom)
  }
  const dias = v.weekdays?.length ? ` · ${v.weekdays.map((d) => DIAS[d]).join(' ')}` : ''
  return `${fechaCorta(v.validFrom)} a ${fechaCorta(v.validTo)}${dias}`
}

/** Los datos que muestra el pase del vecino. */
export function datosPase(inv: Invitation): DatosPase {
  return {
    tipo: KIND_LABEL[inv.kind],
    vigencia: vigencia(inv),
    invitado: inv.guestName,
    unidad: inv.unitLabel,
    invita: inv.creatorName,
  }
}

/**
 * El link que recibe el invitado. Sale del origen de la página: la misma app
 * sirve en cualquier dominio. Solo se llama en el navegador.
 */
export function urlPublica(token: string): string {
  const origen = typeof window === 'undefined' ? '' : window.location.origin
  return `${origen}/i/${token}`
}

/** "Volver a invitar": el formulario nuevo precargado con los datos de esta. */
export function urlVolverAInvitar(inv: Pick<Invitation, 'kind' | 'guestName' | 'guestDoc' | 'plate'>): string {
  const p = new URLSearchParams({ kind: inv.kind, guestName: inv.guestName })
  if (inv.guestDoc) p.set('guestDoc', inv.guestDoc)
  if (inv.plate) p.set('plate', inv.plate)
  return `/invitaciones/nueva?${p}`
}
