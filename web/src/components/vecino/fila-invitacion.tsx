'use client'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { KIND_LABEL, quienInvita, vigencia, type Invitation } from '@/lib/invitations'
import { cupoTexto, hora, hoyISO } from '@/lib/fechas'

/** Una invitación en una lista: quién, cuándo y en qué está. Lleva al pase. */
export function FilaInvitacion({ inv, mostrarUnidad = false, mostrarCreador = false }: {
  inv: Invitation
  mostrarUnidad?: boolean
  mostrarCreador?: boolean
}) {
  const estado = estadoInvitacion(inv, hoyISO())
  const meta = [
    KIND_LABEL[inv.kind],
    vigencia(inv),
    cupoTexto(inv),
    mostrarUnidad ? inv.unitLabel : null,
    mostrarCreador ? quienInvita(inv.creatorName, 'por') : null,
  ].filter(Boolean).join(' · ')

  return (
    <Fila href={`/invitaciones/${inv.id}`} titulo={inv.guestName} meta={meta}
      extremo={<EstadoTag estado={estado}
        detalle={estado === 'adentro' && inv.ultimoIngreso ? hora(inv.ultimoIngreso) : undefined} />} />
  )
}
