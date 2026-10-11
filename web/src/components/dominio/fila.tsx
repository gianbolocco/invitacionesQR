import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * La fila de lista del sistema: título, meta, y algo al extremo (estado o
 * acción). Una línea fina abajo, sin caja. Si tiene destino es un link; si
 * tiene acción, un botón; si no, un div.
 */
export function Fila({ titulo, meta, extremo, href, onClick, className }: {
  titulo: ReactNode
  meta?: ReactNode
  extremo?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
}) {
  const interactiva = Boolean(href || onClick)
  const clases = cn(
    'flex w-full min-h-14 items-center gap-3 border-b border-line py-3 text-left',
    interactiva && '-mx-2 rounded-md px-2 transition-colors duration-150 hover:bg-surface-sunk/70 active:bg-surface-sunk',
    className,
  )
  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{titulo}</span>
        {meta && <span className="mt-0.5 block truncate text-[13px] text-ink-soft tabular">{meta}</span>}
      </span>
      {extremo && <span className="shrink-0">{extremo}</span>}
    </>
  )

  if (href) return <Link href={href} className={clases}>{contenido}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clases}>{contenido}</button>
  return <div className={clases}>{contenido}</div>
}
