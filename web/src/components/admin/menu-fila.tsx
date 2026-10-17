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
  /** Para donde hay poco lugar por botón (la tabla): "Reenviar" en vez de "Reenviar invitación". */
  corta?: string
  onClick: (disparador: HTMLButtonElement) => void
  destructiva?: boolean
  deshabilitada?: boolean
}

/** El menú ⋯ de cada fila: reenviar, cambiar lote, dar de baja, lo que haga falta. */
export function MenuFila({ acciones }: { acciones: AccionFila[] }) {
  const disparadorRef = useRef<HTMLButtonElement>(null)
  if (acciones.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={disparadorRef} variant="ghost" size="icon" aria-label="Más acciones">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acciones.map((a) => (
          <DropdownMenuItem key={a.etiqueta} onClick={() => a.onClick(disparadorRef.current!)} disabled={a.deshabilitada}
            className={a.destructiva ? 'text-alto focus:bg-alto-tint focus:text-alto' : undefined}>
            {a.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
