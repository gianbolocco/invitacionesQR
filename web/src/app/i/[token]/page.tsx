'use client'
import { use, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { api } from '@/lib/api'
import { fechaCorta, hoyISO, KIND_LABEL, type Invitation } from '@/lib/invitations'
import { Eyebrow, Wordmark } from '@/components/ui'

type Publica = Pick<Invitation, 'guestName' | 'kind' | 'validFrom' | 'validTo'> & {
  revokedAt: string | null
  unitLabel: string
}

export default function InvitacionPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [inv, setInv] = useState<Publica | null>(null)
  const [noExiste, setNoExiste] = useState(false)

  useEffect(() => {
    api<Publica>(`/invitations/public/${token}`).then(setInv).catch(() => setNoExiste(true))
  }, [token])

  if (noExiste) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <Wordmark />
        <h1 className="display text-xl">Esta invitación no existe</h1>
        <p className="text-ink-soft">Pedile a quien te invitó que te mande el link de nuevo.</p>
      </main>
    )
  }

  if (!inv) return <main className="p-6 text-ink-soft">Cargando…</main>

  const vencida = inv.validTo < hoyISO()
  const anulada = Boolean(inv.revokedAt)
  const url = typeof window === 'undefined' ? '' : window.location.href

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <Wordmark />

      {(anulada || vencida) && (
        <div className="rounded bg-deny-field px-4 py-3 text-deny-ink" role="alert">
          <p className="display text-lg">{anulada ? 'Invitación anulada' : 'Invitación vencida'}</p>
          <p className="text-sm opacity-90">Pedile una nueva a quien te invitó.</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-5">
        <div className="filete">
          <div className="bg-white p-5">
            <QRCodeCanvas value={url} size={232} fgColor="#0d3d28" bgColor="#ffffff"
              // Atenuado, no oculto: si está vencida el guardia igual quiere ver de qué se trata.
              style={{ opacity: anulada || vencida ? 0.25 : 1 }} />
          </div>
        </div>

        <div className="text-center">
          <Eyebrow>{KIND_LABEL[inv.kind]}</Eyebrow>
          <p className="display mt-1 text-2xl">{inv.guestName}</p>
          <p className="mt-1 text-ink-soft tabular">
            {inv.unitLabel} ·{' '}
            {inv.validFrom === inv.validTo
              ? fechaCorta(inv.validFrom)
              : `${fechaCorta(inv.validFrom)} a ${fechaCorta(inv.validTo)}`}
          </p>
        </div>

        <p className="text-center text-sm text-ink-soft">
          Mostrá esta pantalla en la garita.
        </p>
      </div>
    </main>
  )
}
