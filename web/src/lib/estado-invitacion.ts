export type EstadoVecino = 'adentro' | 'esperando' | 'salio' | 'anulada' | 'vencida'

/**
 * En qué está una invitación, para la etiqueta de la fila y del detalle.
 *
 * El orden importa: anulada gana sobre todo; después, si alguien está adentro
 * es lo único que importa; una visita ya usada "salió" aunque su día haya
 * pasado; y una frecuente nunca "sale", espera el próximo ingreso.
 */
export function estadoInvitacion(
  inv: { kind: string; revokedAt: string | null; validTo: string; expiresAt?: string | null; usedCount: number; adentro: boolean },
  hoy: string,
  ahora: Date = new Date(),
): EstadoVecino {
  if (inv.revokedAt) return 'anulada'
  if (inv.adentro) return 'adentro'
  if (inv.kind !== 'frecuente' && inv.usedCount > 0) return 'salio'
  // El delivery vence por instante (2 horas), no por día.
  if (inv.expiresAt && new Date(inv.expiresAt) < ahora) return 'vencida'
  if (inv.validTo < hoy) return 'vencida'
  return 'esperando'
}

/**
 * El estado de una fila de la agenda de la garita, que mira UN día.
 *
 * `adentro` primero: el que entró ayer y no salió tiene 0 ingresos hoy pero
 * sigue adentro. Y sin ingresos no siempre es "pendiente": si la invitación
 * ya terminó, venció. Antes la agenda de ayer mostraba como pendiente a todo
 * el que no vino.
 */
export function estadoEnAgenda(
  r: { adentro: boolean; enteredCount: number; validTo: string; expiresAt?: string | null },
  hoy: string,
  ahora: Date = new Date(),
): Extract<EstadoVecino, 'adentro' | 'salio' | 'vencida' | 'esperando'> {
  if (r.adentro) return 'adentro'
  if (r.enteredCount > 0) return 'salio'
  if (r.expiresAt && new Date(r.expiresAt) < ahora) return 'vencida'
  return r.validTo < hoy ? 'vencida' : 'esperando'
}

/**
 * Solo se edita lo que nunca se usó. Una frecuente que ya entró vuelve a
 * "esperando", así que no alcanza con el estado: también tiene que estar en
 * cero. Es el mismo criterio que aplica la API.
 */
export function sePuedeEditar(
  inv: Parameters<typeof estadoInvitacion>[0],
  hoy: string,
  ahora: Date = new Date(),
): boolean {
  return inv.kind !== 'delivery' && estadoInvitacion(inv, hoy, ahora) === 'esperando' && inv.usedCount === 0
}

/** Un pase de delivery que todavía espera: va arriba de la lista y no lleva al detalle. */
export function esDeliveryVigente(inv: Parameters<typeof estadoInvitacion>[0], hoy: string): boolean {
  return inv.kind === 'delivery' && estadoInvitacion(inv, hoy) === 'esperando'
}
