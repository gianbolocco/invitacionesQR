'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { MOTIVO, hora, type Resultado } from '@/lib/gate'

/**
 * El veredicto se come la pantalla entera: el guardia no está usando una app,
 * está leyendo un dato a dos metros con un auto esperando.
 *
 * Tres canales, ninguno de los cuales es el color: la palabra, el ícono y la
 * luminancia del campo. Funciona en escala de grises y con daltonismo.
 */
export function Verdict({ resultado, guardId, onSalir }: {
  resultado: Resultado
  guardId: string
  onSalir: () => void
}) {
  const { invitation: inv, check } = resultado
  const ok = check.ok
  const [doc, setDoc] = useState(inv.guestDoc ?? '')
  const [plate, setPlate] = useState(inv.plate ?? '')
  const [busy, setBusy] = useState(false)
  const accionRef = useRef<HTMLButtonElement>(null)

  // El foco cae en el botón: Enter registra sin tocar el mouse.
  useEffect(() => { accionRef.current?.focus() }, [])

  // Escape siempre vuelve. En la barrera no hay tiempo de buscar un botón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSalir() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSalir])

  async function registrar() {
    setBusy(true)
    await api('/gate/entries', {
      method: 'POST',
      body: JSON.stringify({
        invitationId: inv.id,
        guardId: guardId || null,
        guestName: inv.guestName,
        guestDoc: doc || undefined,
        plate: plate || undefined,
      }),
    }).catch(() => {})
    onSalir()
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'

  return (
    <main
      aria-live="assertive"
      className={`flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden p-6 sm:p-8 ${
        ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
      }`}
    >
      <div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-5xl leading-none sm:text-6xl">{ok ? '✓' : '✕'}</span>
          <h1 className="display text-5xl sm:text-7xl">{ok ? 'PASA' : 'NO PASA'}</h1>
        </div>

        {!ok && (
          <p className="mt-3 text-2xl font-semibold sm:text-3xl">
            {motivo}
            {sinCupo && resultado.lastEntryAt && (
              <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
            )}
          </p>
        )}

        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{inv.guestName}</p>
        <p className="mt-1 text-xl opacity-80 tabular sm:text-2xl">
          {inv.unitLabel}
          {inv.capacity > 1 && ` · ${resultado.usedCount} de ${inv.capacity} entraron`}
        </p>
      </div>

      {ok ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1 font-semibold">
              Documento
              <input value={doc} onChange={(e) => setDoc(e.target.value)}
                className="tabular min-h-14 w-full rounded border-2 border-pass-ink/25 bg-white px-3 text-xl" />
            </label>
            <label className="flex flex-1 flex-col gap-1 font-semibold">
              Patente
              <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="tabular min-h-14 w-full rounded border-2 border-pass-ink/25 bg-white px-3 text-xl" />
            </label>
          </div>
          <button ref={accionRef} onClick={registrar} disabled={busy}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {busy ? 'Registrando…' : 'Registrar ingreso'}
          </button>
          <button onClick={onSalir} className="underline underline-offset-4 opacity-70">
            Cancelar (Esc)
          </button>
        </div>
      ) : (
        <button ref={accionRef} onClick={onSalir}
          className="min-h-16 rounded border-2 border-deny-ink/40 text-xl font-bold">
          Volver (Esc)
        </button>
      )}
    </main>
  )
}
