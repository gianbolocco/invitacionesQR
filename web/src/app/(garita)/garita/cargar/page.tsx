'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ClipboardPen, Plus, Search, X } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Campo } from '@/components/dominio/campo'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { CampoHora } from '@/components/dominio/campo-hora'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { Vacio } from '@/components/dominio/vacio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { hoyISO } from '@/lib/fechas'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda, useCargarManual } from '@/lib/queries/garita'
import type { Hit } from '@/lib/gate'
import {
  aInstante, pisaOtra, resumenCarga, validarCarga, VENTANA_HORAS, type Carga, type Momento,
} from '@/lib/carga-manual'

// Una función y no una constante: la pantalla puede quedar abierta pasada la medianoche.
const vacio = (): Momento => ({ fecha: hoyISO(), hora: '' })

/**
 * Para pasar al sistema lo que se anotó en papel durante un corte: una tanda
 * de ingresos y egresos con la hora en que pasaron. Es un registro, no una
 * decisión de acceso: no mira cupo ni vigencia (ver registerManual en la API).
 */
export default function CargarMovimientosPage() {
  const router = useRouter()
  const cargar = useCargarManual()
  const hoy = hoyISO()

  const [texto, setTexto] = useState('')
  const busqueda = useBusqueda(useDemora(texto).trim())
  const [persona, setPersona] = useState<Hit | null>(null)
  const [entrada, setEntrada] = useState<Momento>(vacio)
  const [seFue, setSeFue] = useState(true)
  const [salida, setSalida] = useState<Momento>(vacio)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tanda, setTanda] = useState<Carga[]>([])

  function agregar() {
    if (!persona) return
    const nueva: Carga = {
      clave: crypto.randomUUID(), invitationId: persona.id, guestName: persona.guestName,
      unitLabel: persona.unitLabel, entrada, salida: seFue ? salida : null, nota: nota.trim(),
    }
    const problema = validarCarga(nueva)
      ?? (pisaOtra(nueva, tanda) ? 'Se superpone con otro movimiento de esta persona en la tanda.' : null)
    if (problema) { setError(problema); return }
    setTanda((t) => [...t, nueva])
    // Se limpia la persona pero se conserva la fecha: la tanda de un corte suele ser del mismo día.
    setPersona(null); setTexto(''); setNota(''); setError(null)
    setEntrada((e) => ({ fecha: e.fecha, hora: '' })); setSalida((s) => ({ fecha: s.fecha, hora: '' }))
  }

  async function guardar() {
    await cargar.mutateAsync(tanda.map((c) => ({
      invitationId: c.invitationId, enteredAt: aInstante(c.entrada),
      exitedAt: c.salida ? aInstante(c.salida) : null, note: c.nota || undefined,
    })))
    toast.success(tanda.length === 1 ? 'Se cargó 1 movimiento.' : `Se cargaron ${tanda.length} movimientos.`)
    setTanda([])
  }

  return (
    <ChromeGarita>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={() => router.push('/garita')}>
          <ArrowLeft aria-hidden />Volver a la garita
        </Button>
        <EncabezadoPagina titulo="Cargar movimientos"
          subtitulo={`Para pasar lo que se anotó en papel durante un corte. Se puede cargar lo de las últimas ${VENTANA_HORAS} horas y queda marcado como carga manual.`} />

        <section aria-label="Agregar un movimiento" className="flex flex-col gap-4 rounded-md border border-line bg-card p-4 sm:p-5">
          {persona ? (
            <Fila densa titulo={persona.guestName} meta={[persona.unitLabel, persona.guestDoc, persona.plate].filter(Boolean).join(' · ')}
              className="border-b-0 py-0"
              extremo={<Button variant="ghost" size="sm" onClick={() => setPersona(null)}>Cambiar</Button>} />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                <Input type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
                  className="h-12 pl-10 text-base" />
              </div>
              {busqueda.data?.map((h) => (
                <Fila densa key={h.id} titulo={h.guestName} meta={[h.unitLabel, h.guestDoc, h.plate].filter(Boolean).join(' · ')}
                  onClick={() => setPersona(h)} extremo={h.adentro ? <EstadoTag estado="adentro" /> : undefined} />
              ))}
              {busqueda.data?.length === 0 && <p className="text-sm text-ink-soft">No hay nadie con ese dato.</p>}
            </div>
          )}

          {persona && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo id="ingreso-fecha" etiqueta="Ingresó el">
                  <CampoFecha id="ingreso-fecha" valor={entrada.fecha} onCambio={(fecha) => setEntrada({ ...entrada, fecha })} />
                </Campo>
                <Campo id="ingreso-hora" etiqueta="A las">
                  <CampoHora id="ingreso-hora" valor={entrada.hora} onCambio={(hora) => setEntrada({ ...entrada, hora })} />
                </Campo>
              </div>

              <div className="flex items-center gap-3">
                <Switch id="se-fue" checked={seFue} onCheckedChange={setSeFue} />
                <Label htmlFor="se-fue" className="text-sm font-semibold">Ya se fue</Label>
              </div>

              {seFue && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Campo id="salida-fecha" etiqueta="Salió el">
                    <CampoFecha id="salida-fecha" valor={salida.fecha} onCambio={(fecha) => setSalida({ ...salida, fecha })} />
                  </Campo>
                  <Campo id="salida-hora" etiqueta="A las">
                    <CampoHora id="salida-hora" valor={salida.hora} onCambio={(hora) => setSalida({ ...salida, hora })} />
                  </Campo>
                </div>
              )}

              <Campo id="nota" etiqueta="Nota" ayuda="Opcional. Por ejemplo: corte de luz, planilla de papel.">
                <Input id="nota" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} />
              </Campo>

              {error && <p role="alert" className="text-sm text-alto animate-in fade-in duration-200">{error}</p>}
              <Button onClick={agregar} className="self-start"><Plus aria-hidden />Agregar a la tanda</Button>
            </>
          )}
        </section>

        <section aria-label="Tanda a guardar" className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-extrabold tracking-[-0.01em]">
            Tanda <span className="tabular text-ink-soft">({tanda.length})</span>
          </h2>
          {tanda.length === 0 ? (
            <Vacio icono={ClipboardPen} titulo="Todavía no agregaste nada"
              detalle="Buscá a la persona, completá las horas y agregala. Podés sumar varias y guardarlas juntas." />
          ) : (
            <>
              <div>
                {tanda.map((c) => (
                  <Fila densa key={c.clave} titulo={c.guestName}
                    meta={`${c.unitLabel} · ${resumenCarga(c, hoy)}${c.nota ? ` · ${c.nota}` : ''}`}
                    extremo={
                      <Button variant="ghost" size="icon" aria-label={`Quitar a ${c.guestName} de la tanda`}
                        onClick={() => setTanda((t) => t.filter((x) => x.clave !== c.clave))}>
                        <X aria-hidden />
                      </Button>
                    } />
                ))}
              </div>
              <Button size="lg" disabled={cargar.isPending} onClick={guardar}>
                {cargar.isPending ? 'Guardando…' : `Guardar ${tanda.length} ${tanda.length === 1 ? 'movimiento' : 'movimientos'}`}
              </Button>
            </>
          )}
        </section>
      </div>
    </ChromeGarita>
  )
}
