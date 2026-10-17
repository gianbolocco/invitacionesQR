import { hora, horaODia, tiempoDesde } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import { estadoEnAgenda } from '@/lib/estado-invitacion'
import type { AgendaRow } from '@/lib/queries/garita'
import type { Estado } from '@/components/dominio/estado-tag'

/** Lo que cada vista dice de una fila de la agenda, escrito una sola vez. */

export function estadoDe(r: AgendaRow, hoy: string): Estado {
  return estadoEnAgenda(r, hoy)
}

/** La hora del movimiento que define el estado: cuándo entró o cuándo salió. */
export function detalleDe(r: AgendaRow, hoy: string): string | undefined {
  const estado = estadoEnAgenda(r, hoy)
  // Si entró otro día, la hora sola engaña: lleva la fecha.
  if (estado === 'adentro') return r.lastEntryAt ? horaODia(r.lastEntryAt, hoy) : undefined
  if (estado === 'salio') return r.lastExitAt ? hora(r.lastExitAt) : undefined
  return undefined
}

export function metaDe(r: AgendaRow): string {
  return [
    r.unitLabel,
    quienInvita(r.inviterName),
    r.plate,
    r.capacity > 1 && r.enteredCount > 1 ? `${r.enteredCount} ingresos hoy` : null,
  ].filter(Boolean).join(' · ')
}

/** El pie de una tarjeta: lo que más le importa al guardia según dónde está la persona. */
export function pieDe(r: AgendaRow, hoy: string): string {
  const estado = estadoEnAgenda(r, hoy)
  if (estado === 'adentro') return r.lastEntryAt ? `Hace ${tiempoDesde(r.lastEntryAt)}` : 'Adentro'
  if (estado === 'salio') return r.lastExitAt ? `Salió ${hora(r.lastExitAt)}` : 'Salió'
  if (estado === 'vencida') return 'Venció'
  if (r.kind !== 'frecuente' && r.capacity > 1) return `Cupo ${r.capacity}`
  return r.guestDoc ? `DNI ${r.guestDoc}` : ''
}
