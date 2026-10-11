'use client'
import { CloudOff, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Lo que se muestra cuando algo no cargó. Antes los errores se veían como
 * listas vacías ("no tenés invitaciones") y nadie sabía que tenía que
 * reintentar.
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
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-peligro/10 text-peligro">
        <CloudOff className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-display text-[19px] font-bold tracking-[-0.01em]">{titulo}</p>
        <p className="mx-auto mt-1 max-w-sm text-ink-soft">{detalle}</p>
      </div>
      <Button variant="outline" onClick={onReintentar} disabled={reintentando}>
        <RotateCw className={cn(reintentando && 'animate-spin')} />
        Reintentar
      </Button>
    </div>
  )
}
