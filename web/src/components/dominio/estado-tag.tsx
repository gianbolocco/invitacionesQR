import { cn } from '@/lib/utils'

export type Estado =
  | 'esperando' | 'adentro' | 'salio' | 'concluida' | 'anulada' | 'vencida'
  | 'invitado' | 'activo' | 'deshabilitado'

/*
 * La diferencia entre estados es de RELLENO y PESO, no de tono: se lee igual
 * en escala de grises, con daltonismo y a dos metros en la barrera.
 * Macizo = está pasando ahora; contorno = espera o ya terminó; apagado =
 * fuera de juego; peligro = anulado.
 */
const LOOK: Record<Estado, string> = {
  adentro: 'bg-ink text-surface',
  activo: 'bg-ink text-surface',
  esperando: 'border-[1.5px] border-ink text-ink',
  invitado: 'border-[1.5px] border-ink text-ink',
  concluida: 'border-[1.5px] border-ink/50 text-ink-soft',
  salio: 'border-[1.5px] border-ink/50 text-ink-soft',
  vencida: 'bg-surface-sunk text-ink-soft',
  deshabilitado: 'bg-surface-sunk text-ink-soft',
  anulada: 'bg-peligro text-white',
}

const ETIQUETA: Record<Estado, string> = {
  adentro: 'Adentro', activo: 'Activo', esperando: 'Pendiente', invitado: 'Invitado',
  concluida: 'Concluida', salio: 'Salió', vencida: 'Vencida',
  deshabilitado: 'De baja', anulada: 'Anulada',
}

export function EstadoTag({ estado, detalle, className }: {
  estado: Estado
  detalle?: string
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1',
      'text-[10.5px] font-bold uppercase leading-none tracking-[0.05em]',
      LOOK[estado], className,
    )}>
      {(estado === 'adentro' || estado === 'activo') && (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {ETIQUETA[estado]}
      {detalle && <span className="tabular font-semibold normal-case tracking-normal">{detalle}</span>}
    </span>
  )
}
