'use client'
import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useBarrio, useGuardarBarrio, useSubirLogo, useQuitarLogo } from '@/lib/queries/admin'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { VistaPreviaMarca } from '@/components/admin/vista-previa-marca'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function BarrioPage() {
  const barrio = useBarrio()
  const marcaReal = useMarca()
  const guardar = useGuardarBarrio()
  const subirLogo = useSubirLogo()
  const quitarLogo = useQuitarLogo()

  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [errorLogo, setErrorLogo] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  // Se precarga una sola vez, cuando llegan los datos: después el admin
  // manda sobre lo que escribe, la query no le pisa el formulario. Se
  // ajusta durante el render (patrón oficial de React para esto) en vez
  // de en un efecto, para no disparar un ciclo de render de más.
  if (barrio.data && !cargado) {
    setCargado(true)
    setAddress(barrio.data.address ?? '')
    setMapUrl(barrio.data.mapUrl ?? '')
    setColor(barrio.data.brandColor)
  }

  const marcaPreview = { ...marcaReal, nombre: barrio.data?.name ?? marcaReal.nombre, color: color ?? marcaReal.color }

  async function guardarForm(e: React.FormEvent) {
    e.preventDefault()
    await guardar.mutateAsync({ address, mapUrl, ...(color ? { brandColor: color } : {}) })
  }

  async function subir(file: File) {
    setErrorLogo(null)
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setErrorLogo('Tiene que ser un PNG o un JPG.')
      return
    }
    if (file.size > 500_000) {
      setErrorLogo('El archivo tiene que pesar menos de 500 KB.')
      return
    }
    await subirLogo.mutateAsync(file).catch(() => setErrorLogo('No se pudo subir. Probá de nuevo.'))
  }

  if (barrio.isPending) return <p className="text-ink-soft">Cargando…</p>

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo={barrio.data?.name ?? 'Barrio'}
          subtitulo="Esto aparece en el link que recibe el invitado, abajo de quién lo invitó." />

        <form onSubmit={guardarForm} className="flex flex-col gap-4 rounded-md border border-line bg-card p-5">
          <Campo id="direccion" etiqueta="Dirección">
            <Input id="direccion" value={address} placeholder="Ruta 8 km 62, Pilar"
              onChange={(e) => setAddress(e.target.value)} />
          </Campo>
          <Campo id="mapas" etiqueta="Link de Google Maps"
            ayuda='En Google Maps, buscá la entrada del barrio y tocá "Compartir" → "Copiar vínculo".'>
            <Input id="mapas" type="url" value={mapUrl} placeholder="https://maps.app.goo.gl/…"
              onChange={(e) => setMapUrl(e.target.value)} />
          </Campo>

          <fieldset className="border-t border-line pt-4">
            <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Color del barrio</legend>
            <div className="flex flex-wrap gap-2">
              {(barrio.data?.paleta ?? []).map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  aria-label={`Color ${c}`} aria-pressed={color === c} style={{ backgroundColor: c }}
                  className={`size-11 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} />
              ))}
            </div>
            <p className="mt-1.5 text-sm text-ink-soft">
              Lista cerrada a propósito: son los colores con los que el texto encima se lee bien, de día y de noche.
            </p>
          </fieldset>

          {guardar.isError && <Nota tono="error">El link de mapas tiene que empezar con http. Copialo desde Google Maps con &quot;Compartir&quot;.</Nota>}
          {guardar.isSuccess && <Nota tono="exito">Guardado.</Nota>}
          <Button type="submit" className="self-start" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>

        <div className="flex flex-col items-start gap-3 rounded-md border border-line bg-card p-5">
          <p className="text-[13px] font-semibold text-ink-soft">Logo</p>
          {marcaReal.tieneLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(marcaReal) ?? ''} alt="Logo del barrio" className="h-16 w-auto max-w-[16rem] object-contain" />
          ) : (
            <p className="text-ink-soft">Sin logo, mostramos el nombre del barrio.</p>
          )}

          <button type="button"
            onClick={() => inputArchivo.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastrando(false)
              const file = e.dataTransfer.files[0]
              if (file) subir(file)
            }}
            disabled={subirLogo.isPending}
            className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 text-center text-sm
              ${arrastrando ? 'border-azul bg-azul-tint' : 'border-line'} disabled:opacity-50`}>
            <Upload className="size-5 text-ink-soft" aria-hidden />
            <span>{subirLogo.isPending ? 'Subiendo…' : 'Arrastrá un PNG o JPG, o tocá para elegirlo'}</span>
            <span className="text-xs text-ink-soft">Hasta 500 KB</span>
          </button>
          <input ref={inputArchivo} type="file" accept="image/png,image/jpeg" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />

          {errorLogo && <Nota tono="error">{errorLogo}</Nota>}

          {marcaReal.tieneLogo && (
            <Button variant="outline" onClick={() => quitarLogo.mutate()} disabled={quitarLogo.isPending}>
              <X aria-hidden />Quitar el logo
            </Button>
          )}
        </div>

        {barrio.data?.mapUrl && (
          <a href={barrio.data.mapUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-azul-text underline underline-offset-4">
            Probar el link de mapas
          </a>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <VistaPreviaMarca marca={marcaPreview} />
      </aside>
    </div>
  )
}
