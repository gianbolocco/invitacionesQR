'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import { MOTIVO, hora, type Movimiento } from '@/lib/gate'
import {
  useDeshacerMovimiento, useRegistrarEgreso, useRegistrarIngreso, useVeredicto,
} from '@/lib/queries/garita'
import { Input } from '@/components/ui/input'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'

/** Segundos que la confirmación espera antes de volver sola a la pantalla anterior. */
const SEGUNDOS_CONFIRMACION = 8

const SALIDA = [0.2, 0.8, 0.2, 1] as const

/**
 * Lo que queda en la zona de acción una vez registrado: Deshacer a mano y
 * un Siguiente que vuelve solo al escáner, para que el camino común no sume
 * ni un toque.
 */
function AccionesRegistrado({ onListo, onDeshacer, deshaciendo }: {
  onListo: () => void
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  const [restan, setRestan] = useState(SEGUNDOS_CONFIRMACION)
  const siguienteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    siguienteRef.current?.focus()
    const t = setInterval(() => setRestan((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (restan <= 0) onListo() }, [restan, onListo])

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="flex items-center gap-2 text-lg font-semibold">
        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26, delay: 0.08 }}
          className="grid size-7 place-items-center rounded-full bg-pass-ink text-pass-field">
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </motion.span>
        Registrado
      </p>
      <button ref={siguienteRef} onClick={onListo}
        className="relative min-h-16 overflow-hidden rounded bg-pass-ink text-xl font-bold text-pass-field">
        {/* La barra que se vacía dice lo mismo que el número, sin tener que leerlo. */}
        <motion.span aria-hidden initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
          transition={{ duration: SEGUNDOS_CONFIRMACION, ease: 'linear' }}
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-pass-field/40" />
        <span className="tabular">Siguiente ({Math.max(0, restan)})</span>
      </button>
      <button onClick={onDeshacer} disabled={deshaciendo}
        className="min-h-14 rounded border-2 border-pass-ink/30 text-lg font-bold disabled:opacity-60">
        {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
      </button>
    </div>
  )
}

