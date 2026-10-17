'use client'
import { useId } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OpcionVista<T extends string> = {
  valor: T
  etiqueta: string
  icono: LucideIcon
  /** false = no se ofrece en esta pantalla (el tablero no entra en un celular). */
  disponible?: boolean
}

/**
 * Cambiar entre formas de ver lo mismo. Segmentado y con ícono: en un celular
 * muestra solo el ícono y la etiqueta queda para lectores de pantalla.
 */
export function SelectorVista<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: OpcionVista<T>[]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
}) {
  const grupo = useId()
  return (
    <div role="group" aria-label={etiqueta}
      className="inline-flex items-center gap-0.5 rounded-sm border border-line bg-card p-0.5">
      {opciones.filter((o) => o.disponible !== false).map((o) => {
        const activa = o.valor === valor
        const Icono = o.icono
        return (
          <button key={o.valor} type="button" aria-pressed={activa} title={o.etiqueta}
            onClick={() => onCambio(o.valor)}
            className={cn('relative inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[6px] px-3 text-[15px] font-semibold',
              activa ? 'text-azul-text' : 'text-ink-soft hover-fino:text-ink')}>
            {activa && (
              <motion.span layoutId={`vista-${grupo}`} aria-hidden className="absolute inset-0 rounded-[6px] bg-azul-tint"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
            )}
            {/* Un envoltorio con relative: sr-only/not-sr-only cambian el position de la
                etiqueta, y una etiqueta sin posicionar queda pintada debajo del fondo activo. */}
            <span className="relative inline-flex items-center gap-1.5">
              <Icono className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">{o.etiqueta}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
