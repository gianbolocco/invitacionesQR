import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * El encabezado de cada pantalla: un antetítulo chico, el título display y las
 * acciones a la derecha. La palabra en <em> del título va en el color del
 * barrio: `titulo={<>Hola, <em>Lucía.</em></>}`.
 */
export function EncabezadoPagina({ titulo, antetitulo, subtitulo, acciones, className }: {
  titulo: ReactNode
  antetitulo?: ReactNode
  subtitulo?: ReactNode
  acciones?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {antetitulo && (
          <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">
            {antetitulo}
          </p>
        )}
        <h1 className="titulo-display text-[34px] sm:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="mt-2 text-ink-soft">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
    </header>
  )
}
