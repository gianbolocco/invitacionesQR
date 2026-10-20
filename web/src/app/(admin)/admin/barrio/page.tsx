'use client'
import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useBarrio, useGuardarBarrio, useSubirLogo, useQuitarLogo, type HorasPermanencia } from '@/lib/queries/admin'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { VistaPreviaMarca } from '@/components/admin/vista-previa-marca'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type TipoAlerta = keyof HorasPermanencia
// Lo que se propone al prender la alerta: una visita rara vez pasa de la tarde;
// un proveedor trabaja una jornada.
const ALERTAS: { tipo: TipoAlerta; etiqueta: string; sugerida: string }[] = [
  { tipo: 'visita', etiqueta: 'Visitas', sugerida: '6' },
  { tipo: 'proveedor', etiqueta: 'Proveedores', sugerida: '8' },
]

/** '6' → 6; lo que no es un entero de 1 a 72 → undefined. */
function horasValidas(v: string): number | undefined {
  const n = Number(v)
  return /^\d+$/.test(v.trim()) && n >= 1 && n <= 72 ? n : undefined
}

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
  // null = ese tipo no alerta; un string = lo que está tipeado en las horas.
  const [alertas, setAlertas] = useState<Record<TipoAlerta, string | null>>({ visita: null, proveedor: null })
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
    const h = barrio.data.overstayHours
    setAlertas({ visita: h.visita?.toString() ?? null, proveedor: h.proveedor?.toString() ?? null })
  }

  const horasInvalidas = ALERTAS.some(({ tipo }) => alertas[tipo] !== null && horasValidas(alertas[tipo]!) === undefined)

  const marcaPreview = { ...marcaReal, nombre: barrio.data?.name ?? marcaReal.nombre, color: color ?? marcaReal.color }

  async function guardarForm(e: React.FormEvent) {
    e.preventDefault()
    if (horasInvalidas) return
    const horas = (t: TipoAlerta) => (alertas[t] === null ? null : horasValidas(alertas[t]!)!)
    await guardar.mutateAsync({
      address, mapUrl, ...(color ? { brandColor: color } : {}),
      overstayHours: { visita: horas('visita'), proveedor: horas('proveedor') },
    })
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

          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Alertas de permanencia</legend>
            {ALERTAS.map(({ tipo, etiqueta, sugerida }) => {
              const valor = alertas[tipo]
              const error = valor !== null && horasValidas(valor) === undefined ? 'Poné entre 1 y 72 horas.' : null
              return (
                <div key={tipo} className="flex flex-col gap-1.5">
                  <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex min-w-36 items-center gap-3 text-sm font-semibold">
                      <Switch checked={valor !== null} aria-label={`Alertar por ${etiqueta.toLowerCase()}`}
                        onCheckedChange={(on) => setAlertas((a) => ({ ...a, [tipo]: on ? sugerida : null }))} />
                      {etiqueta}
                    </label>
                    {valor !== null ? (
                      <span className="flex items-center gap-2 text-sm text-ink-soft">
                        después de
                        <Input id={`horas-${tipo}`} type="number" inputMode="numeric" min={1} max={72} step={1}
                          aria-label={`Horas para ${etiqueta.toLowerCase()}`} aria-invalid={!!error}
                          aria-describedby={error ? `horas-${tipo}-nota` : undefined}
                          className="w-20 tabular" value={valor}
                          onChange={(e) => setAlertas((a) => ({ ...a, [tipo]: e.target.value }))} />
                        horas adentro
                      </span>
                    ) : (
                      <span className="text-sm text-ink-soft">No alerta</span>
                    )}
                  </div>
                  {error && <p id={`horas-${tipo}-nota`} role="alert" className="text-sm text-alto">{error}</p>}
                </div>
              )
            })}
            <p className="text-sm text-ink-soft">
              La garita avisa cuando alguien lleva más que esto adentro sin que se registre su salida. Una frecuente usa las horas de lo que es: visita o proveedor.
            </p>
          </fieldset>

          {guardar.isError && <Nota tono="error">No se pudo guardar. Revisá el link de mapas (tiene que empezar con http) y las horas.</Nota>}
          {guardar.isSuccess && <Nota tono="exito">Guardado.</Nota>}
          <Button type="submit" className="self-start" disabled={guardar.isPending || horasInvalidas}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>

        <div className="flex flex-col items-start gap-3 rounded-md border border-line bg-card p-5">
          <p className="text-[13px] font-semibold text-ink-soft">Logo</p>
          {marcaReal.tieneLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(marcaReal) ?? ''} alt="Logo del barrio"
              className="h-16 w-auto max-w-[16rem] rounded-md bg-white object-contain px-3 py-2 shadow-sm ring-1 ring-black/5" />
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
            <span className="text-xs text-ink-soft">Hasta 500 KB. Se muestra sobre una placa blanca, en tema claro y oscuro.</span>
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
