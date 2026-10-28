'use client'
import { Button } from '@/components/ui/button'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { esDeliveryVigente, estadoInvitacion } from '@/lib/estado-invitacion'
import { KIND_LABEL, quienInvita, vigencia, type Invitation } from '@/lib/invitations'
import { useAnularInvitacion, useRubrosDelBarrio } from '@/lib/queries/invitaciones'
import { diasSinFranja, nombreDiaPlural } from '@/lib/franjas'
import { cupoTexto, hora, hoyISO } from '@/lib/fechas'

/** Una invitación en una lista: quién, cuándo y en qué está. Lleva al pase. */
export function FilaInvitacion({ inv, mostrarUnidad = false, mostrarCreador = false }: {
  inv: Invitation
  mostrarUnidad?: boolean
  mostrarCreador?: boolean
}) {
  const estado = estadoInvitacion(inv, hoyISO())
  const { data: rubros } = useRubrosDelBarrio()
  const anular = useAnularInvitacion()
  const sinFranja = inv.kind === 'frecuente' && inv.frequentAs === 'proveedor' && inv.tradeId
    && (estado === 'esperando' || estado === 'adentro')
    ? diasSinFranja(rubros?.providerWindows ?? [], inv.tradeId, inv.weekdays?.length ? inv.weekdays : [0, 1, 2, 3, 4, 5, 6])
    : []
  const textoMeta = [
    KIND_LABEL[inv.kind],
    inv.tradeName,
    vigencia(inv),
    cupoTexto(inv),
    mostrarUnidad ? inv.unitLabel : null,
    mostrarCreador ? quienInvita(inv.creatorName, 'por') : null,
  ].filter(Boolean).join(' · ')
  const aviso = sinFranja.length
    ? `Los ${new Intl.ListFormat('es', { type: 'conjunction' }).format(sinFranja.map((d) => nombreDiaPlural(d).toLowerCase()))} no puede entrar`
    : undefined

  // El pase de delivery vigente no tiene pase ni QR que mostrar: solo se anula desde la lista.
  if (esDeliveryVigente(inv, hoyISO())) {
    return (
      <Fila titulo={inv.guestName}
        meta={['Delivery', inv.expiresAt ? `vence ${hora(inv.expiresAt)}` : null, mostrarUnidad ? inv.unitLabel : null].filter(Boolean).join(' · ')}
        extremo={<Button type="button" variant="ghost" size="sm" className="min-h-11 text-alto" disabled={anular.isPending}
          aria-label={`Anular el pase de delivery de ${inv.guestName}`}
          onClick={() => anular.mutate(inv)}>Anular</Button>} />
    )
  }

  return (
    <Fila href={`/invitaciones/${inv.id}`} titulo={inv.guestName} meta={textoMeta} aviso={aviso}
      extremo={<EstadoTag estado={estado}
        detalle={estado === 'adentro' && inv.ultimoIngreso ? hora(inv.ultimoIngreso) : undefined} />} />
  )
}
