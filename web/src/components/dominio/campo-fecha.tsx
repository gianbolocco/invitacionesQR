'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { aFecha, aISO } from '@/lib/fechas'

export function textoFecha(iso: string): string {
  const d = iso ? aFecha(iso) : null
  if (!d || Number.isNaN(d.getTime())) return 'Elegí una fecha'
  const t = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(d).replace(/\./g, '')
  // Solo la primera letra: la clase capitalize daba "Mié 8 Oct".
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Un día, elegido en un calendario en español con la semana desde el lunes.
 * Reemplaza a `<input type=date>`, que se ve distinto en cada navegador y en
 * algunos celulares no se puede usar con una mano.
 */
export function CampoFecha({ id, valor, onCambio, min, className }: {
  id?: string
  valor: string
  onCambio: (iso: string) => void
  min?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button id={id} type="button"
          className={cn('flex h-12 w-full items-center gap-2 rounded-sm border-2 border-control bg-card px-3.5 text-left text-base text-ink',
            'transition-[border-color] duration-(--t-hover) outline-none',
            'focus-visible:border-azul-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', className)}>
          <CalendarDays className="size-4 text-ink-soft" aria-hidden />
          <span className="tabular">{textoFecha(valor)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={es} weekStartsOn={1}
          selected={valor ? aFecha(valor) : undefined}
          defaultMonth={valor ? aFecha(valor) : undefined}
          disabled={min ? { before: aFecha(min) } : undefined}
          onSelect={(d) => { if (d) { onCambio(aISO(d)); setAbierto(false) } }} />
      </PopoverContent>
    </Popover>
  )
}
