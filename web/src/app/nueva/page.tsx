'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMe } from '@/lib/session'
import type { Invitation } from '@/lib/invitations'
import { Shell } from '@/components/shell'
import { Button } from '@/components/ui'
import { InvitationForm } from '@/components/invitation-form'
import { QrShare } from '@/components/qr-share'

type Kind = Invitation['kind']
const KINDS: Kind[] = ['visita', 'frecuente', 'proveedor']

function Nueva() {
  const me = useMe()
  const params = useSearchParams()
  const [creada, setCreada] = useState<Invitation | null>(null)

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  // "Volver a invitar" del historial llega por query params.
  const kindParam = params.get('kind')
  const defaults = {
    kind: KINDS.includes(kindParam as Kind) ? (kindParam as Kind) : undefined,
    guestName: params.get('guestName') ?? undefined,
    guestDoc: params.get('guestDoc') ?? undefined,
    plate: params.get('plate') ?? undefined,
  }

  return (
    <Shell me={me}>
      <div className="mx-auto max-w-sm">
        {creada ? (
          <div className="flex flex-col gap-6">
            <h1 className="display text-2xl">Listo</h1>
            <QrShare token={creada.token} guestName={creada.guestName} />
            <Link href="/" className="text-center text-sm text-alamo underline underline-offset-4">
              Ver mis invitaciones
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <h1 className="display text-2xl">Nueva invitación</h1>
            {me.units.length === 0 ? (
              <p className="text-ink-soft">
                Todavía no tenés una unidad asignada. Pedile a la administración que te asigne la tuya.
              </p>
            ) : (
              <InvitationForm units={me.units} defaults={defaults} onCreated={setCreada} />
            )}
            <Button variant="quiet" onClick={() => history.back()}>Cancelar</Button>
          </div>
        )}
      </div>
    </Shell>
  )
}

export default function NuevaPage() {
  return <Suspense fallback={<main className="p-6 text-ink-soft">Cargando…</main>}><Nueva /></Suspense>
}
