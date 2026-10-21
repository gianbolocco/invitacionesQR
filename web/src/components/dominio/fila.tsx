import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * La fila de lista del sistema: título, meta, y algo al extremo (estado o
 * acción). Una línea fina abajo, sin caja ni sombra. Si tiene destino es un
 * link; si tiene acción, un botón; si no, un div. `densa` es la de garita y
 * admin (56px); la del vecino es más alta (64px), pensada para el pulgar.
 */
export function Fila({ titulo, meta, aviso, extremo, href, onClick, densa, className }: {
  titulo: ReactNode
  meta?: ReactNode
  /** Una línea aparte bajo la meta, que puede partirse en dos en vez de cortarse. */
  aviso?: ReactNode
  extremo?: ReactNode
  href?: string
  onClick?: () => void
  densa?: boolean
  className?: string
}) {
  const interactiva = Boolean(href || onClick)
  const clases = cn(
    'flex w-full items-center gap-3 border-b border-line py-3 text-left',
    densa ? 'min-h-14' : 'min-h-16',
    interactiva && 'presionable fila-presionable -mx-2 rounded-sm px-2 hover-fino:bg-azul-tint/50',
    className,
  )
  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{titulo}</span>
        {meta && <span className="mt-0.5 block truncate text-sm text-ink-soft tabular">{meta}</span>}
        {aviso && <span className="mt-0.5 block text-xs font-semibold text-espera">{aviso}</span>}
      </span>
      {extremo && <span className="shrink-0">{extremo}</span>}
    </>
  )

  if (href) return <Link href={href} className={clases}>{contenido}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clases}>{contenido}</button>
  return <div className={clases}>{contenido}</div>
}