/**
 * El veredicto se come la pantalla entera: el guardia no está usando una
 * app, está leyendo un dato a dos metros con un auto esperando.
 *
 * Tres canales, ninguno de los cuales es el color: la palabra, el "sello" de
 * entrada y la luminancia del campo. INGRESO y EGRESO comparten el campo
 * claro porque los dos significan "abrí"; se distinguen por palabra.
 *
 * Es UNA pantalla: al registrar, la palabra, el nombre y el fondo se quedan
 * quietos y solo muda la zona de acción de abajo.
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
  // Todo lo que se muestra después de registrar sale de `hecho`, no del
  // veredicto: la mutación lo invalida al terminar y `adentro` pasa a decir
  // lo contrario de lo que se acaba de registrar.
  const [hecho, setHecho] = useState<{ movimiento: Movimiento; esEgreso: boolean } | null>(null)
  const accionRef = useRef<HTMLButtonElement>(null)

  // Precarga de doc/patente al llegar el resultado: se ajusta durante el
  // render (patrón oficial de React para esto), no en un efecto.
  if (q.data && q.data.invitation.id !== idCargado) {
    setIdCargado(q.data.invitation.id)
    setDoc(q.data.invitation.guestDoc ?? '')
    setPlate(q.data.invitation.plate ?? '')
  }

  // Vuelve a donde estaba: el escáner, la búsqueda, la agenda o el alta
  // exprés. Una sola vez: el contador, Deshacer y Escape pueden coincidir, y
  // dos back() seguidos retrocederían dos pantallas. Abierto directo (link o
  // pestaña nueva) no hay a dónde volver, y va a la garita.
  const saliendo = useRef(false)
  function salir() {
    if (saliendo.current) return
    saliendo.current = true
    if (window.history.length > 1) router.back()
    else router.push('/garita')
  }

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
  const esEgreso = hecho ? hecho.esEgreso : Boolean(adentro)
  const ok = Boolean(hecho) || esEgreso || check.ok

  async function registrar() {
    try {
      const mov = esEgreso
        ? await egresar.mutateAsync(inv.id)
        : await ingresar.mutateAsync({
          invitationId: inv.id, guestName: inv.guestName,
          guestDoc: doc || undefined, plate: plate || undefined,
        })
      setHecho({ movimiento: mov, esEgreso })
    } catch {
      // El toast de error ya lo muestra la mutación.
    }
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'
  const palabra = esEgreso ? 'EGRESO' : ok ? 'INGRESO' : 'NO PASA'
  const registrando = ingresar.isPending || egresar.isPending

  // La línea de detalle se completa, no se reescribe: el ingreso que ya
  // estaba queda, y la hora nueva se suma al lado.
  const entro = hecho ? hecho.movimiento.enteredAt : adentro?.enteredAt
  const salio = hecho?.esEgreso ? hecho.movimiento.exitedAt : null

  return (
    <main aria-live="assertive"
      className={`flex min-h-dvh flex-col justify-between gap-8 overflow-x-hidden p-6 sm:p-10 ${
        ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
      }`}>
      <div className="mx-auto w-full max-w-2xl">
        <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
          className="font-display origin-left text-6xl font-extrabold leading-[0.9] tracking-[-0.035em] sm:text-8xl">
          {palabra}
        </motion.h1>

        {!ok && (
          <p className="mt-4 text-2xl font-semibold sm:text-3xl">
            {motivo}
            {sinCupo && resultado.lastEntryAt && (
              <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
            )}
          </p>
        )}

        <div className={`mt-8 border-t pt-5 ${ok ? 'border-pass-ink/15' : 'border-deny-ink/20'}`}>
          <p className="break-words text-3xl font-semibold leading-tight sm:text-4xl">{inv.guestName}</p>
          <p className="mt-1 text-xl tabular opacity-75 sm:text-2xl">
            {inv.unitLabel}
            {inv.capacity > 1 && ` · ${resultado.usedCount} de ${inv.capacity} entraron`}
          </p>
          {(entro || salio) && (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tabular sm:text-2xl">
              {entro && (
                <motion.span key={`e-${entro}`} initial={hecho && !hecho.esEgreso ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: SALIDA }}>
                  Entró {hora(entro)}
                </motion.span>
              )}
              {salio && (
                <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: SALIDA }}>
                  · Salió {hora(salio)}
                </motion.span>
              )}
            </p>
          )}
        </div>
      </div>

      <motion.div layout transition={{ duration: 0.32, ease: SALIDA }} className="mx-auto w-full max-w-2xl">
        <AnimatePresence mode="popLayout" initial={false}>
          {hecho ? (
            <motion.div key="registrado" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: SALIDA }}>
              <AccionesRegistrado onListo={salir}
                onDeshacer={() => deshacerMov.mutate(hecho.movimiento.id, { onSuccess: salir })}
                deshaciendo={deshacerMov.isPending} />
            </motion.div>
          ) : ok ? (
            <motion.div key="pendiente" exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
              className="flex flex-col gap-3">
              {/* Los datos se cargan al entrar, no al salir: a la salida ya están. */}
              {!esEgreso && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex flex-1 flex-col gap-1.5 font-semibold">
                    Documento
                    <Input value={doc} onChange={(e) => setDoc(e.target.value)}
                      className="tabular h-14 border-pass-ink/20 bg-white/70 text-xl" />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5 font-semibold">
                    Patente
                    <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                      className="tabular h-14 border-pass-ink/20 bg-white/70 text-xl uppercase" />
                  </label>
                </div>
              )}
              {/* Nadie entra sin documento: si la invitación no lo traía, se carga acá. */}
              {!esEgreso && !doc.trim() && (
                <p className="text-sm font-semibold opacity-75">Hace falta el documento para registrar el ingreso.</p>
              )}
              <button ref={accionRef} onClick={registrar} disabled={registrando || (!esEgreso && !doc.trim())}
                className="flex min-h-16 items-center justify-center gap-2 rounded bg-pass-ink text-xl font-bold text-pass-field transition-colors disabled:bg-pass-ink/40">
                {registrando && <Loader2 className="size-5 animate-spin" aria-hidden />}
                {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
              </button>
              <button onClick={salir} className="min-h-11 underline underline-offset-4 opacity-70">
                Cancelar (Esc)
              </button>
            </motion.div>
          ) : (
            <motion.div key="rechazo">
              <button ref={accionRef} onClick={salir}
                className="min-h-16 w-full rounded border-2 border-deny-ink/40 text-xl font-bold">
                Volver (Esc)
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
