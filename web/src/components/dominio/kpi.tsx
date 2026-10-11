'use client'
import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

function Sparkline({ serie }: { serie: number[] }) {
  const max = Math.max(1, ...serie)
  const paso = 100 / Math.max(1, serie.length - 1)
  const puntos = serie.map((v, i) => `${(i * paso).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden className="mt-2 h-7 w-full text-marca">
      <polyline points={`0,30 ${puntos.join(' ')} 100,30`} fill="currentColor" opacity="0.12" />
      <polyline points={puntos.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.6"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Un indicador del tablero: etiqueta, valor que sube desde cero al aparecer,
 * variación y una línea de tendencia. "atencion" lo marca como algo para
 * resolver, no como un número más.
 */
export function Kpi({ etiqueta, valor, variacion, serie, tono = 'normal' }: {
  etiqueta: string
  valor: number
  variacion?: { texto: string; tono: 'sube' | 'baja' | 'neutro' }
  serie?: number[]
  tono?: 'normal' | 'atencion'
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const quieto = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (quieto) { el.textContent = valor.toLocaleString('es-AR'); return }
    const control = animate(0, valor, {
      duration: 0.7,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString('es-AR') },
    })
    return () => control.stop()
  }, [valor, quieto])

  return (
    <div className={cn('rounded-lg border bg-card p-4',
      tono === 'atencion' ? 'border-amber-600/60' : 'border-line')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.07em]',
        tono === 'atencion' ? 'text-amber-700 dark:text-amber-400' : 'text-ink-soft')}>
        {etiqueta}
      </p>
      <p className="titulo-display mt-1.5 text-[32px] tabular">
        <span ref={ref}>{valor.toLocaleString('es-AR')}</span>
      </p>
      {variacion && (
        <p className={cn('mt-1 text-xs font-semibold', {
          sube: 'text-emerald-700 dark:text-emerald-400',
          baja: 'text-peligro',
          neutro: 'text-ink-soft',
        }[variacion.tono])}>
          {variacion.tono === 'sube' ? '▲ ' : variacion.tono === 'baja' ? '▼ ' : ''}{variacion.texto}
        </p>
      )}
      {serie && serie.length > 1 && <Sparkline serie={serie} />}
    </div>
  )
}
