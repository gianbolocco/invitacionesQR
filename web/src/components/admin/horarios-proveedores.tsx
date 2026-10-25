'use client'
import { useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useGuardarFranjas, type Rubro } from '@/lib/queries/admin'
import { diaDe, horaCorta, nombreDiaPlural, textoHorario, temporadaRige, vigentesHoy, type Franja } from '@/lib/franjas'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Nota } from '@/components/dominio/nota'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Lunes primero a la vista; se guarda como en la API (0 = domingo).
const DIAS = [{ n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'M' }, { n: 4, l: 'J' }, { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 0, l: 'D' }]
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const NUEVA: Franja = { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: null, trades: null }
const selectCls = 'h-10 rounded-sm border-2 border-control bg-card px-2 text-sm text-ink outline-none focus-visible:border-azul-text'
const checkCls = 'size-5 accent-azul'

const dd = (mmdd: string) => Number(mmdd.slice(3))
const mm = (mmdd: string) => Number(mmdd.slice(0, 2))
const aMMDD = (m: number, d: number) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Día de la semana (0 = domingo) de una fecha ISO; no depende del huso. */
const diaMes = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`

function SelectorFecha({ valor, etiqueta, onChange }: { valor: string; etiqueta: string; onChange: (v: string) => void }) {
  return (
    <span className="flex gap-1">
      <select aria-label={`${etiqueta}: día`} className={`${selectCls} w-16 tabular`} value={dd(valor)}
        onChange={(e) => onChange(aMMDD(mm(valor), Number(e.target.value)))}>
        {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select>
      <select aria-label={`${etiqueta}: mes`} className={`${selectCls} w-32`} value={mm(valor)}
        onChange={(e) => onChange(aMMDD(Number(e.target.value), dd(valor)))}>
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
    </span>
  )
}

function SelectorRubros({ franja, rubros, onChange }: { franja: Franja; rubros: Rubro[]; onChange: (t: string[] | null) => void }) {
  const activos = rubros.filter((r) => !r.archivedAt)
  const elegidos = franja.trades
  const rubro = (id: string) => rubros.find((r) => r.id === id)
  function alternar(id: string) {
    const actual = elegidos ?? []
    onChange(actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id])
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {elegidos === null ? (
        <span className="inline-flex h-8 items-center rounded-full bg-azul-tint px-3 text-sm font-semibold text-azul-text">Todos</span>
      ) : elegidos.length === 0 ? (
        <span className="text-sm text-alto">Elegí al menos uno</span>
      ) : elegidos.map((id) => (
        <span key={id} className={`inline-flex h-8 items-center rounded-full bg-surface-sunk px-3 text-sm font-medium ${rubro(id)?.archivedAt ? 'text-ink-soft' : 'text-ink'}`}>
          {rubro(id)?.name ?? 'Rubro'}
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-sm px-2 text-sm text-ink-soft underline underline-offset-4">
            Elegir<ChevronDown className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-72 w-60 flex-col gap-1 overflow-y-auto p-2">
          <label className="flex min-h-10 items-center gap-3 border-b border-line px-2 text-sm font-semibold">
            <input type="checkbox" className={checkCls} checked={elegidos === null}
              onChange={(e) => onChange(e.target.checked ? null : [])} />
            Todos los rubros
          </label>
          {activos.map((r) => (
            <label key={r.id} className="flex min-h-10 items-center gap-3 px-2 text-sm">
              <input type="checkbox" className={checkCls} checked={elegidos?.includes(r.id) ?? false}
                onChange={() => alternar(r.id)} />
              {r.name}
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function HorariosProveedores({ inicial, rubros }: { inicial: Franja[]; rubros: Rubro[] }) {
  const guardar = useGuardarFranjas()
  const [franjas, setFranjasCrudo] = useState<Franja[]>(inicial)
  // Todo cambio borra el "Guardado." anterior: ya no describe lo que hay en pantalla.
  const setFranjas: typeof setFranjasCrudo = (fn) => { guardar.reset(); setFranjasCrudo(fn) }
  const hoy = new Date()
  const diaHoy = diaDe(hoyISO(hoy))
  const rigenHoy = vigentesHoy(franjas, hoy)
  const sinRubros = franjas.some((f) => f.trades?.length === 0)

  const cambiar = (i: number, parche: Partial<Franja>) =>
    setFranjas((fs) => fs.map((f, j) => (j === i ? { ...f, ...parche } : f)))

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5" aria-labelledby="horarios-titulo">
      <h3 id="horarios-titulo" className="text-[13px] font-semibold text-ink-soft">Horarios de ingreso</h3>
      <p className="text-sm text-ink-soft">
        Un proveedor entra si alguna franja incluye su rubro, el día y la hora. Fuera de eso, la garita lo rechaza y puede usar &quot;Autorizar igual&quot;.
      </p>

      {/* Una tarjeta por franja y no una tabla: con cuatro columnas de controles la
          tabla pedía ~900px y en la columna del panel quedaba con scroll lateral. */}
      <ul className="flex flex-col gap-3 text-sm tabular">
            {franjas.length === 0 && (
              <li className="py-2 text-ink-soft">Sin franjas: los proveedores entran a cualquier hora. Agregá una para restringir.</li>
            )}
            {franjas.map((f, i) => {
              const rige = rigenHoy.includes(f) && f.days.includes(diaHoy)
              return (
                <li key={i} className="flex flex-col gap-4 rounded-md border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-semibold text-ink-soft">Días</p>
                    <div className="flex flex-wrap gap-1">
                      {DIAS.map(({ n, l }) => {
                        const on = f.days.includes(n)
                        return (
                          <button key={n} type="button" aria-pressed={on} aria-label={nombreDiaPlural(n)}
                            onClick={() => cambiar(i, { days: on ? f.days.filter((d) => d !== n) : [...f.days, n] })}
                            className={`size-9 rounded-sm text-[13px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus ${on ? 'bg-ink text-card' : 'bg-surface-sunk text-ink-soft'}`}>
                            {l}
                          </button>
                        )
                      })}
                    </div>
                    {rige && <span className="inline-block self-start rounded-sm bg-verde-tint px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-verde">Hoy</span>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFranjas((fs) => fs.filter((_, j) => j !== i))}>
                      <X aria-hidden />Quitar
                    </Button>
                  </div>
                  <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-semibold text-ink-soft">Horario</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input type="time" aria-label="Desde" className="h-10 w-28 tabular" value={f.from} required
                        onChange={(e) => cambiar(i, { from: e.target.value })} />
                      a
                      {f.to === '24:00'
                        ? <span className="flex h-10 w-28 items-center px-3.5">24:00</span>
                        : <Input type="time" aria-label="Hasta" className="h-10 w-28 tabular" value={f.to} required
                            onChange={(e) => cambiar(i, { to: e.target.value })} />}
                    </div>
                    <label className="flex min-h-8 items-center gap-2 text-ink-soft">
                      <input type="checkbox" className={checkCls} checked={f.to === '24:00'}
                        onChange={(e) => cambiar(i, { to: e.target.checked ? '24:00' : '17:00' })} />
                      hasta medianoche
                    </label>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-semibold text-ink-soft">Temporada</p>
                    <label className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" className={checkCls} checked={f.season === null}
                        onChange={(e) => cambiar(i, { season: e.target.checked ? null : { from: '04-01', to: '10-31' } })} />
                      Todo el año
                    </label>
                    {f.season && (
                      // "desde" y "hasta" en un renglón; en el celular se parten en dos.
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                        <div className="flex items-center gap-2"><span className="w-12 text-ink-soft">desde</span>
                          <SelectorFecha etiqueta="Desde" valor={f.season.from} onChange={(v) => cambiar(i, { season: { ...f.season!, from: v } })} /></div>
                        <div className="flex items-center gap-2"><span className="w-12 text-ink-soft">hasta</span>
                          <SelectorFecha etiqueta="Hasta" valor={f.season.to} onChange={(v) => cambiar(i, { season: { ...f.season!, to: v } })} /></div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-semibold text-ink-soft">Rubros</p>
                    <SelectorRubros franja={f} rubros={rubros} onChange={(trades) => cambiar(i, { trades })} />
                  </div>
                  </div>
                </li>
              )
            })}
      </ul>

      {guardar.isSuccess && !guardar.isPending && <Nota tono="exito">Guardado.</Nota>}
      {sinRubros && <p className="text-sm text-alto">Hay una franja sin rubros elegidos.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => setFranjas((fs) => [...fs, NUEVA])}>
          <Plus aria-hidden />Agregar franja
        </Button>
        <Button type="button" disabled={guardar.isPending || sinRubros} onClick={() => guardar.mutate(franjas)}>
          {guardar.isPending ? 'Guardando…' : 'Guardar horarios'}
        </Button>
      </div>
    </section>
  )
}

/** Cómo ve la garita a los proveedores hoy, el próximo sábado y el próximo domingo (con lo ya guardado). */
export function HoyProveedores({ franjas, rubros }: { franjas: Franja[]; rubros: Rubro[] }) {
  const hoy = hoyISO()
  const proximo = (dow: number) => sumarDias(hoy, ((dow - diaDe(hoy) + 6) % 7) + 1)

  function lineas(iso: string): { quien: string; horas: string }[] {
    return franjas.filter((f) => temporadaRige(f.season, iso.slice(5)) && f.days.includes(diaDe(iso))).map((f) => ({
      quien: f.trades === null ? 'Todos los rubros' : f.trades.map((id) => rubros.find((r) => r.id === id)?.name ?? 'Rubro').join(', '),
      horas: `${horaCorta(f.from)} a ${horaCorta(f.to)}`,
    }))
  }
  const dias = [
    { titulo: null, iso: hoy },
    { titulo: `Sábado ${diaMes(proximo(6))}`, iso: proximo(6) },
    { titulo: `Domingo ${diaMes(proximo(0))}`, iso: proximo(0) },
  ]
  // La primera franja con temporada que arranca en los próximos 30 días.
  let desde: { mmdd: string; f: Franja } | null = null
  for (let i = 1; i <= 30 && !desde; i++) {
    const mmdd = sumarDias(hoy, i).slice(5)
    const f = franjas.find((x) => x.season?.from === mmdd)
    if (f) desde = { mmdd, f }
  }

  return (
    <aside className="rounded-md border border-line bg-card p-5" aria-labelledby="hoy-titulo">
      <h3 id="hoy-titulo" className="font-semibold">Hoy, {NOMBRES[diaDe(hoy)]} {diaMes(hoy)}</h3>
      <p className="text-sm text-ink-soft">Así ve la garita a los proveedores, con lo guardado.</p>
      <ul className="mt-3 flex flex-col gap-3 text-sm tabular">
        {dias.map(({ titulo, iso }) => {
          const ls = lineas(iso)
          return (
            <li key={iso} className="flex flex-col gap-0.5">
              {titulo && <span className="text-ink-soft">{titulo}</span>}
              {ls.length === 0 ? <b className="font-semibold text-ink-soft">Cerrado</b>
                : ls.map((l, j) => <span key={j} className="flex justify-between gap-3"><span>{l.quien}</span><b className="font-semibold">{l.horas}</b></span>)}
            </li>
          )
        })}
      </ul>
      {desde && (
        <p className="mt-3 text-sm text-ink-soft">
          Desde el {Number(desde.mmdd.slice(3))}/{Number(desde.mmdd.slice(0, 2))}: {textoHorario(desde.f)} · {desde.f.trades === null ? 'Todos los rubros' : desde.f.trades.map((id) => rubros.find((r) => r.id === id)?.name ?? 'Rubro').join(', ')}
        </p>
      )}
    </aside>
  )
}
