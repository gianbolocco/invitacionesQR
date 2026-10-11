'use client'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'

/**
 * El botón "+ {etiqueta}" que abre un sheet lateral con un formulario
 * adentro. `abierto`/`onAbiertoChange` vienen de afuera para que la
 * mutación de alta pueda cerrarlo sola cuando termina.
 */
export function SheetAlta({ etiqueta, titulo, descripcion, abierto, onAbiertoChange, children }: {
  etiqueta: string
  titulo: string
  descripcion?: string
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <>
      <Button onClick={() => onAbiertoChange(true)}><Plus aria-hidden />{etiqueta}</Button>
      <Sheet open={abierto} onOpenChange={onAbiertoChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{titulo}</SheetTitle>
            {descripcion && <SheetDescription>{descripcion}</SheetDescription>}
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-8">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
