'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { hoyISO } from '@/lib/invitations'
import { Estado } from './ui'

export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  enteredCount: number
  lastEntryAt: string | null
  lastExitAt: string | null
  adentro: boolean
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function corrido(dias: number): string {
  const d = new Date(`${hoyISO()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function titulo(fecha: string): string {
  if (fecha === hoyISO()) return 'Hoy'
  if (fecha === corrido(1)) return 'Mañana'
  if (fecha === corrido(-1)) return 'Ayer'
  const [y, m, d] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(y, m - 1, d))
}

function Fila({ r, tenue, onAbrir }: {
  r: AgendaRow
  tenue?: boolean
  onAbrir: (r: AgendaRow) => void
}) {
  /*
   * `adentro` se pregunta PRIMERO, antes que enteredCount. Alguien que entró
   * ayer y nadie le registró la salida tiene enteredCount 0 para hoy pero
   * sigue adentro: preguntando al revés aparecería como "Esperando".
   */
  const estado = r.adentro ? 'adentro' : r.enteredCount === 0 ? 'esperando' : 'salio'
  const detalle = estado === 'adentro'
    ? (r.lastEntryAt ? hora(r.lastEntryAt) : undefined)
    : estado === 'salio'
      ? (r.lastExitAt ? hora(r.lastExitAt) : undefined)
      : undefined

  return (
    <li>
      {/* El atenuado va en el texto y no en la fila entera: el chip de estado
          es justamente lo que tiene que seguir saltando a la vista. */}
      <button onClick={() => onAbrir(r)}
        className="flex w-full items-start justify-between gap-3 rounded border border-line
          px-4 py-3 text-left">
        <span className={`min-w-0 ${tenue ? 'opacity-60' : ''}`}>
          <span className="block text-lg font-semibold">{r.guestName}</span>
          <span className="block text-sm opacity-75 tabular">
            {r.unitLabel} · invita {r.inviterName}
            {r.plate && ` · ${r.plate}`}
            {r.capacity > 1 && r.enteredCount > 1 && ` · ${r.enteredCount} ingresos hoy`}
          </span>
        </span>

        <Estado estado={estado} detalle={detalle} />
      </button>
    </li>
  )
}

function Seccion({ label, rows, tenue, onAbrir }: {
  label: string
  rows: AgendaRow[]
  tenue?: boolean
  onAbrir: (r: AgendaRow) => void
}) {
  if (!rows.length) return null
  return (
    <section className="flex flex-col gap-2">
      <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>
        {label} ({rows.length})
      </p>
      <ul className="escalonar flex flex-col gap-2">
        {rows.map((r) => <Fila key={r.id} r={r} tenue={tenue} onAbrir={onAbrir} />)}
      </ul>
    </section>
  )
}

/**
 * La agenda del día, en el panel en reposo de la garita.
 *
 * La división principal es esperando / ya entraron, no alfabética: es la
 * pregunta que el guardia tiene a las 21, ¿quién falta?
 *
 * Los frecuentes van aparte y colapsados, porque aparecen todos los días y el
 * guardia deja de leerlos.
 */
export function Agenda({ onAbrir }: { onAbrir: (r: AgendaRow) => void }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [filas, setFilas] = useState<AgendaRow[] | null>(null)
  const [verFrecuentes, setVerFrecuentes] = useState(false)

  const cargar = useCallback(() => {
    api<AgendaRow[]>(`/gate/agenda?date=${fecha}`).then(setFilas).catch(() => setFilas([]))
  }, [fecha])

  useEffect(cargar, [cargar])

  const todas = filas ?? []
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const personas = todas.filter((r) => r.kind !== 'frecuente')
  const esperando = personas.filter((r) => r.enteredCount === 0)
  const entraron = personas.filter((r) => r.enteredCount > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFecha(corrido(-1))}
          className="min-h-11 rounded border border-line px-3 text-sm">‹ Ayer</button>
        <button onClick={() => setFecha(hoyISO())}
          className="min-h-11 rounded border border-line px-4 text-sm font-semibold">Hoy</button>
        <button onClick={() => setFecha(corrido(1))}
          className="min-h-11 rounded border border-line px-3 text-sm">Mañana ›</button>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoyISO())}
          aria-label="Otra fecha"
          className="tabular min-h-11 rounded border border-line bg-card px-3 text-sm text-ink" />
      </div>

      <h2 className="display text-2xl capitalize">{titulo(fecha)}</h2>

      {filas === null && <p className="opacity-70">Cargando…</p>}
      {filas !== null && todas.length === 0 && (
        <p className="opacity-70">Nadie tiene autorización para este día.</p>
      )}

      <Seccion label="Esperando" rows={esperando} onAbrir={onAbrir} />
      <Seccion label="Ya entraron" rows={entraron} tenue onAbrir={onAbrir} />

      {frecuentes.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setVerFrecuentes((v) => !v)}
            className="self-start text-sm underline underline-offset-4">
            {verFrecuentes ? 'Ocultar' : 'Mostrar'} frecuentes habilitados ({frecuentes.length})
          </button>
          {verFrecuentes && (
            <ul className="flex flex-col gap-2">
              {frecuentes.map((r) => (
                <Fila key={r.id} r={r} onAbrir={onAbrir} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
