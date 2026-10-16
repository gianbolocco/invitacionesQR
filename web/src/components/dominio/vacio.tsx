import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * "No hay nada" como invitación a hacer algo. Se usa SOLO cuando la consulta
 * salió bien y vino vacía: un error tiene su propio componente.
 */
export function Vacio({ icono: Icono, titulo, detalle, accion }: {
  icono: LucideIcon
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center animate-in fade-in slide-in-from-bottom-1 duration-300">
      <span className="grid size-14 place-items-center rounded-full bg-surface-sunk text-ink-soft">
        <Icono className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-display text-[19px] font-bold tracking-[-0.01em]">{titulo}</p>
        {detalle && <p className="mx-auto mt-1 max-w-sm text-ink-soft">{detalle}</p>}
      </div>
      {accion}
    </div>
  )
}
