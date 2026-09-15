'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { hoyISO } from '@/lib/invitations'

export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  joinedCount: number
  enteredCount: number
  lastEntryAt: string | null
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

function Fila({ r, borde, tenue, onAbrir }: {
  r: AgendaRow
  borde: string
  tenue?: boolean
  onAbrir: (id: string) => void
}) {
  return (
    <li>
      <button onClick={() => onAbrir(r.id)}
        className={`w-full rounded border ${borde} px-4 py-3 text-left ${tenue ? 'opacity-60' : ''}`}>
        <span className="block text-lg font-semibold">{r.guestName}</span>
        <span className="block text-sm opacity-75 tabular">
          {r.unitLabel} · invita {r.inviterName}
          {r.plate && ` · ${r.plate}`}
          {r.kind === 'evento' && ` · ${r.joinedCount} anotados de ${r.capacity}`}
          {r.kind === 'evento' && r.enteredCount > 0 && ` · ${r.enteredCount} entraron`}
          {r.kind !== 'evento' && r.lastEntryAt && ` · ${hora(r.lastEntryAt)}`}
        </span>
      </button>
    </li>
  )
}

function Seccion({ label, rows, borde, tenue, onAbrir }: {
  label: string
  rows: AgendaRow[]
  borde: string
  tenue?: boolean
  onAbrir: (id: string) => void
}) {
  if (!rows.length) return null
  return (
    <section className="flex flex-col gap-2">
      <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>
        {label} ({rows.length})
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => <Fila key={r.id} r={r} borde={borde} tenue={tenue} onAbrir={onAbrir} />)}
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
 * Los eventos van como una fila con su cupo, no desplegados: un cumpleaños de
 * 30 anotados taparía las tres visitas que importan. Los frecuentes van aparte
 * y colapsados, porque aparecen todos los días y el guardia deja de leerlos.
 */
export function Agenda({ oscuro, onAbrir }: {
  oscuro: boolean
  onAbrir: (id: string) => void
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [filas, setFilas] = useState<AgendaRow[] | null>(null)
  const [verFrecuentes, setVerFrecuentes] = useState(false)

  const cargar = useCallback(() => {
    api<AgendaRow[]>(`/gate/agenda?date=${fecha}`).then(setFilas).catch(() => setFilas([]))
  }, [fecha])

  useEffect(cargar, [cargar])

  const todas = filas ?? []
  const eventos = todas.filter((r) => r.kind === 'evento')
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const puntuales = todas.filter((r) => r.kind === 'visita' || r.kind === 'proveedor')
  const esperando = puntuales.filter((r) => r.enteredCount === 0)
  const entraron = puntuales.filter((r) => r.enteredCount > 0)

  const borde = oscuro ? 'border-current/20' : 'border-ink/12'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFecha(corrido(-1))}
          className={`min-h-11 rounded border ${borde} px-3 text-sm`}>‹ Ayer</button>
        <button onClick={() => setFecha(hoyISO())}
          className={`min-h-11 rounded border ${borde} px-4 text-sm font-semibold`}>Hoy</button>
        <button onClick={() => setFecha(corrido(1))}
          className={`min-h-11 rounded border ${borde} px-3 text-sm`}>Mañana ›</button>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoyISO())}
          aria-label="Otra fecha"
          className={`tabular min-h-11 rounded border ${borde} bg-white px-3 text-sm text-ink`} />
      </div>

      <h2 className="display text-2xl capitalize">{titulo(fecha)}</h2>

      {filas === null && <p className="opacity-70">Cargando…</p>}
      {filas !== null && todas.length === 0 && (
        <p className="opacity-70">Nadie tiene autorización para este día.</p>
      )}

      <Seccion label="Esperando" rows={esperando} borde={borde} onAbrir={onAbrir} />
      <Seccion label="Eventos" rows={eventos} borde={borde} onAbrir={onAbrir} />
      <Seccion label="Ya entraron" rows={entraron} borde={borde} tenue onAbrir={onAbrir} />

      {frecuentes.length > 0 && (
        <section className="flex flex-col gap-2">
          <button onClick={() => setVerFrecuentes((v) => !v)}
            className="self-start text-sm underline underline-offset-4">
            {verFrecuentes ? 'Ocultar' : 'Mostrar'} frecuentes habilitados ({frecuentes.length})
          </button>
          {verFrecuentes && (
            <ul className="flex flex-col gap-2">
              {frecuentes.map((r) => (
                <Fila key={r.id} r={r} borde={borde} onAbrir={onAbrir} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
