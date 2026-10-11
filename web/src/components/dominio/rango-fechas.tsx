'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import type { DateRange } from 'react-day-picker'
import { CalendarRange } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { hoyISO, sumarDias, fechaCorta, aFecha, aISO } from '@/lib/fechas'

const ATAJOS = [
  { etiqueta: 'Hoy', dias: 0 },
  { etiqueta: 'Últimos 7 días', dias: 6 },
  { etiqueta: 'Últimos 30 días', dias: 29 },
]

/** Un rango de días con atajos: lo que más se pide en la auditoría. */
export function RangoFechas({ desde, hasta, onCambio }: {
  desde: string
  hasta: string
  onCambio: (r: { desde: string; hasta: string }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [parcial, setParcial] = useState<DateRange | undefined>()

  // Dos clics siempre: inicio y fin, en cualquier orden. El modo rango de
  // react-day-picker extiende el rango que ya está elegido, y así un solo clic
  // cerraba el selector.
  function clic(dia: Date) {
    if (!parcial?.from) {
      setParcial({ from: dia, to: undefined })
      return
    }
    const [a, b] = dia < parcial.from ? [dia, parcial.from] : [parcial.from, dia]
    onCambio({ desde: aISO(a), hasta: aISO(b) })
    cerrar()
  }

  // Cerrar por cualquier vía descarta una elección a medias.
  function cerrar() {
    setParcial(undefined)
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={(v) => { if (!v) setParcial(undefined); setAbierto(v) }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-medium">
          <CalendarRange className="text-ink-soft" />
          <span className="tabular">{fechaCorta(desde)} – {fechaCorta(hasta)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-2 p-2 sm:flex-row" align="start">
        <div className="flex flex-row flex-wrap gap-1 sm:flex-col">
          {ATAJOS.map((a) => (
            <Button key={a.etiqueta} variant="ghost" className="justify-start"
              onClick={() => {
                const h = hoyISO()
                onCambio({ desde: sumarDias(h, -a.dias), hasta: h })
                cerrar()
              }}>
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <Calendar mode="range" locale={es} weekStartsOn={1} numberOfMonths={1}
          defaultMonth={aFecha(hasta)}
          selected={parcial ?? { from: aFecha(desde), to: aFecha(hasta) }}
          onDayClick={clic}
          onSelect={() => {}} /* la selección la maneja onDayClick */ />
      </PopoverContent>
    </Popover>
  )
}
