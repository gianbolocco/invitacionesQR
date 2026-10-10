'use client'
import { useEffect, useState } from 'react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'

type Barrio = {
  id: string
  name: string
  address: string | null
  mapUrl: string | null
  brandColor: string | null
  paleta: string[]
}

export default function BarrioPage() {
  const me = useMe()
  const [barrio, setBarrio] = useState<Barrio | null>(null)
  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [tieneLogo, setTieneLogo] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    api<Barrio>('/admin/neighborhood').then((b) => {
      setBarrio(b)
      setAddress(b.address ?? '')
      setMapUrl(b.mapUrl ?? '')
      setColor(b.brandColor)
    }).catch(() => {})
    api<{ tieneLogo: boolean }>('/branding')
      .then((m) => setTieneLogo(m.tieneLogo))
      .catch(() => {})
  }, [me])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    try {
      const b = await api<Barrio>('/admin/neighborhood', {
        method: 'PATCH',
        body: JSON.stringify({ address, mapUrl, ...(color ? { brandColor: color } : {}) }),
      })
      setBarrio(b)
      setAviso('Guardado. Recargá la página para ver el color nuevo.')
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

        <Filete className="bg-card p-5">
          <Eyebrow>Cómo llegar</Eyebrow>
          <form onSubmit={guardar} className="mt-4 flex flex-col gap-4">
            <Field label="Dirección" value={address} placeholder="Ruta 8 km 62, Pilar"
              onChange={(e) => setAddress(e.target.value)} />
            <Field label="Link de Google Maps" value={mapUrl} type="url"
              placeholder="https://maps.app.goo.gl/…"
              hint='En Google Maps, buscá la entrada del barrio y tocá "Compartir" → "Copiar vínculo".'
              onChange={(e) => setMapUrl(e.target.value)} />
            <fieldset className="border-t border-line pt-4">
              <legend className="eyebrow mb-2">Color del barrio</legend>
              <div className="flex flex-wrap gap-2">
                {(barrio?.paleta ?? []).map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    aria-label={`Color ${c}`} aria-pressed={color === c}
                    style={{ backgroundColor: c }}
                    className={`size-11 rounded-full border-2 ${
                      color === c ? 'border-ink' : 'border-transparent'
                    }`} />
                ))}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                Es una lista cerrada a propósito: son los colores con los que el
                texto encima se lee bien, de día y de noche.
              </p>
            </fieldset>
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <p role="status" className="text-sm text-marca">{aviso}</p>}
            <Button type="submit" className="self-start">Guardar</Button>
          </form>
        </Filete>

        <Filete className="flex flex-col items-start gap-3 bg-card p-5">
          <Eyebrow>Logo</Eyebrow>
          {tieneLogo ? (
            // La query evita que el navegador siga mostrando el anterior desde
            // su caché después de reemplazarlo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${apiBase}/branding/logo?v=${barrio?.id ?? ''}`} alt="Logo del barrio"
              className="h-16 w-auto max-w-[16rem] object-contain" />
          ) : (
            <p className="text-ink-soft">
              Sin logo se muestra el nombre del barrio en itálica.
            </p>
          )}

          <input type="file" accept="image/png,image/jpeg" disabled={subiendo}
            className="text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setSubiendo(true)
              setError(null)
              setAviso(null)
              try {
                // fetch directo y no el helper api(): este manda un binario con
                // su propio Content-Type, y el helper fuerza application/json.
                const res = await fetch(`${apiBase}/admin/branding/logo`, {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': file.type },
                  body: file,
                })
                if (!res.ok) throw new Error(String(res.status))
                setTieneLogo(true)
                setAviso('Logo actualizado. Recargá para verlo en el encabezado.')
              } catch {
                setError('No se pudo subir. Tiene que ser un PNG o un JPG de menos de 500 KB.')
              }
              setSubiendo(false)
              e.target.value = ''
            }} />

          {tieneLogo && (
            <Button variant="quiet" type="button" onClick={async () => {
              await api('/admin/branding/logo', { method: 'DELETE' })
              setTieneLogo(false)
              setAviso('Logo quitado. Recargá para ver el nombre en su lugar.')
            }}>
              Quitar el logo
            </Button>
          )}
        </Filete>

        {barrio?.mapUrl && (
          <a href={barrio.mapUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-marca underline underline-offset-4">
            Probar el link de mapas
          </a>
        )}
      </div>
    </Shell>
  )
}
