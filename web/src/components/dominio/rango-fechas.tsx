'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import type { DateRange } from 'react-day-picker'
import { CalendarRange } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { hoyISO, sumarDias, fechaCorta } from '@/lib/fechas'
import { aFecha, aISO } from './campo-fecha'

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

  function elegir(r: DateRange | undefined) {
    setParcial(r)
    if (r?.from && r.to) {
      onCambio({ desde: aISO(r.from), hasta: aISO(r.to) })
      setParcial(undefined)
      setAbierto(false)
    }
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-medium">
          <CalendarRange className="text-ink-soft" />
          <span className="tabular">{fechaCorta(desde)} – {fechaCorta(hasta)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-2 p-2 sm:flex-row" align="start">
        <div className="flex flex-row gap-1 sm:flex-col">
          {ATAJOS.map((a) => (
            <Button key={a.etiqueta} variant="ghost" size="sm" className="justify-start"
              onClick={() => {
                const h = hoyISO()
                onCambio({ desde: sumarDias(h, -a.dias), hasta: h })
                setAbierto(false)
              }}>
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <Calendar mode="range" locale={es} weekStartsOn={1} numberOfMonths={1}
          defaultMonth={aFecha(hasta)}
          selected={parcial ?? { from: aFecha(desde), to: aFecha(hasta) }}
          onSelect={elegir} />
      </PopoverContent>
    </Popover>
  )
}
