'use client'
import type { ReactNode } from 'react'
import type { Person } from '@/lib/admin'
import type { GrupoLote } from '@/lib/lotes'
import { cn } from '@/lib/utils'

/**
 * El padrón agrupado por lote: quién vive en cada casa, y qué lotes están
 * vacíos o tienen gente sin lote. La fila de cada vecino la pone quien llama,
 * así lleva el mismo menú de acciones (cambiar lote, dar de baja) que en la lista.
 */
export function VistaPorLote({ grupos, fila }: {
  grupos: GrupoLote[]
  fila: (p: Person) => ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {grupos.map((g) => (
        <section key={g.clave} aria-label={g.titulo}
          className={cn('rounded-lg border bg-card px-4 pt-3 pb-1 shadow-tarjeta',
            g.sinLote ? 'border-ink/40' : 'border-line')}>
          <h3 className="flex items-baseline justify-between gap-2">
            <span className="font-display text-lg font-extrabold tracking-[-0.01em]">{g.titulo}</span>
            {g.vecinos.length === 0 ? (
              <span className="rounded-sm bg-surface-sunk px-2 py-1 text-[10.5px] font-bold uppercase leading-none tracking-[0.05em] text-ink-soft">
                Sin vecinos
              </span>
            ) : (
              <span className="text-xs tabular text-ink-soft">
                {g.vecinos.length} {g.vecinos.length === 1 ? 'vecino' : 'vecinos'}
              </span>
            )}
          </h3>
          <div className="[&>*]:rounded-none [&>*:last-child]:border-b-0">
            {g.vecinos.map((p) => fila(p))}
          </div>
          {g.vecinos.length === 0 && <p className="pb-3 pt-1 text-sm text-ink-soft">Nadie declaró este lote todavía.</p>}
        </section>
      ))}
    </div>
  )
}
