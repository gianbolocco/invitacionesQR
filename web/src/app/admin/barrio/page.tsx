'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'

type Barrio = { id: string; name: string; address: string | null; mapUrl: string | null }

export default function BarrioPage() {
  const me = useMe()
  const [barrio, setBarrio] = useState<Barrio | null>(null)
  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    api<Barrio>('/admin/neighborhood').then((b) => {
      setBarrio(b)
      setAddress(b.address ?? '')
      setMapUrl(b.mapUrl ?? '')
    }).catch(() => {})
  }, [me])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    try {
      const b = await api<Barrio>('/admin/neighborhood', {
        method: 'PATCH',
        body: JSON.stringify({ address, mapUrl }),
      })
      setBarrio(b)
      setAviso('Guardado. Los invitados ya lo ven en su link.')
    } catch {
      setError('El link de mapas tiene que empezar con http. Copialo desde Google Maps con "Compartir".')
    }
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  return (
    <Shell me={me}>
      <div className="flex max-w-xl flex-col gap-6">
        <div>
          <h1 className="display text-2xl">{barrio?.name ?? 'Barrio'}</h1>
          <p className="mt-1 text-ink-soft">
            Esto aparece en el link que recibe el invitado, abajo de quién lo invitó.
          </p>
        </div>

        <Filete className="bg-white p-5">
          <Eyebrow>Cómo llegar</Eyebrow>
          <form onSubmit={guardar} className="mt-4 flex flex-col gap-4">
            <Field label="Dirección" value={address} placeholder="Ruta 8 km 62, Pilar"
              onChange={(e) => setAddress(e.target.value)} />
            <Field label="Link de Google Maps" value={mapUrl} type="url"
              placeholder="https://maps.app.goo.gl/…"
              hint='En Google Maps, buscá la entrada del barrio y tocá "Compartir" → "Copiar vínculo".'
              onChange={(e) => setMapUrl(e.target.value)} />
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <p role="status" className="text-sm text-alamo">{aviso}</p>}
            <Button type="submit" className="self-start">Guardar</Button>
          </form>
        </Filete>

        {barrio?.mapUrl && (
          <a href={barrio.mapUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-alamo underline underline-offset-4">
            Probar el link de mapas
          </a>
        )}
      </div>
    </Shell>
  )
}
