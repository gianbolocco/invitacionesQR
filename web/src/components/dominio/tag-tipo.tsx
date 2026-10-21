import { PenLine, Repeat, Truck } from 'lucide-react'
import { KIND_LABEL, type Invitation } from '@/lib/invitations'
import { cn } from '@/lib/utils'

const BASE = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 text-[13px] leading-4 font-semibold'

/**
 * El tipo de invitación, a la vista. La visita común no lleva tag: es lo
 * normal, y marcarla sería ruido. Frecuente y proveedor sí, porque cambian lo
 * que el guardia espera (alguien que viene seguido, alguien que trabaja). Una
 * frecuente que viene como proveedor lleva las dos: todo proveedor se marca.
 * El ícono acompaña la palabra: no depende del color para leerse.
 */
export function TagTipo({ kind, frequentAs, tradeName, className }: {
  kind: Invitation['kind']
  frequentAs?: Invitation['frequentAs']
  tradeName?: string | null
  className?: string
}) {
  const frecuente = kind === 'frecuente'
  const proveedor = kind === 'proveedor' || (frecuente && frequentAs === 'proveedor')
  if (!frecuente && !proveedor) return null
  return (
    <span className={cn('inline-flex shrink-0 flex-wrap justify-end gap-1', className)}>
      {frecuente && (
        <span className={cn(BASE, 'bg-azul-tint text-ink [&_svg]:text-azul-text')}>
          <Repeat className="size-3.5" aria-hidden />{KIND_LABEL.frecuente}
        </span>
      )}
      {proveedor && (
        <span className={cn(BASE, 'border border-line bg-card text-ink')}>
          <Truck className="size-3.5" aria-hidden />{KIND_LABEL.proveedor}{tradeName && ` · ${tradeName}`}
        </span>
      )}
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
