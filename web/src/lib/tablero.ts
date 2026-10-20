import { estadoEnAgenda } from './estado-invitacion.ts'
import type { AgendaRow } from './queries/garita'

export type Tipo = AgendaRow['kind']
export type FiltroTipo = 'todos' | Tipo
export type FiltroEstado = 'todos' | 'porLlegar' | 'adentro' | 'seFueron'

export type Columnas = {
  porLlegar: AgendaRow[]
  adentro: AgendaRow[]
  seFueron: AgendaRow[]
  vencidas: AgendaRow[]
}

export function filtrarPorTipo(filas: AgendaRow[], tipo: FiltroTipo): AgendaRow[] {
  return tipo === 'todos' ? filas : filas.filter((r) => r.kind === tipo)
}

/**
 * Reparte el día en columnas. Cada persona queda en UNA sola.
 *
 * `adentro` viene de /gate/adentro cuando se mira hoy: incluye a quien entró
 * otro día y sigue en el barrio, que la agenda de hoy no trae. Quien está
 * adentro gana sobre todo lo demás: sale de "por llegar" y de "se fueron"
 * aunque la agenda diga otra cosa. Si se mira otro día, `adentro` es null y
 * la columna sale de la propia agenda.
 */
export function armarColumnas(agenda: AgendaRow[], adentro: AgendaRow[] | null, hoy: string): Columnas {
  const adentroIds = new Set((adentro ?? agenda.filter((r) => r.adentro)).map((r) => r.id))
  const resto = agenda.filter((r) => !adentroIds.has(r.id))
  const estado = (r: AgendaRow) => estadoEnAgenda(r, hoy)
  return {
    porLlegar: resto.filter((r) => estado(r) === 'esperando'),
    adentro: adentro ?? agenda.filter((r) => r.adentro),
    seFueron: resto.filter((r) => estado(r) === 'salio'),
    vencidas: resto.filter((r) => estado(r) === 'vencida'),
  }
}

/** Una unidad y quiénes tiene hoy, para la vista "Por unidad". */
export type GrupoUnidad = { unidad: string; filas: AgendaRow[] }

/**
 * Agrupa por unidad, ordenadas con "Lote 9" antes que "Lote 142" (numérico,
 * no alfabético). Dentro de cada una, primero los que están adentro y los
 * que faltan llegar: lo que el guardia necesita al llamar a la casa.
 */
export function agruparPorUnidad(filas: AgendaRow[], hoy: string): GrupoUnidad[] {
  const peso = (r: AgendaRow) => ({ adentro: 0, esperando: 1, salio: 2, vencida: 3 })[estadoEnAgenda(r, hoy)]
  const mapa = new Map<string, AgendaRow[]>()
  for (const r of filas) mapa.set(r.unitLabel, [...(mapa.get(r.unitLabel) ?? []), r])
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([unidad, fs]) => ({
      unidad,
      filas: fs.sort((x, y) => peso(x) - peso(y) || x.guestName.localeCompare(y.guestName, 'es')),
    }))
}
