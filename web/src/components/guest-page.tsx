'use client'
import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { api } from '@/lib/api'
import { Button, Field, ErrorNote, Eyebrow, Wordmark } from '@/components/ui'

export type Publica = {
  guestName: string
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  validFrom: string
  validTo: string
  revokedAt: string | null
  unitLabel: string
  inviterName: string
  neighborhood: { name: string; address: string | null; mapUrl: string | null }
  isEventDoor: boolean
  hasDoc: boolean
  hasPlate: boolean
  spotsLeft: number | null
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
 * El invitado carga su documento y patente. No bloquea nada: el QR ya existe,
 * esto solo evita que el guardia tipee en la barrera.
 */
export function FormularioDatos({ token, onListo }: { token: string; onListo: () => void }) {
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            Cargá tus datos y el guardia no te los tiene que pedir en la barrera.
          </p>
        </div>
        <Field label="Documento" value={doc} inputMode="text" className="tabular"
          placeholder="30.123.456" hint="DNI, pasaporte o documento del país que sea."
          onChange={(e) => setDoc(e.target.value)} />
        <Field label="Patente" value={plate} className="tabular uppercase"
          placeholder="AB 123 CD" onChange={(e) => setPlate(e.target.value)} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </form>
  )
}

/** Puerta de anotación de un evento: el invitado se anota y se lleva su QR. */
export function FormularioAnotarse({ token, spotsLeft, onAnotado }: {
  token: string
  spotsLeft: number | null
  onAnotado: (tokenPropio: string) => void
}) {
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sinLugar = spotsLeft !== null && spotsLeft <= 0

  async function anotarse(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ token: string }>(`/invitations/public/${token}/join`, {
        method: 'POST',
        body: JSON.stringify({ guestName: name, guestDoc: doc || undefined }),
      })
      onAnotado(r.token)
    } catch {
      setError('No se pudo anotar. Puede que se haya llenado el cupo: preguntale a quien te invitó.')
      setBusy(false)
    }
  }

  if (sinLugar) {
    return (
      <div className="filete">
        <div className="bg-card p-5">
          <p className="display text-lg">No quedan lugares</p>
          <p className="mt-1 text-ink-soft">
            El cupo de este evento está completo. Avisale a quien te invitó.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={anotarse} className="filete">
      <div className="flex flex-col gap-4 bg-card p-5">
        <div>
          <p className="display text-lg">Anotate</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Cargá tus datos y te llevás tu propio código para entrar.
            {spotsLeft !== null && spotsLeft <= 5 && (
              <span className="font-semibold"> Quedan {spotsLeft} lugares.</span>
            )}
          </p>
        </div>
        <Field label="Tu nombre y apellido" required value={name}
          placeholder="Martina Gómez" onChange={(e) => setName(e.target.value)} />
        <Field label="Documento" value={doc} className="tabular"
          placeholder="35.111.222" hint="Opcional, pero te ahorra el trámite en la barrera."
          onChange={(e) => setDoc(e.target.value)} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Anotando…' : 'Anotarme'}</Button>
      </div>
    </form>
  )
}
