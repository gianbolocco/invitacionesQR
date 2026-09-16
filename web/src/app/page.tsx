'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useMe, homeFor } from '@/lib/session'
import { KIND_LABEL, estaVigente, vigencia, type Invitation } from '@/lib/invitations'
import { Shell } from '@/components/shell'
import { Eyebrow, Filete, Vacio } from '@/components/ui'
import { SkeletonTarjetas, Cargando, Confirmar } from '@/components/feedback'
import { InvitationDetail } from '@/components/invitation-detail'

type Anotado = { id: string; guestName: string; guestDoc: string | null; revokedAt: string | null }

export default function HomePage() {
  const me = useMe()
  const router = useRouter()
  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null)
  const [verQr, setVerQr] = useState<Invitation | null>(null)
  const [verAnotados, setVerAnotados] = useState<Invitation | null>(null)
  const [anotados, setAnotados] = useState<Anotado[] | null>(null)
  const [porAnular, setPorAnular] = useState<Invitation | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    api<Invitation[]>('/invitations').then(setInvitaciones).catch(() => setInvitaciones([]))
  }, [])

  // Una cuenta de garita no tiene nada que hacer en la home del vecino.
  useEffect(() => {
    if (me && me.role === 'guard') router.replace(homeFor(me.role))
  }, [me, router])

  useEffect(() => { if (me) cargar() }, [me, cargar])

  /**
   * Optimista: la tarjeta se va al toque y vuelve sola si el servidor falla.
   * Esperar la respuesta para algo que casi siempre funciona hace que la app
   * se sienta lenta justo en la acción más común después de crear.
   */
  async function revocar(inv: Invitation) {
    const antes = invitaciones
    setPorAnular(null)
    setVerQr(null)
    setInvitaciones((actual) => actual?.filter((i) => i.id !== inv.id) ?? null)

    try {
      await api(`/invitations/${inv.id}/revoke`, { method: 'POST' })
      cargar()
    } catch {
      setInvitaciones(antes)
      setError('No se pudo anular. Probá de nuevo.')
    }
  }

  useEffect(() => {
    if (!verAnotados) return
    api<Anotado[]>(`/invitations/${verAnotados.id}/guests`)
      .then(setAnotados)
      .catch(() => setAnotados([]))
  }, [verAnotados])

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const vigentes = (invitaciones ?? []).filter(estaVigente)
  const mostrandoLista = !verQr && !verAnotados

  return (
    <Shell me={me}
      atras={editando
        ? { label: 'Cancelar', onClick: () => setEditando(false) }
        : verAnotados
          ? { label: 'Volver', onClick: () => { setVerAnotados(null); setAnotados(null) } }
          : verQr
            ? { label: 'Invitaciones', onClick: () => { setVerQr(null); setEditando(false) } }
            : undefined}
      accion={mostrandoLista && vigentes.length > 0 ? (
      <Link href="/nueva"
        className="flex min-h-14 items-center justify-center rounded bg-alamo px-5
          font-semibold text-surface">
        Nueva invitación
      </Link>
    ) : undefined}>
      {verAnotados ? (
        <div className="mx-auto flex max-w-sm flex-col gap-5">
          <div>
            <Eyebrow>Anotados</Eyebrow>
            <h1 className="display text-2xl">{verAnotados.guestName}</h1>
            <p className="text-ink-soft tabular">
              {anotados?.length ?? 0} de {verAnotados.capacity} lugares
            </p>
          </div>

          {anotados === null && <Cargando><SkeletonTarjetas cantidad={2} /></Cargando>}
          {anotados?.length === 0 && (
            <Vacio titulo="Todavía no se anotó nadie"
              detalle="Compartí el link del evento y cada uno carga su nombre." />
          )}

          <ul className="escalonar flex flex-col gap-2">
            {anotados?.map((a) => (
              <li key={a.id}>
                <Filete className={`bg-card px-4 py-3 ${a.revokedAt ? 'opacity-50' : ''}`}>
                  <p className="font-semibold">{a.guestName}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {a.guestDoc ?? 'Sin documento'}
                    {a.revokedAt && ' · anulado'}
                  </p>
                </Filete>
              </li>
            ))}
          </ul>
        </div>
      ) : verQr ? (
        <InvitationDetail
          inv={verQr}
          units={me.units}
          editando={editando}
          onEditar={() => setEditando(true)}
          onAnular={() => setPorAnular(verQr)}
          onGuardado={() => { setEditando(false); setVerQr(null); cargar() }}
          onVerAnotados={verQr.kind === 'evento' ? () => setVerAnotados(verQr) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h1 className="display text-2xl">Invitaciones</h1>
            {vigentes.length > 0 && (
              <span className="eyebrow tabular">{vigentes.length} vigentes</span>
            )}
          </div>

          {error && (
            <p role="alert" className="surgir rounded border-l-4 border-deny-field
              bg-deny-field/5 px-3 py-2 text-sm">{error}</p>
          )}

          {invitaciones === null && <Cargando><SkeletonTarjetas /></Cargando>}

          {invitaciones !== null && vigentes.length === 0 && (
            <Vacio titulo="Todavía no invitaste a nadie"
              detalle="Creá una invitación y compartila por WhatsApp.">
              <Link href="/nueva"
                className="inline-flex min-h-14 items-center justify-center rounded bg-alamo
                  px-6 font-semibold text-surface">
                Nueva invitación
              </Link>
            </Vacio>
          )}

          {/* Toda la tarjeta abre el detalle: un botón "Ver QR" al costado
              dejaba editar y anular escondidos adentro de esa pantalla. */}
          <ul className="escalonar flex flex-col gap-3">
            {vigentes.map((inv) => (
              <li key={inv.id}>
                <button onClick={() => setVerQr(inv)} className="w-full text-left">
                  <Filete className="flex items-center justify-between gap-4 bg-card px-4 py-3.5">
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
                    <span aria-hidden className="shrink-0 text-2xl text-alamo/40">›</span>
                  </Filete>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {porAnular && (
        <Confirmar
          titulo={`¿Anular la invitación de ${porAnular.guestName}?`}
          detalle="No va a poder entrar. Si ya estaba en la barrera, avisale."
          accion="Anular"
          onConfirmar={() => revocar(porAnular)}
          onCancelar={() => setPorAnular(null)}
        />
      )}
    </Shell>
  )
}
