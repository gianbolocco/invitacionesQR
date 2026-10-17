import { PenLine, Repeat, Truck } from 'lucide-react'
import { KIND_LABEL, type Invitation } from '@/lib/invitations'
import { cn } from '@/lib/utils'

const BASE = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 text-[13px] leading-4 font-semibold'

/**
 * El tipo de invitación, a la vista. La visita común no lleva tag: es lo
 * normal, y marcarla sería ruido. Frecuente y proveedor sí, porque cambian lo
 * que el guardia espera (alguien que viene seguido, alguien que trabaja).
 * El ícono acompaña la palabra: no depende del color para leerse.
 */
export function TagTipo({ kind, className }: { kind: Invitation['kind']; className?: string }) {
  if (kind === 'visita') return null
  const Icono = kind === 'frecuente' ? Repeat : Truck
  return (
    <span className={cn(BASE,
      kind === 'frecuente' ? 'bg-azul-tint text-ink [&_svg]:text-azul-text' : 'border border-line bg-card text-ink',
      className,
    )}>
      <Icono className="size-3.5" aria-hidden />
      {KIND_LABEL[kind]}
    </span>
  )
}

/**
 * Un movimiento que no salió de un escaneo sino de una carga posterior a mano
 * (un corte de luz): la hora es la que se declaró. Se marca siempre, en la
 * auditoría y en el detalle, para que nadie lo confunda con un registro en vivo.
 */
export function TagManual({ className }: { className?: string }) {
  return (
    <span className={cn(BASE, 'border border-dashed border-control text-ink-soft', className)}>
      <PenLine className="size-3.5" aria-hidden />
      Carga manual
    </span>
  )
}
