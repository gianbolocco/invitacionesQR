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
export type AccionFila = { etiqueta: string; onClick: (disparador: HTMLButtonElement) => void; destructiva?: boolean }

/** El menú ⋯ de cada fila: reenviar, cambiar lote, dar de baja, lo que haga falta. */
export function MenuFila({ acciones }: { acciones: AccionFila[] }) {
  const disparadorRef = useRef<HTMLButtonElement>(null)
  if (acciones.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={disparadorRef} variant="ghost" size="icon-sm" aria-label="Más acciones">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acciones.map((a) => (
          <DropdownMenuItem key={a.etiqueta} onClick={() => a.onClick(disparadorRef.current!)}
            className={a.destructiva ? 'text-peligro focus:bg-peligro/10 focus:text-peligro' : undefined}>
            {a.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
