import { todayInBuenosAires, weekdayInBuenosAires } from './lib/dates.js'
import { aplicaFranjas, dentroDeFranja, type Franja } from './lib/franjas.js'
import { seguroVigente } from './lib/seguro.js'

export type InvitationLike = {
  validFrom: string   // 'YYYY-MM-DD'
  validTo: string     // 'YYYY-MM-DD'
  weekdays: number[] | null
  capacity: number
  revokedAt: Date | null
  kind: string
  frequentAs: string | null
  tradeId: string | null
  requiresInsurance: boolean
  insuranceComplete: boolean
  insuranceExpiresOn: string | null
}

export type EntryReason = 'revoked' | 'not_yet' | 'expired' | 'wrong_weekday' | 'outside_hours' | 'no_capacity' | 'no_insurance' | 'insurance_expired'

export type EntryCheck =
  | { ok: true }
  | { ok: false; reason: EntryReason }

/**
 * Única pieza no trivial del sistema. Función pura: sin base, sin reloj interno.
 * El orden de los rechazos importa y está testeado: revocada gana sobre todo,
 * después la ventana, después el día, después el horario del proveedor, y al final el cupo y el seguro: el seguro es lo único que se arregla en la barrera.
 */
export function canEnter(inv: InvitationLike, now: Date, usedCount: number, franjas: Franja[] = []): EntryCheck {
  if (inv.revokedAt) return { ok: false, reason: 'revoked' }

  // Comparar 'YYYY-MM-DD' como string es correcto: el formato ISO ordena
  // lexicográficamente igual que cronológicamente.
  const today = todayInBuenosAires(now)
  if (today < inv.validFrom) return { ok: false, reason: 'not_yet' }
  if (today > inv.validTo) return { ok: false, reason: 'expired' }

  if (inv.weekdays?.length && !inv.weekdays.includes(weekdayInBuenosAires(now))) {
    return { ok: false, reason: 'wrong_weekday' }
  }

  if (aplicaFranjas(inv.kind, inv.frequentAs) && !dentroDeFranja(franjas, inv.tradeId, now)) {
    return { ok: false, reason: 'outside_hours' }
  }

  if (usedCount >= inv.capacity) return { ok: false, reason: 'no_capacity' }

  if (inv.requiresInsurance) {
    if (!inv.insuranceComplete || !inv.insuranceExpiresOn) return { ok: false, reason: 'no_insurance' }
    if (!seguroVigente(inv.insuranceExpiresOn, now)) return { ok: false, reason: 'insurance_expired' }
  }

  return { ok: true }
}
