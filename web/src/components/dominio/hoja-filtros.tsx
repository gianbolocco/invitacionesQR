'use client'
import { useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMedia } from '@/lib/use-media'

/**
 * Los filtros de una pantalla. En escritorio van a la vista, tal cual. En el
 * celular se juntan detrás de un botón "Filtros" con la cuenta de los que
 * están puestos, y se eligen en una hoja desde abajo: apilados en la pantalla
 * se comían media altura, y en una fila que se desliza quedaban cortados.
 * Se monta UNA de las dos formas, no las dos: los campos llevan ids.
 */
export function HojaFiltros({ activos, resultados, onLimpiar, children }: {
  /** Cuántos filtros hay puestos, para el botón. */
  activos: number
  /** Cuántos resultados dan, para el botón de cerrar la hoja. */
  resultados?: number
  onLimpiar: () => void
  children: ReactNode
}) {
  const escritorio = useMedia('(min-width: 640px)')
  const [abierta, setAbierta] = useState(false)

  if (escritorio) return <div className="flex flex-col gap-4">{children}</div>

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={() => setAbierta(true)}>
        <SlidersHorizontal className="size-4" aria-hidden />
        Filtros
        {activos > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-marca px-1.5 text-xs font-bold tabular text-sobre-marca">
            {activos}
          </span>
        )}
      </Button>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl p-0">
        <SheetHeader className="px-4 pt-5">
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription className="sr-only">Elegí qué mostrar en la lista.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">{children}</div>
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <Button type="button" variant="outline" disabled={activos === 0} onClick={onLimpiar}>Quitar</Button>
          <Button type="button" className="flex-1" onClick={() => setAbierta(false)}>
            {resultados === undefined ? 'Listo' : `Ver ${resultados} ${resultados === 1 ? 'resultado' : 'resultados'}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
