'use client'
import { useEffect, useState } from 'react'
import { anotadosDe, hora, type EventGuest } from '@/lib/gate'

function Grupo({ label, rows, tenue, onAbrir }: {
  label: string
  rows: EventGuest[]
  tenue?: boolean
  onAbrir: (id: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>
        {label} ({rows.length})
      </p>
      <ul className="escalonar flex flex-col gap-2">
        {rows.map((g) => (
          <li key={g.id}>
            <button onClick={() => onAbrir(g.id)}
              className={`w-full rounded border border-line px-4 py-3 text-left
                ${tenue ? 'opacity-60' : ''}`}>
              <span className="block text-lg font-semibold">{g.guestName}</span>
              <span className="block text-sm opacity-75 tabular">
                {g.guestDoc ?? 'Sin documento'}
                {g.plate && ` · ${g.plate}`}
                {g.revokedAt && ' · anulado'}
                {g.lastEntryAt && ` · ${hora(g.lastEntryAt)}`}
                {g.enteredCount > 1 && ` ×${g.enteredCount}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Los anotados a un evento, en la garita.
 *
 * Tocar un evento en la agenda llevaba derecho a registrar un ingreso contra el
 * evento entero: un cumpleaños de treinta terminaba como treinta ingresos
 * anónimos contra la misma invitación. Acá el guardia elige a la persona que
 * tiene adelante y de ahí sale el ingreso con nombre y apellido.
 *
 * Quien todavía no entró va primero y en grande: es a quien el guardia está
 * buscando. Los que ya entraron quedan abajo, tenues, con la hora.
 */
export function EventGuests({ eventoId, onAbrir }: {
  eventoId: string
  onAbrir: (id: string) => void
}) {
  const [filas, setFilas] = useState<EventGuest[] | null>(null)

  useEffect(() => {
    anotadosDe(eventoId).then(setFilas).catch(() => setFilas([]))
  }, [eventoId])

  if (filas === null) return <p className="opacity-70">Cargando…</p>
  if (filas.length === 0) {
    return <p className="opacity-70">Todavía no se anotó nadie a este evento.</p>
  }

  const esperando = filas.filter((g) => !g.revokedAt && g.enteredCount === 0)
  const entraron = filas.filter((g) => !g.revokedAt && g.enteredCount > 0)
  const anulados = filas.filter((g) => g.revokedAt)

  return (
    <div className="flex flex-col gap-5">
      <Grupo label="Esperando" rows={esperando} onAbrir={onAbrir} />
      <Grupo label="Ya entraron" rows={entraron} tenue onAbrir={onAbrir} />
      {/* Los anulados se muestran igual: si alguien llega con un QR que le
          anularon, el guardia necesita ver que existe y que no puede pasar. */}
      <Grupo label="Anulados" rows={anulados} tenue onAbrir={onAbrir} />
    </div>
  )
}
