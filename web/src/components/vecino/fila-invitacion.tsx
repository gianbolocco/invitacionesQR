'use client'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { KIND_LABEL, quienInvita, vigencia, type Invitation } from '@/lib/invitations'
import { useRubrosDelBarrio } from '@/lib/queries/invitaciones'
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
  const sinFranja = inv.kind === 'frecuente' && inv.frequentAs === 'proveedor' && inv.tradeId
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
  const meta = sinFranja.length === 0 ? textoMeta : (
    <>
      {textoMeta}
      <span className="block text-xs font-semibold text-espera">
        Los {sinFranja.map((d) => nombreDiaPlural(d).toLowerCase()).join(' y ')} no puede entrar
      </span>
    </>
  )

  return (
    <Fila href={`/invitaciones/${inv.id}`} titulo={inv.guestName} meta={meta}
      extremo={<EstadoTag estado={estado}
        detalle={estado === 'adentro' && inv.ultimoIngreso ? hora(inv.ultimoIngreso) : undefined} />} />
  )
}
