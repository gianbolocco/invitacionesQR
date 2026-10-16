'use client'
import type { AgendaRow } from '@/lib/queries/garita'
import { agruparPorUnidad } from '@/lib/tablero'
import { FilaAgenda } from './lista'

/**
 * Agrupada por casa: la vista para cuando el guardia llama al lote y necesita
 * saber, de un golpe, a quién espera esa casa y quién ya está adentro.
 */
export function PorUnidad({ filas, hoy, onAbrir }: {
  filas: AgendaRow[]
  hoy: string
  onAbrir: (id: string) => void
}) {
  const grupos = agruparPorUnidad(filas, hoy)
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {grupos.map((g) => (
        <section key={g.unidad} aria-label={g.unidad}
          className="rounded-lg border border-line bg-card px-4 pt-3 pb-1 shadow-tarjeta">
          <h3 className="flex items-baseline justify-between gap-2">
            <span className="font-display text-lg font-extrabold tracking-[-0.01em]">{g.unidad}</span>
            <span className="text-xs tabular text-ink-soft">
              {g.filas.length} {g.filas.length === 1 ? 'persona' : 'personas'}
            </span>
          </h3>
          <div className="[&>*]:rounded-none [&>*:last-child]:border-b-0">
            {g.filas.map((r) => <FilaAgenda key={r.id} r={r} hoy={hoy} onAbrir={onAbrir} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
