'use client'
import { useEffect, useRef, useState } from 'react'
import {
  MOTIVO, hora, registrarIngreso, registrarEgreso, deshacer,
  type Movimiento, type Resultado,
} from '@/lib/gate'

/** Segundos que la confirmación espera antes de volver sola al escáner. */
const SEGUNDOS_CONFIRMACION = 8

/**
 * Lo que se registró, con un Deshacer al alcance.
 *
 * Vuelve sola al escáner para que el camino común no sume ni un toque respecto
 * de antes, y "Siguiente" la saltea para el que está despachando una fila. El
 * Deshacer está acá y no en un menú porque el momento en que el guardia nota el
 * escaneo doble es justo este.
 */
function Confirmacion({ movimiento, esEgreso, guestName, onListo }: {
  movimiento: Movimiento
  esEgreso: boolean
  guestName: string
  onListo: () => void
}) {
  const [restan, setRestan] = useState(SEGUNDOS_CONFIRMACION)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setRestan((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (restan <= 0) onListo()
  }, [restan, onListo])

  const cuando = esEgreso ? movimiento.exitedAt : movimiento.enteredAt

  async function revertir() {
    setDeshaciendo(true)
    setError(null)
    try {
      await deshacer(movimiento.id)
      onListo()
    } catch {
      setError('No se pudo deshacer. Revisalo en la auditoría.')
      setDeshaciendo(false)
    }
  }

  return (
    <main aria-live="polite"
      className="flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden
        bg-pass-field p-6 text-pass-ink sm:p-8">
      <div>
        <p className="eyebrow">Registrado</p>
        <h1 className="sello display mt-1 text-4xl sm:text-6xl">
          {esEgreso ? 'EGRESO' : 'INGRESO'}
        </h1>
        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{guestName}</p>
        {cuando && (
          <p className="mt-1 text-xl opacity-80 tabular sm:text-2xl">a las {hora(cuando)}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {error && <p role="alert" className="text-xl font-semibold">{error}</p>}
        <button onClick={revertir} disabled={deshaciendo}
          className="min-h-16 rounded border-2 border-pass-ink/40 text-xl font-bold
            disabled:opacity-60">
          {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
        </button>
        <button onClick={onListo}
          className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field">
          Siguiente ({Math.max(0, restan)})
        </button>
      </div>
    </main>
  )
}

/**
 * El veredicto se come la pantalla entera: el guardia no está usando una app,
 * está leyendo un dato a dos metros con un auto esperando.
 *
 * Tres canales, ninguno de los cuales es el color: la palabra, el ícono y la
 * luminancia del campo.
 *
 * La luminancia codifica lo único que se lee en un segundo, ¿abro o no abro?.
 * INGRESO y EGRESO comparten el campo claro porque los dos significan "abrí", y
 * se distinguen por palabra y flecha, que es una lectura de segundo orden y
 * alcanza. Poner el egreso en campo oscuro chocaría con el rechazo justo en el
 * canal más rápido.
 */
export function Verdict({ resultado, onSalir }: {
  resultado: Resultado
  onSalir: () => void
}) {
  const { invitation: inv, check, adentro } = resultado
  // Un egreso no se valida: si está adentro, sale. `check` es del ingreso.
  const esEgreso = Boolean(adentro)
  const ok = esEgreso || check.ok

  const [doc, setDoc] = useState(inv.guestDoc ?? '')
  const [plate, setPlate] = useState(inv.plate ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Movimiento | null>(null)
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
    setError(null)
    try {
      const mov = esEgreso
        ? await registrarEgreso(inv.id)
        : await registrarIngreso({
          invitationId: inv.id,
          guestName: inv.guestName,
          guestDoc: doc || undefined,
          plate: plate || undefined,
        })
      // No sale: pasa a la confirmación, que es donde vive el Deshacer.
      setHecho(mov)
      setBusy(false)
    } catch {
      setError('No se pudo registrar. Probá de nuevo.')
      setBusy(false)
    }
  }

  if (hecho) {
    return (
      <Confirmacion
        movimiento={hecho}
        esEgreso={esEgreso}
        guestName={inv.guestName}
        onListo={onSalir}
      />
    )
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'
  const palabra = esEgreso ? 'EGRESO' : ok ? 'INGRESO' : 'NO PASA'
  const icono = esEgreso ? '←' : ok ? '→' : '✕'

  return (
    <main
      aria-live="assertive"
      className={`flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden p-6 sm:p-8 ${
        ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
      }`}
    >
      <div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="sello text-5xl leading-none sm:text-6xl">{icono}</span>
          <h1 className="sello display text-5xl sm:text-7xl">{palabra}</h1>
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

        {/* El dato con el que el guardia confirma que es la persona que se va. */}
        {adentro && (
          <p className="mt-2 text-xl font-semibold tabular sm:text-2xl">
            entró a las {hora(adentro.enteredAt)}
          </p>
        )}
      </div>

      {ok ? (
        <div className="flex flex-col gap-3">
          {/* Los datos se cargan al entrar, no al salir: a la salida ya están. */}
          {!esEgreso && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Documento
                <input value={doc} onChange={(e) => setDoc(e.target.value)}
                  className="tabular min-h-14 w-full rounded border-2 border-pass-ink/25 bg-card px-3 text-xl" />
              </label>
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Patente
                <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="tabular min-h-14 w-full rounded border-2 border-pass-ink/25 bg-card px-3 text-xl" />
              </label>
            </div>
          )}
          {error && <p role="alert" className="text-xl font-semibold">{error}</p>}
          <button ref={accionRef} onClick={registrar} disabled={busy}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {busy ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
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
