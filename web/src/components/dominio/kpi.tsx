'use client'
import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

function Sparkline({ serie }: { serie: number[] }) {
  const max = Math.max(1, ...serie)
  const paso = 100 / Math.max(1, serie.length - 1)
  const puntos = serie.map((v, i) => `${(i * paso).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden className="mt-2 h-7 w-full text-azul">
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
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString('es-AR') },
    })
    return () => control.stop()
  }, [valor, quieto])

  return (
    <div className={cn('rounded-md p-5', tono === 'atencion' ? 'bg-espera-tint text-espera' : 'bg-card')}>
      <p className={cn('flex items-center gap-1.5 text-sm font-semibold', tono === 'atencion' ? 'text-espera' : 'text-ink-soft')}>
        {tono === 'atencion' && <><TriangleAlert className="size-4" aria-hidden /><span>Atención ·</span></>}
        {etiqueta}
      </p>
      <p className="mt-1.5 text-[32px] leading-9 font-extrabold tracking-[-1px] tabular">
        <span ref={ref} aria-label={`${etiqueta}: ${valor}`}>
          {/* Con movimiento arranca en 0 y el efecto lo sube: así no parpadea el valor final. */}
          {quieto ? valor.toLocaleString('es-AR') : '0'}
        </span>
      </p>
      {variacion && (
        <p className={cn('mt-1 flex items-center gap-1 text-sm font-semibold', {
          sube: 'text-verde',
          baja: 'text-alto',
          neutro: 'text-ink-soft',
        }[variacion.tono])}>
          {variacion.tono === 'sube' && <TrendingUp className="size-4" aria-hidden />}
          {variacion.tono === 'baja' && <TrendingDown className="size-4" aria-hidden />}
          {variacion.texto}
        </p>
      )}
      {serie && serie.length > 1 && <Sparkline serie={serie} />}
    </div>
  )
}
