'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { KIND_LABEL, fechaCorta, vigencia, type Invitation } from '@/lib/invitations'
import { Shell } from '@/components/shell'
import { Eyebrow, Filete } from '@/components/ui'
import { SkeletonTarjetas, Cargando } from '@/components/feedback'

export default function HistorialPage() {
  const me = useMe()
  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null)
  const [soloMias, setSoloMias] = useState(false)

  useEffect(() => {
    if (me) api<Invitation[]>('/invitations').then(setInvitaciones).catch(() => setInvitaciones([]))
  }, [me])

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const lista = (invitaciones ?? []).filter((i) => !soloMias || i.createdBy === me.id)

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="display text-2xl">Historial</h1>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)}
              className="size-5 accent-[#1e6b47]" />
            Solo las mías
          </label>
        </div>

        {invitaciones === null && <Cargando><SkeletonTarjetas cantidad={4} /></Cargando>}
        {invitaciones !== null && lista.length === 0 && (
          <Filete className="bg-card px-5 py-10 text-center">
            <p className="text-ink-soft">Todavía no hay invitaciones.</p>
          </Filete>
        )}

        <ul className="flex flex-col gap-3">
          {lista.map((inv) => (
            <li key={inv.id}>
              <Filete className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3.5">
                <div className="min-w-0">
                  <Eyebrow>{KIND_LABEL[inv.kind]} · {fechaCorta(inv.createdAt.slice(0, 10))}</Eyebrow>
                  <p className="display truncate text-lg">{inv.guestName}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {vigencia(inv)}
                    {inv.createdBy !== me.id && ` · por ${inv.creatorName}`}
                  </p>
                  <p className="mt-0.5 text-sm">
                    {inv.revokedAt
                      ? <span className="text-deny-field">Anulada</span>
                      : inv.usedCount === 0
                        ? <span className="text-ink-soft">No entró</span>
                        : <span className="text-alamo tabular">
                            {inv.usedCount === 1 ? 'Entró' : `${inv.usedCount} ingresos`}
                          </span>}
                  </p>
                </div>
                <Link
                  href={`/nueva?kind=${inv.kind}&guestName=${encodeURIComponent(inv.guestName)}` +
                    `&guestDoc=${encodeURIComponent(inv.guestDoc ?? '')}` +
                    `&plate=${encodeURIComponent(inv.plate ?? '')}`}
                  className="inline-flex min-h-12 items-center rounded border border-alamo/30 px-4
                    text-sm font-semibold text-alamo">
                  Volver a invitar
                </Link>
              </Filete>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}
