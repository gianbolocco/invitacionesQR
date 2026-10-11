export type MovimientoAgenda = {
  invitationId: string
  guestName: string
  tipo: 'ingreso' | 'egreso'
  cuando: string
}

/**
 * Los últimos ingresos y egresos del día, para el panel de la columna
 * derecha en escritorio. Se arma de las filas que ya trae `/gate/agenda`
 * (cada una ya sabe su último ingreso y su último egreso): no hace falta un
 * endpoint nuevo.
 */
export function ultimosMovimientos(
  filas: { id: string; guestName: string; lastEntryAt: string | null; lastExitAt: string | null }[],
  tope = 5,
): MovimientoAgenda[] {
  const eventos: MovimientoAgenda[] = []
  for (const f of filas) {
    if (f.lastEntryAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'ingreso', cuando: f.lastEntryAt })
    if (f.lastExitAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'egreso', cuando: f.lastExitAt })
  }
  return eventos.sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, tope)
}
