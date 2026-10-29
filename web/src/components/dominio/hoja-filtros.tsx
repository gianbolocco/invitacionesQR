'use client'
import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useMedia } from '@/lib/use-media'
import { cn } from '@/lib/utils'

/** Un filtro puesto: se muestra como pastilla y se saca con su ×. */
export type FiltroAplicado = { clave: string; etiqueta: string; quitar: () => void }

/**
 * El botón "Filtros" de una pantalla, con la cuenta de los que están puestos.
 * En escritorio abre un panel que nace del botón; en el celular, una hoja desde
 * abajo. Los cambios se aplican al tocarlos: no hay "Aplicar" que olvidarse.
 *
 * Adentro van solo los filtros secundarios. El que más se usa (el estado, con
 * sus contadores) queda afuera, pegado a la lista: esconderlo costaría un clic
 * cada vez y los números son información por sí solos.
 *
 * Se monta UNA de las dos formas, no las dos: los campos llevan ids.
 */
export function HojaFiltros({ aplicados, resultados, onLimpiar, className, children }: {
  aplicados: FiltroAplicado[]
  /** Cuántos resultados dan, para el botón de cerrar. */
  resultados?: number
  onLimpiar: () => void
  className?: string
  children: ReactNode
}) {
  const escritorio = useMedia('(min-width: 640px)')
  const [abierta, setAbierta] = useState(false)
  const activos = aplicados.length

  const boton = (
    <Button type="button" variant="outline"
      className={cn('gap-2 transition-transform duration-150 ease-out active:scale-[0.97]', abierta && 'border-ink', className)}>
      <SlidersHorizontal className="size-4" aria-hidden />
      Filtros
      {activos > 0 && (
        <span className="grid min-w-5 place-items-center rounded-full bg-azul px-1.5 text-xs font-bold tabular text-white">
          {activos}
        </span>
      )}
    </Button>
  )
  const cerrar = (size?: 'sm') => (
    <Button type="button" size={size} className="flex-1" onClick={() => setAbierta(false)}>
      {resultados === undefined ? 'Listo' : `Ver ${resultados} ${resultados === 1 ? 'resultado' : 'resultados'}`}
    </Button>
  )
  const quitar = (size?: 'sm') => (
    <Button type="button" variant="outline" size={size} disabled={activos === 0} onClick={onLimpiar}>Quitar todo</Button>
  )

  if (escritorio) return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger asChild>{boton}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[30rem] max-w-[calc(100vw-2rem)] p-0 duration-150">
        <p className="px-5 pt-4 text-base font-bold">Filtros</p>
        <div className="flex flex-col gap-5 px-5 py-4">{children}</div>
        <div className="flex gap-2 border-t border-line px-5 py-3">{quitar('sm')}{cerrar('sm')}</div>
      </PopoverContent>
    </Popover>
  )

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      <SheetTrigger asChild>{boton}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg p-0">
        <SheetHeader className="px-4 pt-5">
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription className="sr-only">Elegí qué mostrar en la lista.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4">{children}</div>
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {quitar()}{cerrar()}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Un grupo del panel, con su título: sin él, dos filas de "Todos" no se distinguían. */
export function SeccionFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">{titulo}</h3>
      {children}
    </section>
  )
}

/** Lo que está filtrando la lista, a la vista y sin abrir el panel. */
export function FiltrosAplicados({ aplicados, onLimpiar }: { aplicados: FiltroAplicado[]; onLimpiar: () => void }) {
  if (aplicados.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros puestos">
      {aplicados.map((f) => (
        <span key={f.clave}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-azul-tint pl-3 pr-1 text-sm font-semibold text-ink animate-in fade-in-0 zoom-in-95 duration-150">
          {f.etiqueta}
          <button type="button" onClick={f.quitar} aria-label={`Quitar ${f.etiqueta}`}
            className="grid size-6 place-items-center rounded-full text-ink-soft transition-[background-color,transform] duration-150 ease-out hover-fino:bg-card hover-fino:text-ink active:scale-90">
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {aplicados.length > 1 && (
        <button type="button" onClick={onLimpiar}
          className="h-8 rounded-full px-2 text-sm font-semibold text-azul-text underline-offset-4 hover-fino:underline">
          Quitar todo
        </button>
      )}
    </div>
  )
}
