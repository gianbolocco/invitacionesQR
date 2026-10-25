'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home as Casa } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import type { Invitation } from '@/lib/invitations'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Vacio } from '@/components/dominio/vacio'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { FormularioInvitacion } from '@/components/vecino/formulario-invitacion'
import { ElegirContacto } from '@/components/vecino/elegir-contacto'
import { useContactos } from '@/lib/queries/contactos'

const KINDS: Invitation['kind'][] = ['visita', 'frecuente', 'proveedor']

export default function NuevaInvitacion({ searchParams }: {
  searchParams: Promise<{ kind?: string; guestName?: string; guestDoc?: string; plate?: string; contacto?: string }>
}) {
  const sp = use(searchParams)
  const me = useSesion()
  const router = useRouter()
  const contactos = useContactos()
  const contacto = sp.contacto ? contactos.data?.find((c) => c.id === sp.contacto) : undefined
  const [eligiendo, setEligiendo] = useState(false)

  // "Volver a invitar" desde el historial llega precargado por la URL.
  const inicial = contacto ? {
    kind: contacto.kind,
    guestName: contacto.name,
    guestDoc: contacto.doc ?? undefined,
    tradeId: contacto.tradeId ?? undefined,
    unitId: contacto.unitId,
  } : {
    kind: KINDS.includes(sp.kind as Invitation['kind']) ? (sp.kind as Invitation['kind']) : undefined,
    guestName: sp.guestName,
    guestDoc: sp.guestDoc,
    plate: sp.plate,
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-7">
      <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
        <ArrowLeft aria-hidden />Invitaciones
      </Link>
      <EncabezadoPagina antetitulo="Nueva invitación" titulo={contacto
        ? <>Invitás a <em>{contacto.name.split(' ')[0]}.</em></>
        : <>¿A quién <em>invitás?</em></>} />
      {me.units.length === 0 ? (
        <Vacio icono={Casa} titulo="Todavía no tenés una unidad"
          detalle="Pedile a la administración que te asigne tu lote para poder invitar." />
      ) : sp.contacto && contactos.isPending ? (
        <SkeletonFilas />
      ) : (
        // La key reinicia el formulario al cambiar de contacto.
        <FormularioInvitacion key={contacto?.id ?? 'nuevo'} units={me.units} inicial={inicial}
          contacto={contacto} onCambiarContacto={() => setEligiendo(true)}
          onListo={(inv) => router.replace(`/invitaciones/${inv.id}?creada=1`)} />
      )}
      <ElegirContacto abierto={eligiendo} onAbiertoChange={setEligiendo} />
    </div>
  )
}
