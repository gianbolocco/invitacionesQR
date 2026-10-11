'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

export function aFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function textoFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(aFecha(iso)).replace(/\./g, '')
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
          className={cn('flex h-11 w-full items-center gap-2 rounded-md border border-input bg-card px-3.5 text-left text-base',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}>
          <CalendarDays className="size-4 text-ink-soft" aria-hidden />
          <span className="capitalize tabular">{textoFecha(valor)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={es} weekStartsOn={1}
          selected={aFecha(valor)}
          defaultMonth={aFecha(valor)}
          disabled={min ? { before: aFecha(min) } : undefined}
          onSelect={(d) => { if (d) { onCambio(aISO(d)); setAbierto(false) } }} />
      </PopoverContent>
    </Popover>
  )
}
