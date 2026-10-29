import { todayInBuenosAires, weekdayInBuenosAires } from './lib/dates.js'
import { aplicaFranjas, dentroDeFranja, type Franja } from './lib/franjas.js'
import { seguroVigente } from './lib/seguro.js'

export type InvitationLike = {
  validFrom: string   // 'YYYY-MM-DD'
  validTo: string     // 'YYYY-MM-DD'
  weekdays: number[] | null
  capacity: number
  revokedAt: Date | null
  /** Solo un delivery: instante exacto de vencimiento. */
  expiresAt: Date | null
  kind: string
  frequentAs: string | null
  tradeId: string | null
  requiresInsurance: boolean
  insuranceComplete: boolean
  insuranceExpiresOn: string | null
  /** La creó la portería (alta exprés): el guardia ya decidió horario y seguro. */
  porteria: boolean
  /** El barrio pide el seguro del auto y vino en auto (hay patente). */
  vehicleRequiresInsurance: boolean
  /** Vencimiento del seguro del auto en el padrón; null = no está cargado. */
  vehicleInsuranceExpiresOn: string | null
  /** El barrio permite que la portería autorice un auto sin seguro. */
  vehicleOverride: boolean
}

export type EntryReason = 'revoked' | 'not_yet' | 'expired' | 'wrong_weekday' | 'outside_hours' | 'no_capacity' | 'no_insurance' | 'insurance_expired'
  | 'no_vehicle_insurance' | 'vehicle_insurance_expired'

export type EntryCheck =
  | { ok: true }
  | { ok: false; reason: EntryReason }

/**
 * Única pieza no trivial del sistema. Función pura: sin base, sin reloj interno.
 * El orden de los rechazos importa y está testeado: revocada gana sobre todo,
 * después la ventana, después el día, después el horario del proveedor, y al final el cupo y los seguros
 * (primero el de la persona, después el del auto): los seguros son lo único que se arregla en la barrera.
 */
export function canEnter(inv: InvitationLike, now: Date, usedCount: number, franjas: Franja[] = []): EntryCheck {
  if (inv.revokedAt) return { ok: false, reason: 'revoked' }

  // Comparar 'YYYY-MM-DD' como string es correcto: el formato ISO ordena
  // lexicográficamente igual que cronológicamente.
  const today = todayInBuenosAires(now)
  if (today < inv.validFrom) return { ok: false, reason: 'not_yet' }
  if (today > inv.validTo) return { ok: false, reason: 'expired' }
  // Un delivery vence por hora, no por día.
  if (inv.expiresAt && now > inv.expiresAt) return { ok: false, reason: 'expired' }

  if (inv.weekdays?.length && !inv.weekdays.includes(weekdayInBuenosAires(now))) {
    return { ok: false, reason: 'wrong_weekday' }
  }

  // Lo creó la portería: el guardia ya decidió, ni franjas ni seguro.
  if (!inv.porteria && aplicaFranjas(inv.kind, inv.frequentAs) && !dentroDeFranja(franjas, inv.tradeId, now)) {
    return { ok: false, reason: 'outside_hours' }
  }

  if (usedCount >= inv.capacity) return { ok: false, reason: 'no_capacity' }

  if (inv.requiresInsurance && !inv.porteria) {
    if (!inv.insuranceComplete || !inv.insuranceExpiresOn) return { ok: false, reason: 'no_insurance' }
    if (!seguroVigente(inv.insuranceExpiresOn, now)) return { ok: false, reason: 'insurance_expired' }
  }

  // La portería saltea el auto solo si el barrio lo permite: sin el switch, el
  // alta exprés tampoco hace entrar un auto sin seguro (la persona entra a pie).
  if (inv.vehicleRequiresInsurance && !(inv.porteria && inv.vehicleOverride)) {
    if (!inv.vehicleInsuranceExpiresOn) return { ok: false, reason: 'no_vehicle_insurance' }
    if (!seguroVigente(inv.vehicleInsuranceExpiresOn, now)) return { ok: false, reason: 'vehicle_insurance_expired' }
  }

  return { ok: true }
}
