export type EstadoVecino = 'adentro' | 'esperando' | 'salio' | 'anulada' | 'vencida'

/**
 * En qué está una invitación, para la etiqueta de la fila y del detalle.
 *
 * El orden importa: anulada gana sobre todo; después, si alguien está adentro
 * es lo único que importa; una visita ya usada "salió" aunque su día haya
 * pasado; y una frecuente nunca "sale", espera el próximo ingreso.
 */
export function estadoInvitacion(
  inv: { kind: string; revokedAt: string | null; validTo: string; usedCount: number; adentro: boolean },
  hoy: string,
): EstadoVecino {
  if (inv.revokedAt) return 'anulada'
  if (inv.adentro) return 'adentro'
  if (inv.kind !== 'frecuente' && inv.usedCount > 0) return 'salio'
  if (inv.validTo < hoy) return 'vencida'
  return 'esperando'
}

/**
 * Solo se edita lo que nunca se usó. Una frecuente que ya entró vuelve a
 * "esperando", así que no alcanza con el estado: también tiene que estar en
 * cero. Es el mismo criterio que aplica la API.
 */
export function sePuedeEditar(
  inv: Parameters<typeof estadoInvitacion>[0],
  hoy: string,
): boolean {
  return estadoInvitacion(inv, hoy) === 'esperando' && inv.usedCount === 0
}
