export type MovimientoAgenda = {
  invitationId: string
  guestName: string
  tipo: 'ingreso' | 'egreso' | 'paquete'
  cuando: string
}

/**
 * Los últimos ingresos y egresos del día, para el panel de la columna
 * derecha en escritorio. Se arma de las filas que ya trae `/gate/agenda`
 * (cada una ya sabe su último ingreso y su último egreso): no hace falta un
 * endpoint nuevo. Los paquetes del día (`/gate/packages/hoy`) se mezclan en
 * la misma lista: `invitationId` lleva el id del paquete y `guestName` el
 * lote, así la lista los trata como una fila más.
 */
export function ultimosMovimientos(
  filas: { id: string; guestName: string; lastEntryAt: string | null; lastExitAt: string | null }[],
  paquetes: { id: string; unitLabel: string; notifiedAt: string }[] = [],
  tope = 5,
): MovimientoAgenda[] {
  const eventos: MovimientoAgenda[] = []
  for (const f of filas) {
    if (f.lastEntryAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'ingreso', cuando: f.lastEntryAt })
    if (f.lastExitAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'egreso', cuando: f.lastExitAt })
  }
  for (const p of paquetes) eventos.push({ invitationId: p.id, guestName: p.unitLabel, tipo: 'paquete', cuando: p.notifiedAt })
  return eventos.sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, tope)
}
