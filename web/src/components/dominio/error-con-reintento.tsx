'use client'
import { CloudOff, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Lo que se muestra cuando algo no cargó. Antes los errores se veían como
 * listas vacías ("no tenés invitaciones") y nadie sabía que tenía que
 * reintentar. Misma forma que Vacío, en el tono de error.
 */
export function ErrorConReintento({
  titulo = 'No pudimos cargar esto',
  detalle = 'Revisá la conexión y probá de nuevo.',
  onReintentar,
  reintentando = false,
}: {
  titulo?: string
  detalle?: string
  onReintentar: () => void
  reintentando?: boolean
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-12 text-center md:items-start md:px-0 md:text-left">
      <span className="grid size-14 place-items-center rounded-md bg-alto-tint text-alto">
        <CloudOff className="size-6" aria-hidden />
      </span>
      <div>
        <p className="t-heading">{titulo}</p>
        <p className="mx-auto mt-1 max-w-[40ch] text-ink-soft md:mx-0">{detalle}</p>
      </div>
      <Button variant="secondary" onClick={onReintentar} disabled={reintentando}>
        <RotateCw className={cn(reintentando && 'animate-spin')} aria-hidden />
        Probar de nuevo
      </Button>
    </div>
  )
}
