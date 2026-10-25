'use client'
import { use, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { Upload, X } from 'lucide-react'
import { useBarrio, useRubros, useGuardarBarrio, useSubirLogo, useQuitarLogo, useSubirPlano, useQuitarPlano, tipoDePlano, type HorasPermanencia } from '@/lib/queries/admin'
import { ApiError } from '@/lib/api'
import { logoUrl, planoUrl, useMarca } from '@/lib/marca-cliente'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { VistaPreviaMarca } from '@/components/admin/vista-previa-marca'
import { Rubros } from '@/components/admin/rubros'
import { HorariosProveedores, HoyProveedores } from '@/components/admin/horarios-proveedores'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

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

/** '15' → 15; lo que no es un entero de 1 a 90 → undefined. */
function diasValidos(v: string): number | undefined {
  const n = Number(v)
  return /^\d+$/.test(v.trim()) && n >= 1 && n <= 90 ? n : undefined
}

/*
 * Tres pestañas, una por cómo piensa el admin: cómo ve el invitado al barrio,
 * quién entra y cuándo, y qué se le exige al que entra. Cada sección guarda
 * sola. Los tres paneles quedan montados (ocultos): cambiar de pestaña no
 * pierde lo que se estaba cargando.
 */
const PESTANAS = [
  { valor: 'barrio', etiqueta: 'Barrio' },
  { valor: 'garita', etiqueta: 'Garita' },
  { valor: 'seguros', etiqueta: 'Seguros' },
] as const
type Pestana = (typeof PESTANAS)[number]['valor']

const TARJETA = 'flex flex-col gap-4 rounded-md border border-line bg-card p-5'
const TITULO = 'text-[13px] font-semibold text-ink-soft'

export default function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = use(searchParams)
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>(PESTANAS.find((p) => p.valor === sp.tab)?.valor ?? 'barrio')
  const barrio = useBarrio()
  const marcaReal = useMarca()
  // Una mutación por sección: el "Guardado." de una no aparece en las otras.
  const guardarBarrio = useGuardarBarrio()
  const guardarGarita = useGuardarBarrio()
  const guardarSeguros = useGuardarBarrio()
  const rubros = useRubros()
  const subirLogo = useSubirLogo()
  const quitarLogo = useQuitarLogo()
  const subirPlano = useSubirPlano()
  const quitarPlano = useQuitarPlano()

  const [nombre, setNombre] = useState('')
  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [errorLogo, setErrorLogo] = useState<string | null>(null)
  // null = ese tipo no alerta; un string = lo que está tipeado en las horas.
  const [alertas, setAlertas] = useState<Record<TipoAlerta, string | null>>({ visita: null, proveedor: null })
  // Mismo criterio para el seguro: null = no avisa.
  const [diasSeguro, setDiasSeguro] = useState<string | null>(null)
  const [pideAuto, setPideAuto] = useState(false)
  const [excepcionAuto, setExcepcionAuto] = useState(true)
  const [cargado, setCargado] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [arrastrandoPlano, setArrastrandoPlano] = useState(false)
  const [errorPlano, setErrorPlano] = useState<string | null>(null)
  const inputPlano = useRef<HTMLInputElement>(null)

  // Se precarga una sola vez, cuando llegan los datos: después el admin
  // manda sobre lo que escribe, la query no le pisa el formulario. Se
  // ajusta durante el render (patrón oficial de React para esto) en vez
  // de en un efecto, para no disparar un ciclo de render de más.
  if (barrio.data && !cargado) {
    setCargado(true)
    setNombre(barrio.data.name)
    setAddress(barrio.data.address ?? '')
    setMapUrl(barrio.data.mapUrl ?? '')
    setColor(barrio.data.brandColor)
    const h = barrio.data.overstayHours
    setAlertas({ visita: h.visita?.toString() ?? null, proveedor: h.proveedor?.toString() ?? null })
    setDiasSeguro(barrio.data.insuranceWarnDays?.toString() ?? null)
    setPideAuto(barrio.data.vehicleInsuranceRequired)
    setExcepcionAuto(barrio.data.vehicleInsuranceOverride)
  }

  const diasInvalidos = diasSeguro !== null && diasValidos(diasSeguro) === undefined
  const horasInvalidas = ALERTAS.some(({ tipo }) => alertas[tipo] !== null && horasValidas(alertas[tipo]!) === undefined)

  const marcaPreview = { ...marcaReal, nombre: nombre.trim() || marcaReal.nombre, color: color ?? marcaReal.color }

  /** La pestaña va en la URL: el tablero y otros links pueden llevar directo a una. */
  function elegir(p: string) {
    setPestana(p as Pestana)
    router.replace(`/admin/barrio?tab=${p}`, { scroll: false })
  }

  function enviarBarrio(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    guardarBarrio.mutate({ name: nombre.trim(), address, mapUrl, ...(color ? { brandColor: color } : {}) })
  }

  function enviarGarita(e: React.FormEvent) {
    e.preventDefault()
    if (horasInvalidas) return
    const horas = (t: TipoAlerta) => (alertas[t] === null ? null : horasValidas(alertas[t]!)!)
    guardarGarita.mutate({ overstayHours: { visita: horas('visita'), proveedor: horas('proveedor') } })
  }

  function enviarSeguros(e: React.FormEvent) {
    e.preventDefault()
    if (diasInvalidos) return
    guardarSeguros.mutate({
      insuranceWarnDays: diasSeguro === null ? null : diasValidos(diasSeguro)!,
      vehicleInsuranceRequired: pideAuto, vehicleInsuranceOverride: excepcionAuto,
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

  async function subirElPlano(file: File) {
    setErrorPlano(null)
    if (!['image/svg+xml', 'image/png', 'image/jpeg'].includes(tipoDePlano(file))) {
      setErrorPlano('Ese archivo no es un SVG, PNG ni JPG.')
      return
    }
    if (file.size > 1_000_000) {
      setErrorPlano('El archivo pesa más de 1 MB.')
      return
    }
    await subirPlano.mutateAsync(file).catch((e: unknown) => setErrorPlano(
      e instanceof ApiError && e.code === 'formato_no_soportado' ? 'Ese archivo no es un SVG, PNG ni JPG.'
        : e instanceof ApiError && e.status === 413 ? 'El archivo pesa más de 1 MB.'
        : 'No se pudo subir. Probá de nuevo.'))
  }

  if (barrio.isPending) return <p className="text-ink-soft">Cargando…</p>

  const piden = (rubros.data ?? []).filter((r) => r.requiresInsurance && !r.archivedAt)

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Configuración"
        subtitulo="Cómo se ve el barrio, quién entra y cuándo, y qué se le pide al que entra." />

      <TabsPrimitive.Root value={pestana} onValueChange={elegir} className="flex flex-col gap-6">
        {/* En el celular las pestañas se deslizan en vez de partirse en dos renglones. */}
        <TabsPrimitive.List aria-label="Secciones de la configuración"
          className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          {PESTANAS.map((p) => (
            <TabsPrimitive.Trigger key={p.valor} value={p.valor}
              className={cn(
                'relative min-h-11 shrink-0 rounded-sm px-4 text-[15px] font-semibold text-ink-soft outline-none',
                // El foco va adentro del botón: la lista tiene scroll lateral y recortaría un anillo por fuera.
                'hover-fino:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-focus',
                'data-[state=active]:text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full',
                'data-[state=active]:after:bg-azul',
              )}>
              {p.etiqueta}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        {/* ---------- Barrio: lo que ve el invitado en su link ---------- */}
        <TabsPrimitive.Content value="barrio" forceMount className="outline-none data-[state=inactive]:hidden">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex flex-col gap-6">
              <p className="text-sm text-ink-soft">Esto aparece en el link que recibe el invitado, abajo de quién lo invitó.</p>

              <form onSubmit={enviarBarrio} className={TARJETA}>
                <Campo id="nombre" etiqueta="Nombre del barrio">
                  <Input id="nombre" value={nombre} placeholder="Los Aromos" maxLength={80} required
                    onChange={(e) => setNombre(e.target.value)} />
                </Campo>
                <Campo id="direccion" etiqueta="Dirección">
                  <Input id="direccion" value={address} placeholder="Ruta 8 km 62, Pilar"
                    onChange={(e) => setAddress(e.target.value)} />
                </Campo>
                <Campo id="mapas" etiqueta="Link de Google Maps"
                  ayuda='En Google Maps, buscá la entrada del barrio y tocá "Compartir" → "Copiar vínculo".'>
                  <Input id="mapas" type="url" value={mapUrl} placeholder="https://maps.app.goo.gl/…"
                    onChange={(e) => setMapUrl(e.target.value)} />
                </Campo>
                {barrio.data?.mapUrl && (
                  <a href={barrio.data.mapUrl} target="_blank" rel="noopener noreferrer"
                    className="self-start text-sm text-azul-text underline underline-offset-4">
                    Probar el link de mapas
                  </a>
                )}

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

                {guardarBarrio.isError && <Nota tono="error">No se pudo guardar. Revisá el link de mapas: tiene que empezar con http.</Nota>}
                {guardarBarrio.isSuccess && <Nota tono="exito">Guardado.</Nota>}
                <Button type="submit" className="self-start" disabled={guardarBarrio.isPending || !nombre.trim()}>
                  {guardarBarrio.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </form>

              <div className={cn(TARJETA, 'items-start gap-3')}>
                <p className={TITULO}>Logo</p>
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
                  <span className="text-xs text-ink-soft">Hasta 500 KB. Se guarda al subirlo. Se muestra sobre una placa blanca, en tema claro y oscuro.</span>
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

              <div className={cn(TARJETA, 'items-start gap-3')}>
                <p className={TITULO}>Plano del barrio</p>
                {marcaReal.tienePlano ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={planoUrl(marcaReal, null) ?? ''} alt="Plano del barrio"
                    className="max-h-64 w-auto max-w-full rounded-md bg-white object-contain ring-1 ring-black/5" />
                ) : (
                  <p className="text-ink-soft">Sin plano, el invitado no ve ninguno.</p>
                )}
                <button type="button"
                  onClick={() => inputPlano.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setArrastrandoPlano(true) }}
                  onDragLeave={() => setArrastrandoPlano(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setArrastrandoPlano(false)
                    const file = e.dataTransfer.files[0]
                    if (file) subirElPlano(file)
                  }}
                  disabled={subirPlano.isPending}
                  className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 text-center text-sm
                    ${arrastrandoPlano ? 'border-azul bg-azul-tint' : 'border-line'} disabled:opacity-50`}>
                  <Upload className="size-5 text-ink-soft" aria-hidden />
                  <span>{subirPlano.isPending ? 'Subiendo…' : 'Arrastrá el plano, o tocá para elegirlo'}</span>
                  <span className="text-xs text-ink-soft">SVG, PNG o JPG, hasta 1 MB. Se guarda al subirlo. Si es un SVG con los lotes como lote-N, el invitado ve su lote resaltado.</span>
                </button>
                <input ref={inputPlano} type="file" accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg" className="sr-only"
                  aria-label="Archivo del plano"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subirElPlano(f); e.target.value = '' }} />
                {errorPlano && <Nota tono="error">{errorPlano}</Nota>}
                {marcaReal.tienePlano && (
                  <Button variant="outline" onClick={() => quitarPlano.mutate()} disabled={quitarPlano.isPending}>
                    <X aria-hidden />Quitar el plano
                  </Button>
                )}
              </div>
            </div>

            <aside className="lg:sticky lg:top-20 lg:self-start">
              <VistaPreviaMarca marca={marcaPreview} />
            </aside>
          </div>
        </TabsPrimitive.Content>

        {/* ---------- Garita: quién entra y cuándo ---------- */}
        <TabsPrimitive.Content value="garita" forceMount className="outline-none data-[state=inactive]:hidden">
          {barrio.data && (
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="flex flex-col gap-6">
                <form onSubmit={enviarGarita} className={TARJETA}>
                  <div>
                    <p className={TITULO}>Alerta de permanencia</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      La garita avisa cuando alguien lleva más que esto adentro sin que se registre su salida. Una frecuente usa las horas de lo que es: visita o proveedor.
                    </p>
                  </div>
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
                  {guardarGarita.isError && <Nota tono="error">No se pudo guardar. Probá de nuevo.</Nota>}
                  {guardarGarita.isSuccess && <Nota tono="exito">Guardado.</Nota>}
                  <Button type="submit" className="self-start" disabled={guardarGarita.isPending || horasInvalidas}>
                    {guardarGarita.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                </form>

                <section aria-labelledby="proveedores" className="flex flex-col gap-4">
                  <h2 id="proveedores" className={TITULO}>Proveedores</h2>
                  <Rubros />
                  <HorariosProveedores inicial={barrio.data.providerWindows} rubros={rubros.data ?? []} />
                </section>
              </div>
              <div className="xl:sticky xl:top-20">
                <HoyProveedores franjas={barrio.data.providerWindows} rubros={rubros.data ?? []} />
              </div>
            </div>
          )}
        </TabsPrimitive.Content>

        {/* ---------- Seguros: qué se le exige al que entra ---------- */}
        <TabsPrimitive.Content value="seguros" forceMount className="outline-none data-[state=inactive]:hidden">
          <form onSubmit={enviarSeguros} className={cn(TARJETA, 'max-w-3xl gap-6')}>
            <div className="flex flex-col gap-2">
              <p className={TITULO}>Seguro del proveedor</p>
              <p className="text-sm text-ink-soft">
                Lo piden los rubros marcados con &quot;Pide seguro&quot; en <button type="button" onClick={() => elegir('garita')}
                  className="font-semibold text-azul-text underline underline-offset-4">Garita → Rubros</button>.
                {' '}{piden.length ? `Hoy: ${piden.map((r) => r.name).join(', ')}.` : 'Hoy ningún rubro lo pide.'}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-5">
              <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-w-36 items-center gap-3 text-sm font-semibold">
                  <Switch checked={diasSeguro !== null} aria-label="Avisar por seguro por vencer"
                    onCheckedChange={(on) => setDiasSeguro(on ? '15' : null)} />
                  Seguro por vencer
                </label>
                {diasSeguro !== null ? (
                  <span className="flex items-center gap-2 text-sm text-ink-soft">
                    avisar
                    <Input id="dias-seguro" type="number" inputMode="numeric" min={1} max={90} step={1}
                      aria-label="Días de aviso antes del vencimiento del seguro" aria-invalid={diasInvalidos}
                      aria-describedby={diasInvalidos ? 'dias-seguro-nota' : undefined}
                      className="w-20 tabular" value={diasSeguro} onChange={(e) => setDiasSeguro(e.target.value)} />
                    días antes
                  </span>
                ) : (
                  <span className="text-sm text-ink-soft">No avisa</span>
                )}
              </div>
              {diasInvalidos && <p id="dias-seguro-nota" role="alert" className="text-sm text-alto">Poné entre 1 y 90 días.</p>}
              <p className="text-sm text-ink-soft">Avisa en el tablero, en la garita y en Seguros esos días antes de que venza, para los proveedores y los autos.</p>
            </div>

            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <p className={TITULO}>Seguro del auto</p>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                  <Switch checked={pideAuto} onCheckedChange={setPideAuto} aria-label="Pedir seguro del auto" />
                  Pedir seguro del auto
                </label>
                <p className="pl-12 text-sm text-ink-soft">
                  La garita frena a todo el que entra en auto sin un seguro vigente cargado para esa patente. Lo carga solo la guardia, con el certificado a la vista; la próxima vez ese auto pasa sin que se lo pidan.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className={`flex min-h-11 items-center gap-3 pl-12 text-sm ${pideAuto ? 'font-semibold' : 'text-ink-soft'}`}>
                  <Switch checked={excepcionAuto} disabled={!pideAuto} onCheckedChange={setExcepcionAuto}
                    aria-label="Permitir autorizar igual sin seguro del auto" />
                  Permitir autorizar igual sin seguro del auto
                </label>
                <p className="pl-24 text-sm text-ink-soft">
                  Si no lo permitís, un auto sin seguro no entra ni con &quot;Autorizar igual&quot;: la persona puede entrar a pie.
                </p>
              </div>
            </div>

            {guardarSeguros.isError && <Nota tono="error">No se pudo guardar. Probá de nuevo.</Nota>}
            {guardarSeguros.isSuccess && <Nota tono="exito">Guardado.</Nota>}
            <Button type="submit" className="self-start" disabled={guardarSeguros.isPending || diasInvalidos}>
              {guardarSeguros.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  )
}
