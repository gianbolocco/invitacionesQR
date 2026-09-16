'use client'
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { porId, type Hit, type Resultado } from '@/lib/gate'
import { Shell } from '@/components/shell'
import { Agenda, esParaguas, type AgendaRow } from '@/components/agenda'
import { EventGuests } from '@/components/event-guests'
import { Verdict } from '@/components/verdict'

export default function GaritaHome() {
  const me = useMe()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [evento, setEvento] = useState<AgendaRow | null>(null)

  const abrir = useCallback(async (id: string) => {
    const r = await porId(id).catch(() => null)
    if (r) setResultado(r)
  }, [])

  /*
   * El paraguas de un evento no se despacha de un toque: adentro está la lista
   * de anotados. Un anotado, en cambio, es una invitación como cualquier otra y
   * abre su veredicto derecho — que es como aparece ahora en la lista del día.
   */
  const abrirFila = useCallback((r: AgendaRow) => {
    if (esParaguas(r)) setEvento(r)
    else abrir(r.id)
  }, [abrir])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) { setHits(null); return }
    setHits(await api<Hit[]>(`/gate/search?q=${encodeURIComponent(query)}`).catch(() => []))
  }

  function volver() {
    setResultado(null)
    setQuery('')
    setHits(null)
  }

  if (!me) return <main className="p-6">Cargando…</main>

  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>Esta pantalla es de la garita.</p></main>
  }

  if (resultado) {
    // Tras registrar a un anotado, vuelve a la lista del evento: en un
    // cumpleaños entran de a varios seguidos.
    return <Verdict resultado={resultado} onSalir={evento ? () => setResultado(null) : volver} />
  }

  if (evento) {
    return (
      <Shell me={me} atras={{ label: 'Hoy', onClick: () => setEvento(null) }}>
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="display text-2xl">{evento.guestName}</h1>
            <p className="text-sm opacity-75 tabular">
              {evento.unitLabel} · invita {evento.inviterName}
              {` · ${evento.joinedCount} anotados de ${evento.capacity}`}
            </p>
          </div>
          <EventGuests eventoId={evento.id} onAbrir={abrir} />
        </div>
      </Shell>
    )
  }


  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        {/* El botón es lo primero y lo más grande: es la acción del turno. */}
        <Link href="/garita/escanear"
          className="flex min-h-20 items-center justify-center gap-3 rounded bg-alamo
            text-2xl font-bold text-surface">
          <span aria-hidden className="text-3xl">⛶</span>
          Escanear QR
        </Link>

        <form onSubmit={buscar} className="flex flex-col gap-2">
          <label htmlFor="q" className="font-semibold">Buscar</label>
          <div className="flex gap-2">
            <input id="q" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Apellido, unidad o patente"
              className="min-h-14 min-w-0 flex-1 rounded border border-line bg-card px-3 text-lg text-ink" />
            <button className="min-h-14 shrink-0 rounded bg-alamo px-5 font-semibold text-surface">
              Buscar
            </button>
          </div>
        </form>

        {hits !== null && hits.length === 0 && (
          <p className="opacity-70">Sin resultados. Probá con el apellido o la unidad.</p>
        )}

        {hits && hits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button onClick={() => abrir(h.id)}
                  className="min-h-16 w-full rounded border border-line px-4 text-left text-lg">
                  <span className="font-semibold">{h.guestName}</span>
                  <span className="opacity-70 tabular"> · {h.unitLabel}{h.plate && ` · ${h.plate}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {hits === null && <Agenda onAbrir={abrirFila} />}
      </div>
    </Shell>
  )
}
