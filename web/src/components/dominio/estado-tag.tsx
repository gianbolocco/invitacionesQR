import { Ban, CalendarX, Check, Clock, Hourglass, Package, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Estado =
  | 'esperando' | 'adentro' | 'salio' | 'concluida' | 'anulada' | 'vencida'
  | 'invitado' | 'activo' | 'deshabilitado' | 'paquete'

/*
 * Cada estado lleva su palabra y, cuando entra, un ícono: el color ayuda pero
 * no es lo único que lo distingue (daltonismo, pantallas malas, a dos metros).
 * Verde = adentro o activa; azul = invitado; espera = falta que el vecino
 * active la cuenta; neutro = ya terminó; alto = no vale.
 */
const LOOK: Record<Estado, { clase: string; icono?: LucideIcon }> = {
  adentro: { clase: 'bg-verde-tint text-verde', icono: Check },
  activo: { clase: 'bg-verde-tint text-verde', icono: Check },
  esperando: { clase: 'bg-azul-tint text-ink [&_svg]:text-azul-text', icono: Clock },
  invitado: { clase: 'bg-espera-tint text-espera', icono: Hourglass },
  concluida: { clase: 'bg-surface-sunk text-ink-soft' },
  salio: { clase: 'bg-surface-sunk text-ink-soft' },
  vencida: { clase: 'bg-alto-tint text-alto', icono: CalendarX },
  anulada: { clase: 'bg-alto-tint text-alto', icono: Ban },
  deshabilitado: { clase: 'bg-surface-sunk text-ink-soft' },
  paquete: { clase: 'bg-azul-tint text-ink [&_svg]:text-azul-text', icono: Package },
}

const ETIQUETA: Record<Estado, string> = {
  adentro: 'Adentro', activo: 'Activa', esperando: 'Invitado', invitado: 'Sin activar',
  concluida: 'Concluida', salio: 'Salió', vencida: 'Vencida',
  deshabilitado: 'De baja', anulada: 'Anulada', paquete: 'Paquete',
}

/**
 * `contexto="garita"`: para el guardia, una invitación que espera es alguien
 * "Por llegar"; para el vecino es su "Invitado". Las claves no cambian.
 */
export function EstadoTag({ estado, etiqueta: propia, detalle, contexto = 'vecino', className }: {
  estado: Estado
  /** Otra palabra con el mismo aspecto (en últimos movimientos: "Ingreso" con el look de adentro). */
  etiqueta?: string
  detalle?: string
  contexto?: 'vecino' | 'garita'
  className?: string
}) {
  const { clase, icono: Icono } = LOOK[estado]
  const etiqueta = propia ?? (estado === 'esperando' && contexto === 'garita' ? 'Por llegar' : ETIQUETA[estado])
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1',
      'text-[13px] leading-4 font-semibold',
      clase, className,
    )}>
      {Icono && <Icono className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
      {etiqueta}
      {detalle && <span className="tabular"> {detalle}</span>}
    </span>
  )
}
