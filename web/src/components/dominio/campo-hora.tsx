'use client'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Una hora "HH:MM". Pareja de CampoFecha: misma altura, mismo borde y el
 * ícono a la izquierda. Es un `<input type="time">`, así el celular abre su
 * selector nativo (rueda en iOS, reloj en Android), que se usa mejor con una
 * mano que cualquier selector dibujado a mano.
 */
export function CampoHora({ id, valor, onCambio, className, ...props }: {
  id?: string
  valor: string
  onCambio: (hora: string) => void
  className?: string
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'>) {
  return (
    <div className={cn('relative', className)}>
      <Clock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
      <input id={id} type="time" value={valor} onChange={(e) => onCambio(e.target.value)} {...props}
        className="h-11 w-full min-w-0 rounded-md border border-input bg-card pl-10 pr-3 text-base tabular outline-none
          focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50
          aria-invalid:border-destructive" />
    </div>
  )
}
