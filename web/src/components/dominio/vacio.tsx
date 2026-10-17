import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * "No hay nada" como invitación a hacer algo. Se usa SOLO cuando la consulta
 * salió bien y vino vacía: un error tiene su propio componente.
 * Centrado en el celular; alineado a la izquierda en pantallas anchas, donde
 * acompaña a la lista que reemplaza.
 */
export function Vacio({ icono: Icono, titulo, detalle, accion }: {
  icono: LucideIcon
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center animate-in fade-in duration-200 md:items-start md:px-0 md:text-left">
      <span className="grid size-14 place-items-center rounded-md bg-azul-tint text-azul-text">
        <Icono className="size-6" aria-hidden />
      </span>
      <div>
        <p className="t-heading">{titulo}</p>
        {detalle && <p className="mx-auto mt-1 max-w-[40ch] text-ink-soft md:mx-0">{detalle}</p>}
      </div>
      {accion}
    </div>
  )
}
