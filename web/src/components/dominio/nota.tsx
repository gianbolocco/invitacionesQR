import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Un aviso en línea, al lado de lo que lo provocó. Los errores dicen qué
 * hacer, no qué pasó. `role="alert"` para que el lector de pantalla lo diga
 * sin que haya que ir a buscarlo.
 */
export function Nota({ tono, children, className }: {
  tono: 'error' | 'exito' | 'info' | 'atencion'
  children: React.ReactNode
  className?: string
}) {
  const Icono = { error: CircleAlert, exito: CircleCheck, info: Info, atencion: TriangleAlert }[tono]
  return (
    <p role={tono === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-sm px-3.5 py-3 text-sm animate-in fade-in duration-200', {
        error: 'bg-alto-tint text-alto',
        exito: 'bg-verde-tint text-verde',
        info: 'bg-azul-tint text-ink',
        atencion: 'bg-espera-tint text-espera',
      }[tono], className)}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
