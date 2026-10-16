'use client'
import { useRef } from 'react'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

/**
 * `disparador`: el botón "⋯" de esta fila. Las acciones que abren un diálogo
 * lo necesitan para devolverle el foco al cerrar — Radix solo lo hace solo
 * cuando el diálogo tiene su propio `DialogTrigger`, y acá el que abre es
 * este menú, no el diálogo.
 */
export type AccionFila = {
  etiqueta: string
  onClick: (disparador: HTMLButtonElement) => void
  destructiva?: boolean
  deshabilitada?: boolean
}

/**
 * Las acciones de cada fila: reenviar, cambiar lote, dar de baja, lo que haga falta.
 *
 * Por defecto, un menú ⋯. Con `visibles`, en pantallas de escritorio salen como
 * botones a la vista —en una lista ancha sobra lugar, y esconder lo que se usa
 * todos los días detrás de un menú suma un toque— y el menú queda solo para el celular.
 */
export function MenuFila({ acciones, visibles }: { acciones: AccionFila[]; visibles?: boolean }) {
  const disparadorRef = useRef<HTMLButtonElement>(null)
  if (acciones.length === 0) return null
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={disparadorRef} variant="ghost" size="icon-sm" aria-label="Más acciones">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acciones.map((a) => (
          <DropdownMenuItem key={a.etiqueta} onClick={() => a.onClick(disparadorRef.current!)} disabled={a.deshabilitada}
            className={a.destructiva ? 'text-peligro focus:bg-peligro/10 focus:text-peligro' : undefined}>
            {a.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  if (!visibles) return menu
  return (
    <>
      <div className="hidden items-center gap-1.5 sm:flex">
        {acciones.map((a) => (
          <Button key={a.etiqueta} type="button" variant="outline" size="sm" disabled={a.deshabilitada}
            onClick={(e) => a.onClick(e.currentTarget)}
            className={a.destructiva ? 'border-peligro/40 text-peligro hover:bg-peligro/10 hover:text-peligro' : undefined}>
            {a.etiqueta}
          </Button>
        ))}
      </div>
      <div className="sm:hidden">{menu}</div>
    </>
  )
}
