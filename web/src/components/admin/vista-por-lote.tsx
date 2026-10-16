'use client'
import type { ReactNode } from 'react'
import type { Person } from '@/lib/admin'
import type { GrupoLote } from '@/lib/lotes'
import { cn } from '@/lib/utils'

function Tarjeta({ g, fila, className }: { g: GrupoLote; fila: (p: Person) => ReactNode; className?: string }) {
  return (
    <section aria-label={g.titulo}
      className={cn('rounded-lg border bg-card px-4 pt-3 pb-1 shadow-tarjeta', g.sinLote ? 'border-ink/40' : 'border-line', className)}>
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
  )
}

/**
 * El padrón por lote. Si hay gente sin lote, queda aparte a la izquierda —es lo
 * que el admin tiene que resolver, y con cientos de personas no puede ser una
 * tarjeta más entre los lotes— con su propio scroll; a la derecha, los lotes
 * ya asignados. Si no hay nadie sin lote, los lotes ocupan todo el ancho. En
 * el celular, todo en una columna con los sin lote primero.
 *
 * La fila de cada vecino la pone quien llama, así lleva el mismo menú de
 * acciones (cambiar lote, dar de baja) que en la lista.
 */
export function VistaPorLote({ grupos, fila }: {
  grupos: GrupoLote[]
  fila: (p: Person) => ReactNode
}) {
  const sinLote = grupos.find((g) => g.sinLote)
  const lotes = grupos.filter((g) => !g.sinLote)

  return (
    <div className={cn('grid grid-cols-1 items-start gap-4', sinLote && 'lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]')}>
      {sinLote && (
        <Tarjeta g={sinLote} fila={fila}
          className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto" />
      )}
      <div className={cn('grid grid-cols-1 items-start gap-3 md:grid-cols-2', sinLote ? 'xl:grid-cols-2' : 'xl:grid-cols-3')}>
        {lotes.map((g) => <Tarjeta key={g.clave} g={g} fila={fila} />)}
      </div>
    </div>
  )
}
