import { sinLote as estaSinLote, type Person, type Unit } from './admin.ts'

/** Un lote y quiénes viven ahí; o el grupo de los que todavía no declararon el suyo. */
export type GrupoLote = {
  clave: string
  titulo: string
  /** Es el grupo de los vecinos sin lote, no un lote de verdad. */
  sinLote: boolean
  vecinos: Person[]
}

export const SIN_LOTE = 'Sin lote asignado'

/**
 * Agrupa el padrón por lote, para la vista "Por lote" de Vecinos.
 *
 * Los lotes salen de las unidades de la base, no solo de los vecinos: un lote
 * sin nadie también es un dato (el tablero lo cuenta como "Unidades sin
 * vecinos") y tiene que poder verse. Ordenados como número —"Lote 9" antes
 * que "Lote 142"—. Quien no tiene lote va en un grupo aparte, primero, porque
 * es lo que el admin tiene que resolver.
 *
 * `incluirVacios` es false mientras se busca: buscar "Martín" no tiene que
 * dejar a la vista cien lotes sin gente.
 */
export function agruparPorLote(vecinos: Person[], unidades: Unit[], incluirVacios: boolean): GrupoLote[] {
  const porNombre = (a: Person, b: Person) => a.name.localeCompare(b.name, 'es')
  const grupos = new Map<string, GrupoLote>()

  if (incluirVacios) {
    for (const u of unidades) grupos.set(u.id, { clave: u.id, titulo: u.label, sinLote: false, vecinos: [] })
  }
  const sinLote: Person[] = []
  for (const p of vecinos) {
    // Un admin no necesita casa: no cuenta como "sin lote" (sigue en la lista).
    if (p.units.length === 0) { if (estaSinLote(p)) sinLote.push(p); continue }
    for (const u of p.units) {
      const g = grupos.get(u.id) ?? { clave: u.id, titulo: u.label, sinLote: false, vecinos: [] }
      g.vecinos.push(p)
      grupos.set(u.id, g)
    }
  }

  const lotes = [...grupos.values()]
    .map((g) => ({ ...g, vecinos: g.vecinos.sort(porNombre) }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es', { numeric: true }))
  return sinLote.length > 0
    ? [{ clave: 'sin-lote', titulo: SIN_LOTE, sinLote: true, vecinos: sinLote.sort(porNombre) }, ...lotes]
    : lotes
}
