import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/**
 * Etiqueta, control y una línea abajo: la ayuda, o el error si lo hay. El
 * control lo pone quien llama, con `id={id}` y, si hay error,
 * `aria-invalid` y `aria-describedby={`${id}-nota`}`.
 */
export function Campo({ id, etiqueta, ayuda, error, accesorio, children }: {
  id: string
  etiqueta: string
  ayuda?: ReactNode
  error?: string | null
  accesorio?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-semibold">{etiqueta}</Label>
        {accesorio}
      </div>
      {children}
      {error ? (
        <p id={`${id}-nota`} role="alert" className="text-sm text-peligro animate-in fade-in duration-200">{error}</p>
      ) : ayuda ? (
        <p id={`${id}-nota`} className="text-sm text-ink-soft">{ayuda}</p>
      ) : null}
    </div>
  )
}
