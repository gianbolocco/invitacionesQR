'use client'
import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button, Eyebrow } from './ui'

export function QrShare({ token, guestName }: { token: string; guestName: string }) {
  const [copiado, setCopiado] = useState(false)
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/i/${token}`
  const texto = `Hola ${guestName}, te dejo el acceso a Álamo Alto: ${url}`

  async function compartir() {
    // Web Share API nativa: abre el selector del sistema, WhatsApp incluido.
    // Sin librería y sin integración con la API de Meta.
    if (navigator.share) {
      await navigator.share({ title: 'Invitación a Álamo Alto', text: texto, url }).catch(() => {})
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
    <div className="flex flex-col items-center gap-5">
      <div className="filete">
        <div className="bg-white p-5">
          <QRCodeCanvas value={url} size={232} fgColor="#0d3d28" bgColor="#ffffff" />
        </div>
      </div>
      <div className="text-center">
        <Eyebrow>Invitación</Eyebrow>
        <p className="display mt-1 text-xl">{guestName}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button onClick={compartir}>Compartir</Button>
        <Button variant="quiet" onClick={copiar} aria-live="polite">
          {copiado ? 'Link copiado' : 'Copiar link'}
        </Button>
      </div>
    </div>
  )
}
