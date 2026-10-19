import { TriangleAlert } from 'lucide-react'
import { TagTipo } from '@/components/dominio/tag-tipo'
import { quienInvita } from '@/lib/invitations'
import type { AgendaRow } from '@/lib/queries/garita'
import { pieDe } from './datos-agenda'
import { useExceso } from './alertas-permanencia'
import { cn } from '@/lib/utils'

/**
 * Una persona en el tablero. Es un botón entero: abre el veredicto. Nombre
 * arriba, de quién y dónde en el medio, y abajo lo que cambia según el estado
 * (hace cuánto entró, a qué hora salió, cuánto cupo tiene). Si pasó su tiempo
 * adentro, el pie lo dice con ícono y texto, no solo con el color.
 */
export function TarjetaInvitado({ fila, hoy, onAbrir }: {
  fila: AgendaRow
  hoy: string
  onAbrir: (id: string) => void
}) {
  const exceso = useExceso(fila.id)
  const pie = exceso
    ? <span className="flex items-center gap-1 font-semibold text-espera"><TriangleAlert className="size-3.5" aria-hidden />Se pasó {exceso}</span>
    : pieDe(fila, hoy)
  return (
    <button type="button" onClick={() => onAbrir(fila.id)}
      className={cn('flex w-full flex-col gap-1.5 rounded-md border p-3 text-left',
        exceso ? 'border-espera bg-espera-tint' : 'border-line bg-card')}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[15px] font-semibold leading-snug">{fila.guestName}</span>
        <TagTipo kind={fila.kind} />
      </span>
      <span className="truncate text-[13px] text-ink-soft">
        {fila.unitLabel} · {quienInvita(fila.inviterName)}
      </span>
      {(fila.plate || pie) && (
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs tabular text-ink-soft">
          <span className="truncate font-medium text-ink">{fila.plate ?? ''}</span>
          <span className="shrink-0">{pie}</span>
        </span>
      )}
    </button>
  )
}
