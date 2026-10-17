'use client'
import { useState } from 'react'

export type Barra = { label: string; total: number; hint?: string }

/**
 * Barras de una sola serie. Sin librería: son 24 o 30 valores y un div por barra.
 * Las barras van en el azul de Pazzit.
 */
export function BarChart({ title, bars, emptyText = 'Todavía no hay datos.' }: {
  title: string
  bars: Barra[]
  emptyText?: string
}) {
  const [tabla, setTabla] = useState(false)
  const max = Math.max(1, ...bars.map((b) => b.total))
  const hayDatos = bars.some((b) => b.total > 0)

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink-soft">{title}</p>
        <button onClick={() => setTabla((v) => !v)}
          className="min-h-11 text-sm font-semibold text-azul-text underline decoration-2 underline-offset-[3px]">
          {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </figcaption>

      {!hayDatos && <p className="py-8 text-center text-sm text-ink-soft">{emptyText}</p>}

      {hayDatos && !tabla && (
        <div className="flex h-40 items-end gap-0.5" role="img"
          aria-label={`${title}. ${bars.map((b) => `${b.label}: ${b.total}`).join('. ')}`}>
          {bars.map((b) => (
            <div key={b.label} className="group relative flex h-full flex-1 flex-col justify-end">
              {/* Tooltip por barra. El área de hover es la columna entera, no la barra. */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden
                -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-[13px] text-surface
                group-hover:block">
                <span className="tabular">{b.hint ?? b.label}: {b.total}</span>
              </div>
              <div
                className="w-full rounded-t-[4px] bg-azul transition-colors duration-(--t-hover)
                  group-hover:bg-[color-mix(in_srgb,var(--azul)_84%,var(--navy))]"
                style={{ height: `${Math.max(2, (b.total / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      )}

      {hayDatos && !tabla && (
        <div className="flex justify-between border-t border-line pt-1 text-[13px] text-ink-soft tabular">
          {/* Etiquetas selectivas: extremos y máximo, no una por barra. */}
          <span>{bars[0]?.label}</span>
          <span className="font-semibold text-ink">
            pico {max} · {bars.find((b) => b.total === max)?.label}
          </span>
          <span>{bars.at(-1)?.label}</span>
        </div>
      )}

      {tabla && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1 text-[13px] font-semibold text-ink-soft">Tramo</th>
              <th className="py-1 text-[13px] font-semibold text-ink-soft">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {bars.filter((b) => b.total > 0).map((b) => (
              <tr key={b.label} className="border-b border-line">
                <td className="py-1.5 tabular">{b.hint ?? b.label}</td>
                <td className="py-1.5 tabular">{b.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
