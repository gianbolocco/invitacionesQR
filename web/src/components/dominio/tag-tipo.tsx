import { PenLine, Repeat, Truck } from 'lucide-react'
import { KIND_LABEL, type Invitation } from '@/lib/invitations'
import { cn } from '@/lib/utils'

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
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-1',
      'text-[10.5px] font-bold uppercase leading-none tracking-[0.05em]',
      kind === 'frecuente' ? 'bg-marca-suave text-marca-deep' : 'border border-line bg-card text-ink',
      className,
    )}>
      <Icono className="size-3" aria-hidden />
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
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-dashed border-ink/40 px-1.5 py-1',
      'text-[10.5px] font-bold uppercase leading-none tracking-[0.05em] text-ink-soft',
      className,
    )}>
      <PenLine className="size-3" aria-hidden />
      Carga manual
    </span>
  )
}
