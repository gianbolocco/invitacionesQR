import { todayInBuenosAires, weekdayInBuenosAires } from './lib/dates.js'

export type InvitationLike = {
  validFrom: string   // 'YYYY-MM-DD'
  validTo: string     // 'YYYY-MM-DD'
  weekdays: number[] | null
  capacity: number
  revokedAt: Date | null
}

export type EntryReason = 'revoked' | 'not_yet' | 'expired' | 'wrong_weekday' | 'no_capacity'

export type EntryCheck =
  | { ok: true }
  | { ok: false; reason: EntryReason }

/**
 * Única pieza no trivial del sistema. Función pura: sin base, sin reloj interno.
 * El orden de los rechazos importa y está testeado: revocada gana sobre todo,
 * después la ventana, después el día, y recién al final el cupo.
 */
export function canEnter(inv: InvitationLike, now: Date, usedCount: number): EntryCheck {
  if (inv.revokedAt) return { ok: false, reason: 'revoked' }

  // Comparar 'YYYY-MM-DD' como string es correcto: el formato ISO ordena
  // lexicográficamente igual que cronológicamente.
  const today = todayInBuenosAires(now)
  if (today < inv.validFrom) return { ok: false, reason: 'not_yet' }
  if (today > inv.validTo) return { ok: false, reason: 'expired' }

  if (inv.weekdays?.length && !inv.weekdays.includes(weekdayInBuenosAires(now))) {
    return { ok: false, reason: 'wrong_weekday' }
  }

  if (usedCount >= inv.capacity) return { ok: false, reason: 'no_capacity' }

  return { ok: true }
}
