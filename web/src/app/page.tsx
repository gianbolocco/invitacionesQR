'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { KIND_LABEL, estaVigente, vigencia, type Invitation } from '@/lib/invitations'
import { Shell } from '@/components/shell'
import { Button, Eyebrow, Filete } from '@/components/ui'
import { QrShare } from '@/components/qr-share'

export default function HomePage() {
  const me = useMe()
  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null)
  const [verQr, setVerQr] = useState<Invitation | null>(null)

  const cargar = useCallback(() => {
    api<Invitation[]>('/invitations').then(setInvitaciones).catch(() => setInvitaciones([]))
  }, [])

  useEffect(() => { if (me) cargar() }, [me, cargar])

  async function revocar(inv: Invitation) {
    if (!confirm(`¿Anular la invitación de ${inv.guestName}? No va a poder entrar.`)) return
    await api(`/invitations/${inv.id}/revoke`, { method: 'POST' })
    setVerQr(null)
    cargar()
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const vigentes = (invitaciones ?? []).filter(estaVigente)

  return (
    <Shell me={me}>
      {verQr ? (
        <div className="mx-auto flex max-w-sm flex-col gap-6">
          <button onClick={() => setVerQr(null)} className="self-start text-sm text-alamo
            underline underline-offset-4">
            ← Volver
          </button>
          <QrShare token={verQr.token} guestName={verQr.guestName} />
          <button onClick={() => revocar(verQr)} className="text-sm text-deny-field
            underline underline-offset-4">
            Anular esta invitación
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h1 className="display text-2xl">Invitaciones</h1>
            {vigentes.length > 0 && (
              <span className="eyebrow tabular">{vigentes.length} vigentes</span>
            )}
          </div>

          {invitaciones === null && <p className="text-ink-soft">Cargando…</p>}

          {invitaciones !== null && vigentes.length === 0 && (
            <Filete className="bg-white px-5 py-10 text-center">
              <p className="text-ink-soft">
                No tenés invitaciones vigentes.<br />
                Creá una y compartila por WhatsApp.
              </p>
            </Filete>
          )}

          <ul className="flex flex-col gap-3">
            {vigentes.map((inv) => (
              <li key={inv.id}>
                <Filete className="flex items-center justify-between gap-4 bg-white px-4 py-3.5">
                  <div className="min-w-0">
                    <Eyebrow>{KIND_LABEL[inv.kind]}</Eyebrow>
                    <p className="display truncate text-lg">{inv.guestName}</p>
                    <p className="text-sm text-ink-soft tabular">
                      {vigencia(inv)}
                      {inv.capacity > 1 && ` · ${inv.usedCount} de ${inv.capacity} entraron`}
                      {me.units.length > 1 && ` · ${inv.unitLabel}`}
                    </p>
                    {inv.createdBy !== me.id && (
                      <p className="text-sm text-ink-soft">Creada por {inv.creatorName}</p>
                    )}
                  </div>
                  <Button variant="quiet" onClick={() => setVerQr(inv)}>Ver QR</Button>
                </Filete>
              </li>
            ))}
          </ul>

          <Link href="/nueva"
            className="inline-flex min-h-14 items-center justify-center rounded bg-alamo px-5
              font-semibold text-white hover:bg-alamo-deep">
            Nueva invitación
          </Link>
        </div>
      )}
    </Shell>
  )
}
