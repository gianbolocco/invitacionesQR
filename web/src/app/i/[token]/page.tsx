'use client'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { KIND_LABEL, hoyISO } from '@/lib/invitations'
import { Eyebrow, Wordmark } from '@/components/ui'
import { TemaFlotante } from '@/components/tema-flotante'
import {
  Cabecera, Qr, FormularioDatos, FormularioAnotarse, fechaCorta, type Publica,
} from '@/components/guest-page'

/** Recuerda en este dispositivo a qué hija de un evento corresponde el invitado. */
function anotacionGuardada(eventToken: string): string | null {
  try {
    return localStorage.getItem(`anotado:${eventToken}`)
  } catch {
    return null   // modo incógnito o cookies bloqueadas: no es un error
  }
}

function guardarAnotacion(eventToken: string, propio: string) {
  try {
    localStorage.setItem(`anotado:${eventToken}`, propio)
  } catch {
    // Sin localStorage el invitado tendría que anotarse de nuevo, pero el
    // servidor deduplica por documento y le devuelve la misma anotación.
  }
}

export default function InvitacionPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [inv, setInv] = useState<Publica | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [datosListos, setDatosListos] = useState(false)

  const cargar = useCallback(() => {
    api<Publica>(`/invitations/public/${token}`).then(setInv).catch(() => setNoExiste(true))
  }, [token])

  useEffect(cargar, [cargar])

  // Si ya se anotó a este evento desde este dispositivo, va directo a su QR.
  useEffect(() => {
    if (!inv?.isEventDoor) return
    const propio = anotacionGuardada(token)
    if (propio) router.replace(`/i/${propio}`)
  }, [inv, token, router])

  if (noExiste) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <TemaFlotante />
        <Wordmark />
        <h1 className="display text-xl">Esta invitación no existe</h1>
        <p className="text-ink-soft">Pedile a quien te invitó que te mande el link de nuevo.</p>
      </main>
    )
  }

  if (!inv) return <main className="p-6 text-ink-soft">Cargando…</main>

  const anulada = Boolean(inv.revokedAt)
  const vencida = inv.validTo < hoyISO()
  const muerta = anulada || vencida
  const url = typeof window === 'undefined' ? '' : window.location.href

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-6">
      <TemaFlotante />
      <Cabecera inv={inv} />

      {muerta && (
        <div role="alert" className="rounded bg-deny-field px-4 py-3 text-deny-ink">
          <p className="display text-lg">{anulada ? 'Invitación anulada' : 'Invitación vencida'}</p>
          <p className="text-sm opacity-90">Pedile una nueva a quien te invitó.</p>
        </div>
      )}

      {!muerta && inv.isEventDoor ? (
        /* Puerta de anotación: acá no hay QR todavía. */
        <>
          <div>
            <Eyebrow>{KIND_LABEL[inv.kind]}</Eyebrow>
            <p className="display mt-0.5 text-2xl">{inv.guestName}</p>
            <p className="text-ink-soft tabular">
              {inv.validFrom === inv.validTo
                ? fechaCorta(inv.validFrom)
                : `${fechaCorta(inv.validFrom)} a ${fechaCorta(inv.validTo)}`}
            </p>
          </div>
          <FormularioAnotarse token={token} spotsLeft={inv.spotsLeft}
            onAnotado={(propio) => { guardarAnotacion(token, propio); router.push(`/i/${propio}`) }} />
        </>
      ) : (
        /* QR personal: una visita, un proveedor, o alguien ya anotado. */
        <>
          <Qr url={url} />
          <div className="text-center">
            <Eyebrow>{KIND_LABEL[inv.kind]}</Eyebrow>
            <p className="display mt-0.5 text-2xl">{inv.guestName}</p>
            <p className="mt-0.5 text-ink-soft tabular">
              {inv.validFrom === inv.validTo
                ? fechaCorta(inv.validFrom)
                : `${fechaCorta(inv.validFrom)} a ${fechaCorta(inv.validTo)}`}
            </p>
          </div>

          {!muerta && !inv.frozen && !datosListos && (
            <FormularioDatos token={token}
              faltaDoc={!inv.hasDoc} faltaPatente={!inv.hasPlate}
              onListo={() => { setDatosListos(true); cargar() }} />
          )}

          {datosListos && (
            <p role="status" className="text-center text-sm text-alamo">
              Listo. El guardia ya tiene tus datos.
            </p>
          )}

          <p className="text-center text-sm text-ink-soft">Mostrá esta pantalla en la garita.</p>
        </>
      )}
    </main>
  )
}
