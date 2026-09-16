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
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  parentId: string | null
  eventName: string | null
  unitLabel: string
  inviterName: string
  capacity: number
  joinedCount: number
  enteredCount: number
  lastEntryAt: string | null
}

/** El paraguas de un evento, no una persona: tiene anotados y no entra solo. */
export function esParaguas(r: AgendaRow): boolean {
  return r.kind === 'evento' && !r.parentId
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
  const paraguas = esParaguas(r)
  const adentro = !paraguas && r.enteredCount > 0

  return (
    <li>
      {/* El atenuado va en el texto y no en la fila entera: el chip de estado
          es justamente lo que tiene que seguir saltando a la vista. */}
      <button onClick={() => onAbrir(r)}
        className="flex w-full items-start justify-between gap-3 rounded border border-line
          px-4 py-3 text-left">
        <span className={`min-w-0 ${tenue ? 'opacity-60' : ''}`}>
          <span className="block text-lg font-semibold">{r.guestName}</span>
          {/* El evento va como contexto de la persona, no como su nombre: el
              guardia está buscando a quien tiene adelante. */}
          {r.eventName && (
            <span className="block text-sm font-semibold opacity-90">en {r.eventName}</span>
          )}
          <span className="block text-sm opacity-75 tabular">
            {r.unitLabel} · invita {r.inviterName}
            {r.plate && ` · ${r.plate}`}
            {paraguas && ` · ${r.joinedCount} anotados de ${r.capacity}`}
            {paraguas && r.enteredCount > 0 && ` · ${r.enteredCount} entraron`}
          </span>
          {paraguas && (
            <span className="mt-1 block text-sm font-semibold opacity-90">
              Ver quién se anotó ›
            </span>
          )}
        </span>

        {!paraguas && (
          <Estado estado={adentro ? 'adentro' : 'esperando'}
            detalle={adentro && r.lastEntryAt ? hora(r.lastEntryAt) : undefined} />
        )}
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
 * Los anotados a un evento van en esas mismas listas, cada uno con su evento al
 * lado. Un evento no es una invitación: es un paraguas sobre las invitaciones
 * de los que se anotaron, y cada uno entra por su cuenta con su propio código.
 * El paraguas sigue apareciendo aparte, para ver el cupo y abrir solo esa
 * lista, pero la persona que el guardia tiene adelante está donde la busca.
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
  const eventos = todas.filter(esParaguas)
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const personas = todas.filter((r) => !esParaguas(r) && r.kind !== 'frecuente')
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
      <Seccion label="Eventos" rows={eventos} onAbrir={onAbrir} />
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
