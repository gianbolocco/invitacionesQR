'use client'
import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { api } from '@/lib/api'
import { Button, Field, ErrorNote, Eyebrow, Wordmark } from '@/components/ui'

export type Publica = {
  guestName: string
  kind: 'visita' | 'frecuente' | 'proveedor'
  validFrom: string
  validTo: string
  revokedAt: string | null
  unitLabel: string
  inviterName: string
  neighborhood: { name: string; address: string | null; mapUrl: string | null }
  hasDoc: boolean
  hasPlate: boolean
  frozen: boolean
}

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
    .format(new Date(y, m - 1, d))
}

/** Quién invita, a qué unidad y cómo llegar. Va arriba de todo, siempre. */
export function Cabecera({ inv }: { inv: Publica }) {
  const { address, mapUrl } = inv.neighborhood
  return (
    <div className="flex flex-col gap-4">
      <Wordmark subtitle={inv.neighborhood.name} />
      <div>
        <Eyebrow>Te invita</Eyebrow>
        <p className="mt-0.5 text-lg font-semibold">{inv.inviterName}</p>
        <p className="text-ink-soft tabular">{inv.unitLabel}</p>
      </div>
      {(address || mapUrl) && (
        <div>
          <Eyebrow>Cómo llegar</Eyebrow>
          {address && <p className="mt-0.5 text-ink-soft">{address}</p>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center rounded border border-alamo/30
                px-4 text-sm font-semibold text-alamo">
              Abrir en el mapa
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function Qr({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="filete sello">
        {/* Claro siempre, en los dos temas: un QR oscuro sobre fondo oscuro
            no lo lee ningún lector. */}
        <div className="bg-[#ffffff] p-5">
          <QRCodeCanvas value={url} size={232} fgColor="#0d3d28" bgColor="#ffffff" />
        </div>
      </div>
      {/* El motivo más común de que un QR "no funcione" en la barrera es un
          celular en ahorro de batería con el brillo al mínimo. */}
      <p className="text-center text-sm text-ink-soft">
        Subí el brillo de la pantalla para que el lector lo tome.
      </p>
    </div>
  )
}

/**
 * Pide SOLO lo que falta.
 *
 * Antes se mostraba entero si faltaba cualquiera de los dos campos, así que a
 * quien ya tenía el documento cargado se lo volvían a pedir. Los datos se piden
 * una vez.
 */
export function FormularioDatos({ token, faltaDoc, faltaPatente, onListo }: {
  token: string
  faltaDoc: boolean
  faltaPatente: boolean
  onListo: () => void
}) {
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!faltaDoc && !faltaPatente) return null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!doc.trim() && !plate.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api(`/invitations/public/${token}`, {
        method: 'PATCH',
        body: JSON.stringify({ guestDoc: doc || undefined, plate: plate || undefined }),
      })
      onListo()
    } catch {
      setError('No se pudo guardar. Probá de nuevo o mostrá el QR igual: vas a poder entrar.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={guardar} className="filete">
      <div className="flex flex-col gap-4 bg-card p-5">
        <div>
          <p className="display text-lg">Entrá más rápido</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {faltaDoc && faltaPatente
              ? 'Cargá tus datos y el guardia no te los tiene que pedir en la barrera.'
              : faltaDoc
                ? 'Cargá tu documento y el guardia no te lo tiene que pedir en la barrera.'
                : 'Si venís en auto, cargá la patente y no te la piden en la barrera.'}
          </p>
        </div>
        {faltaDoc && (
          <Field label="Documento" value={doc} inputMode="text" className="tabular"
            placeholder="30.123.456" hint="DNI, pasaporte o documento del país que sea."
            onChange={(e) => setDoc(e.target.value)} />
        )}
        {faltaPatente && (
          <Field label="Patente" value={plate} className="tabular uppercase"
            placeholder="AB 123 CD" onChange={(e) => setPlate(e.target.value)} />
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </form>
  )
}
