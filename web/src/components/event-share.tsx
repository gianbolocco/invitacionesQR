'use client'
import { useState } from 'react'
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

      {/*
        Acá había un QR del link del evento. No va: ese link sirve para
        anotarse ANTES, y quien tiene el QR delante ya está en la entrada —
        a esa altura lo registra el guardia a mano. Era decoración.
      */}
    </div>
  )
}
