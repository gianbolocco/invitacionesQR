'use client'
import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

type Opcion<T extends string> = { valor: T; etiqueta: string; contador?: number }

function Pastilla({ activa, children, onClick, grupo }: {
  activa: boolean
  children: React.ReactNode
  onClick: () => void
  grupo: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={cn(
        'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
        'transition-colors duration-150',
        activa ? 'text-sobre-marca' : 'text-ink-soft hover:text-ink',
      )}>
      {/* El fondo activo se desliza de una pastilla a otra en vez de saltar. */}
      {activa && (
        <motion.span layoutId={`chip-${grupo}`} aria-hidden
          className="absolute inset-0 rounded-full bg-marca"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
      )}
      {!activa && <span aria-hidden className="absolute inset-0 rounded-full border border-line bg-card" />}
      <span className="relative">{children}</span>
    </button>
  )
}

/**
 * Selector de una opción en pastillas. Uno solo para filtros, tipo de
 * invitación y estados: antes había cuatro copias con estilos distintos.
 */
export function Chips<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
}) {
  const grupo = useId()
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <Pastilla key={o.valor} grupo={grupo} activa={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.etiqueta}
          {o.contador !== undefined && <span className="tabular opacity-70">{o.contador}</span>}
        </Pastilla>
      ))}
    </div>
  )
}

/** La misma pastilla para elegir varias: días de la semana, por ejemplo. */
export function ChipsMultiples<T extends string>({ opciones, valores, onCambio, etiqueta }: {
  opciones: Opcion<T>[]
  valores: T[]
  onCambio: (v: T[]) => void
  etiqueta: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activa = valores.includes(o.valor)
        return (
          <button key={o.valor} type="button" aria-pressed={activa}
            onClick={() => onCambio(activa ? valores.filter((v) => v !== o.valor) : [...valores, o.valor])}
            className={cn(
              'inline-flex h-10 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold',
              'transition-colors duration-150',
              activa ? 'border-marca bg-marca text-sobre-marca' : 'border-line bg-card text-ink-soft hover:text-ink',
            )}>
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
