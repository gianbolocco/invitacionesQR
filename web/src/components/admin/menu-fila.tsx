'use client'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export type AccionFila = { etiqueta: string; onClick: () => void; destructiva?: boolean }

/** El menú ⋯ de cada fila: reenviar, cambiar lote, dar de baja, lo que haga falta. */
export function MenuFila({ acciones }: { acciones: AccionFila[] }) {
  if (acciones.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acciones.map((a) => (
          <DropdownMenuItem key={a.etiqueta} onClick={a.onClick}
            className={a.destructiva ? 'text-peligro focus:bg-peligro/10 focus:text-peligro' : undefined}>
            {a.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
