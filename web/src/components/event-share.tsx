'use client'
import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { Invitation } from '@/lib/invitations'
import { Button, Eyebrow, Filete } from './ui'

/**
 * Compartir un evento NO es compartir un QR.
 *
 * El link de un evento es una puerta de anotación: cada invitado lo abre, pone
 * su nombre y se lleva SU propio código. Antes esta pantalla mostraba el QR del
 * evento igual que el de una visita, y el vecino entendía que era algo para
 * mostrar en la barrera — no que era el link para repartir.
 */
export function EventShare({ inv }: { inv: Invitation }) {
  const [copiado, setCopiado] = useState(false)
  const [verQr, setVerQr] = useState(false)

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/i/${inv.token}`
  const texto = `Te invito a "${inv.guestName}" en Álamo Alto. ` +
    `Anotate acá y te llega tu código para entrar: ${url}`

  const libres = Math.max(0, inv.capacity - inv.joinedCount)

  async function compartir() {
    if (navigator.share) {
      await navigator.share({ title: inv.guestName, text: texto, url }).catch(() => {})
      return
    }
    await copiar()
  }

  async function copiar() {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <Filete className="flex flex-col gap-3 bg-card p-5">
        <div>
          <Eyebrow>Link para repartir</Eyebrow>
          <p className="mt-1">
            Mandale este link a todos. Cada uno pone su nombre y{' '}
            <strong>se lleva su propio código</strong>, así sabés quién entró y quién no.
          </p>
        </div>

        <p className="tabular text-sm text-ink-soft">
          {inv.joinedCount} de {inv.capacity} anotados
          {libres > 0 ? ` · quedan ${libres} lugares` : ' · sin lugares libres'}
        </p>

        <Button onClick={compartir}>Compartir el link</Button>
        <Button variant="quiet" onClick={copiar} aria-live="polite">
          {copiado ? 'Link copiado' : 'Copiar link'}
        </Button>
      </Filete>

      {/* El QR del evento es secundario: sirve para pegarlo en la entrada de la
          fiesta, no para que alguien lo muestre en la barrera. */}
      <button onClick={() => setVerQr((v) => !v)}
        className="self-start text-sm text-alamo underline underline-offset-4">
        {verQr ? 'Ocultar' : 'Ver'} el código del evento para imprimir
      </button>

      {verQr && (
        <div className="surgir flex flex-col items-center gap-2">
          <div className="filete">
            <div className="bg-[#ffffff] p-5">
              <QRCodeCanvas value={url} size={200} fgColor="#0d3d28" bgColor="#ffffff" />
            </div>
          </div>
          <p className="max-w-xs text-center text-sm text-ink-soft">
            Quien lo escanee llega al mismo formulario para anotarse.
          </p>
        </div>
      )}
    </div>
  )
}
