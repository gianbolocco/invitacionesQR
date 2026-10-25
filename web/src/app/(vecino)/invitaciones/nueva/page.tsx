'use client'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home as Casa } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import type { Invitation } from '@/lib/invitations'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Vacio } from '@/components/dominio/vacio'
import { FormularioInvitacion } from '@/components/vecino/formulario-invitacion'

const KINDS: Invitation['kind'][] = ['visita', 'frecuente', 'proveedor']

export default function NuevaInvitacion({ searchParams }: {
  searchParams: Promise<{ kind?: string; guestName?: string; guestDoc?: string; plate?: string }>
}) {
  const sp = use(searchParams)
  const me = useSesion()
  const router = useRouter()

  // "Volver a invitar" desde el historial llega precargado por la URL.
  const inicial = {
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
      <EncabezadoPagina antetitulo="Nueva invitación" titulo={<>¿A quién <em>invitás?</em></>} />
      {me.units.length === 0 ? (
        <Vacio icono={Casa} titulo="Todavía no tenés una unidad"
          detalle="Pedile a la administración que te asigne tu lote para poder invitar." />
      ) : (
        <FormularioInvitacion units={me.units} inicial={inicial}
          onListo={(inv) => router.replace(`/invitaciones/${inv.id}?creada=1`)} />
      )}
    </div>
  )
}
