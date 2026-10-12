'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { MOTIVO, hora, type Movimiento } from '@/lib/gate'
import {
  useDeshacerMovimiento, useRegistrarEgreso, useRegistrarIngreso, useVeredicto,
} from '@/lib/queries/garita'
import { Input } from '@/components/ui/input'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'

/** Segundos que la confirmación espera antes de volver sola al escáner. */
const SEGUNDOS_CONFIRMACION = 8

/**
 * Lo que se registró, con un Deshacer al alcance. Vuelve sola al escáner
 * para que el camino común no sume ni un toque; "Siguiente" la saltea para
 * el que está despachando una fila.
 */
function Confirmacion({ movimiento, esEgreso, guestName, onListo, onDeshacer, deshaciendo }: {
  movimiento: Movimiento
  esEgreso: boolean
  guestName: string
  onListo: () => void
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  const [restan, setRestan] = useState(SEGUNDOS_CONFIRMACION)

  useEffect(() => {
    const t = setInterval(() => setRestan((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (restan <= 0) onListo() }, [restan, onListo])

  const cuando = esEgreso ? movimiento.exitedAt : movimiento.enteredAt

  return (
    <main aria-live="polite" className="flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden bg-pass-field p-6 text-pass-ink sm:p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Registrado</p>
        <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
          className="font-display mt-1 text-4xl font-extrabold tracking-[-0.02em] sm:text-6xl">
          {esEgreso ? 'EGRESO' : 'INGRESO'}
        </motion.h1>
        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{guestName}</p>
        {cuando && <p className="mt-1 text-xl tabular opacity-80 sm:text-2xl">a las {hora(cuando)}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <button onClick={onDeshacer} disabled={deshaciendo}
          className="min-h-16 rounded border-2 border-pass-ink/40 text-xl font-bold disabled:opacity-60">
          {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
        </button>
        <button onClick={onListo} className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field">
          Siguiente ({Math.max(0, restan)})
        </button>
      </div>
    </main>
  )
}

/**
 * El veredicto se come la pantalla entera: el guardia no está usando una
 * app, está leyendo un dato a dos metros con un auto esperando.
 *
 * Tres canales, ninguno de los cuales es el color: la palabra, el "sello" de
 * entrada y la luminancia del campo. INGRESO y EGRESO comparten el campo
 * claro porque los dos significan "abrí"; se distinguen por palabra, que es
 * una lectura de segundo orden y alcanza.
 */
export default function VeredictoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const q = useVeredicto(id)
  const ingresar = useRegistrarIngreso()
  const egresar = useRegistrarEgreso()
  const deshacerMov = useDeshacerMovimiento()
  const [idCargado, setIdCargado] = useState<string | null>(null)
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [hecho, setHecho] = useState<Movimiento | null>(null)
  const accionRef = useRef<HTMLButtonElement>(null)

  // Precarga de doc/patente al llegar el resultado: se ajusta durante el
  // render (patrón oficial de React para esto), no en un efecto — evita un
  // ciclo extra de render.
  if (q.data && q.data.invitation.id !== idCargado) {
    setIdCargado(q.data.invitation.id)
    setDoc(q.data.invitation.guestDoc ?? '')
    setPlate(q.data.invitation.plate ?? '')
  }

  const salir = () => router.push('/garita/escanear')

  // El foco cae en el botón de acción recién cuando deja de cargar: Enter
  // registra sin tocar el mouse.
  useEffect(() => {
    if (!q.isPending) accionRef.current?.focus()
  }, [q.isPending])

  // Escape siempre vuelve. En la barrera no hay tiempo de buscar un botón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') salir() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (q.isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-escaner-fondo text-escaner-texto">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </main>
    )
  }

  if (q.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface p-6">
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      </main>
    )
  }

  const resultado = q.data
  const { invitation: inv, check, adentro } = resultado
  // Un egreso no se valida: si está adentro, sale. `check` es del ingreso.
  const esEgreso = Boolean(adentro)
  const ok = esEgreso || check.ok

  async function registrar() {
    try {
      const mov = esEgreso
        ? await egresar.mutateAsync(inv.id)
        : await ingresar.mutateAsync({
          invitationId: inv.id, guestName: inv.guestName,
          guestDoc: doc || undefined, plate: plate || undefined,
        })
      // No sale: pasa a la confirmación, que es donde vive el Deshacer.
      setHecho(mov)
    } catch {
      // El toast de error ya lo muestra la mutación.
    }
  }

  if (hecho) {
    return (
      <Confirmacion movimiento={hecho} esEgreso={esEgreso} guestName={inv.guestName}
        onListo={salir}
        onDeshacer={() => deshacerMov.mutate(hecho.id, { onSuccess: salir })}
        deshaciendo={deshacerMov.isPending} />
    )
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'
  const palabra = esEgreso ? 'EGRESO' : ok ? 'INGRESO' : 'NO PASA'
  const registrando = ingresar.isPending || egresar.isPending

  return (
    <main aria-live="assertive"
      className={`flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden p-6 sm:p-8 ${
        ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
      }`}>
      <div>
        <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
          className="font-display text-5xl font-extrabold tracking-[-0.02em] sm:text-7xl">
          {palabra}
        </motion.h1>

        {!ok && (
          <p className="mt-3 text-2xl font-semibold sm:text-3xl">
            {motivo}
            {sinCupo && resultado.lastEntryAt && (
              <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
            )}
          </p>
        )}

        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{inv.guestName}</p>
        <p className="mt-1 text-xl tabular opacity-80 sm:text-2xl">
          {inv.unitLabel}
          {inv.capacity > 1 && ` · ${resultado.usedCount} de ${inv.capacity} entraron`}
        </p>

        {adentro && (
          <p className="mt-2 text-xl font-semibold tabular sm:text-2xl">entró a las {hora(adentro.enteredAt)}</p>
        )}
      </div>

      {ok ? (
        <div className="flex flex-col gap-3">
          {/* Los datos se cargan al entrar, no al salir: a la salida ya están. */}
          {!esEgreso && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Documento
                <Input value={doc} onChange={(e) => setDoc(e.target.value)} className="tabular h-14 text-xl" />
              </label>
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Patente
                <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="tabular h-14 text-xl uppercase" />
              </label>
            </div>
          )}
          {/* Nadie entra sin documento: si la invitación no lo traía, se carga acá. */}
          {!esEgreso && !doc.trim() && (
            <p className="text-sm font-semibold opacity-80">Hace falta el documento para registrar el ingreso.</p>
          )}
          <button ref={accionRef} onClick={registrar} disabled={registrando || (!esEgreso && !doc.trim())}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
          </button>
          <button onClick={salir} className="underline underline-offset-4 opacity-70">
            Cancelar (Esc)
          </button>
        </div>
      ) : (
        <button ref={accionRef} onClick={salir}
          className="min-h-16 rounded border-2 border-deny-ink/40 text-xl font-bold">
          Volver (Esc)
        </button>
      )}
    </main>
  )
}
