'use client'
import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

type Opcion<T extends string> = { valor: T; etiqueta: string; contador?: number }

function Pastilla({ activa, children, onClick, grupo, ancha }: {
  ancha?: boolean
  activa: boolean
  children: React.ReactNode
  onClick: () => void
  grupo: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-sm px-4 text-[15px] font-semibold',
        ancha && 'w-full justify-center',
        activa ? 'text-card' : 'text-ink',
      )}>
      {/* El fondo activo se desliza de una opción a otra en vez de saltar. */}
      {activa && (
        <motion.span layoutId={`chip-${grupo}`} aria-hidden
          className="absolute inset-0 rounded-sm bg-ink"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
      )}
      {!activa && <span aria-hidden className="absolute inset-0 rounded-sm border-2 border-control bg-card" />}
      <span className="relative">{children}</span>
    </button>
  )
}

/**
 * Selector de una opción en chips (radio 8, no pastilla). Uno solo para filtros, tipo de
 * invitación y estados: antes había cuatro copias con estilos distintos.
 */
export function Chips<T extends string>({ opciones, valor, onCambio, etiqueta, desplaza, rejilla }: {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
  /** En el celular, una sola fila que se desliza en vez de varias que se apilan. */
  desplaza?: boolean
  /** Dos columnas de igual ancho en vez de pastillas sueltas. */
  rejilla?: boolean
}) {
  const grupo = useId()
  return (
    <div role="group" aria-label={etiqueta}
      className={cn(rejilla ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-1.5', desplaza &&
        'max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]')}>
      {opciones.map((o) => (
        <Pastilla key={o.valor} grupo={grupo} ancha={rejilla} activa={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.etiqueta}
          {/* ml-1 y no gap: etiqueta y contador son nodos sueltos dentro del
              mismo span, no items flex — el gap del botón no los separa. */}
          {o.contador !== undefined && (
            <span className={cn('ml-1 tabular', o.valor === valor ? 'text-card/75' : 'text-ink-soft')}>{o.contador}</span>
          )}
        </Pastilla>
      ))}
    </div>
  )
}

/** La misma pastilla para elegir varias: días de la semana, por ejemplo. */
export function ChipsMultiples<T extends string>({ opciones, valores, onCambio, etiqueta, choque = [] }: {
  opciones: Opcion<T>[]
  valores: T[]
  onCambio: (v: T[]) => void
  etiqueta: string
  /** Valores marcados en amarillo (un aviso, no un error). */
  choque?: T[]
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activa = valores.includes(o.valor)
        return (
          <button key={o.valor} type="button" aria-pressed={activa}
            onClick={() => onCambio(activa ? valores.filter((v) => v !== o.valor) : [...valores, o.valor])}
            className={cn(
              'inline-flex h-11 min-w-11 items-center justify-center rounded-sm border-2 px-3 text-[15px] font-semibold',
              activa ? 'border-ink bg-ink text-card' : 'border-control bg-card text-ink',
              choque.includes(o.valor) && 'bg-espera-tint text-espera ring-2 ring-espera',
            )}>
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
