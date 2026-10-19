import { TagTipo } from '@/components/dominio/tag-tipo'
import { quienInvita } from '@/lib/invitations'
import type { AgendaRow } from '@/lib/queries/garita'
import { pieDe } from './datos-agenda'
import { TextoExcedido, useTiempoExcedido } from './alertas-permanencia'
import { formatearDni } from '@/lib/lectora'

/**
 * Una persona en el tablero. Es un botón entero: abre el veredicto. Nombre
 * arriba, de quién y dónde en el medio, y abajo lo que cambia según el estado
 * (hace cuánto entró, a qué hora salió, cuánto cupo tiene). Si pasó su tiempo
 * adentro, la tarjeta es la misma: solo el pie va en amarillo, con ícono, y
 * suma el DNI.
 */
export function TarjetaInvitado({ fila, hoy, onAbrir }: {
  fila: AgendaRow
  hoy: string
  onAbrir: (id: string) => void
}) {
  const excedido = useTiempoExcedido(fila)
  const pie = excedido ? <TextoExcedido texto={excedido} /> : pieDe(fila, hoy)
  return (
    <button type="button" onClick={() => onAbrir(fila.id)}
      className="flex w-full flex-col gap-1.5 rounded-md border border-line bg-card p-3 text-left">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[15px] font-semibold leading-snug">{fila.guestName}</span>
        <TagTipo kind={fila.kind} />
      </span>
      <span className="truncate text-[13px] text-ink-soft">
        {fila.unitLabel} · {quienInvita(fila.inviterName)}
      </span>
      {(fila.plate || pie) && (
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs tabular text-ink-soft">
          <span className="truncate font-medium text-ink">
            {/* El que se pasó de su tiempo lleva el DNI: es con lo que se lo busca o se llama a la casa. */}
            {[excedido && fila.guestDoc ? `DNI ${formatearDni(fila.guestDoc)}` : null, fila.plate].filter(Boolean).join(' · ')}
          </span>
          <span className="shrink-0">{pie}</span>
        </span>
      )}
    </button>
  )
}
