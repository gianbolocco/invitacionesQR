'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import { MOTIVO, detalleRechazo, hora, mensajeDeError, rechazoPorAuto, rechazoPorSeguro, type Movimiento } from '@/lib/gate'
import { ApiError } from '@/lib/api'
import { estadoDe, textoVence } from '@/lib/seguro'
import { mismaPatente, normalizarDoc } from '@/lib/padron'
import { useDemora } from '@/lib/use-demora'
import { NO_RECONOCIDO, type LecturaDni, formatearDni, interpretarLectura, soloDigitos, type Lectura } from '@/lib/lectora'
import { useCampoLectora, useLectora } from '@/lib/use-lectora'
import { hoyISO, horaODia, tiempoDesde, fechaCompleta } from '@/lib/fechas'
import { KIND_LABEL, vigencia } from '@/lib/invitations'
import {
  useAbrirQr, useAnotarLectura, useDeshacerMovimiento, useDniPendiente, useDocumentoLeido, useRegistrarEgreso, useRegistrarIngreso, useVeredicto,
  useVeredictoEnVivo, useCorregirSeguro,
} from '@/lib/queries/garita'
import { Input } from '@/components/ui/input'
import { AltaExpres } from '@/components/garita/alta-expres'
import { AnularInvitacion } from '@/components/garita/anular-invitacion'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SeccionSeguro } from '@/components/garita/seccion-seguro'
import { estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'

/** Segundos que la confirmación espera antes de volver sola a la pantalla anterior. */
const SEGUNDOS_CONFIRMACION = 8

const SALIDA = [0.2, 0.8, 0.2, 1] as const

const VACIO: ValorSeguro = { company: '', policy: '', expiresOn: '' }

/** Una fila de la ficha. dt + dd sueltos: los acomoda la grilla de la <dl>. */
function Dato({ etiqueta, children }: { etiqueta: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <dt className="opacity-80">{etiqueta}</dt>
      <dd className="min-w-0 break-words font-semibold tabular">{children}</dd>
    </>
  )
}

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
          className="grid size-7 place-items-center rounded-full bg-ink text-card">
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </motion.span>
        Registrado
      </p>
      <button ref={siguienteRef} onClick={onListo}
        className="relative min-h-16 overflow-hidden rounded bg-ink text-xl font-bold text-card">
        {/* La barra que se vacía dice lo mismo que el número, sin tener que leerlo. */}
        <motion.span aria-hidden initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
          transition={{ duration: SEGUNDOS_CONFIRMACION, ease: 'linear' }}
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-card/45" />
        <span className="tabular">Siguiente ({Math.max(0, restan)})</span>
      </button>
      <button onClick={onDeshacer} disabled={deshaciendo}
        className="min-h-14 rounded border-2 border-ink/30 text-lg font-bold disabled:opacity-60">
        {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
      </button>
      <p className="hidden text-center text-sm opacity-70 lg:block">o escaneá el siguiente</p>
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
  const abrirQr = useAbrirQr()
  const anotar = useAnotarLectura()
  const dniPendiente = useDniPendiente()
  const documentoLeido = useDocumentoLeido()
  const [idCargado, setIdCargado] = useState<string | null>(null)
  const [doc, setDoc] = useState('')
  const [docLeido, setDocLeido] = useState(false)
  const [plate, setPlate] = useState('')
  const [seguro, setSeguro] = useState<ValorSeguro>(VACIO)
  const [seguroAuto, setSeguroAuto] = useState<ValorSeguro>(VACIO)
  // Qué seguro está corrigiendo el guardia (uno que ya estaba cargado).
  const [corrigiendo, setCorrigiendo] = useState<{ proveedor: boolean; auto: boolean }>({ proveedor: false, auto: false })
  const [fechaPasada, setFechaPasada] = useState(false)
  const [fechaPasadaAuto, setFechaPasadaAuto] = useState(false)
  const [docInvalido, setDocInvalido] = useState(false)
  const corregir = useCorregirSeguro()
  // Todo lo que se muestra después de registrar sale de `hecho`, no del
  // veredicto: la mutación lo invalida al terminar y `adentro` pasa a decir
  // lo contrario de lo que se acaba de registrar.
  const [hecho, setHecho] = useState<{ movimiento: Movimiento; esEgreso: boolean } | null>(null)
  const accionRef = useRef<HTMLButtonElement>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [disparadorAlta, setDisparadorAlta] = useState<HTMLButtonElement | null>(null)
  const [lecturaAlta, setLecturaAlta] = useState<LecturaDni | null>(null)
  const [anulando, setAnulando] = useState(false)

  // Precarga de doc/patente al llegar el resultado: se ajusta durante el
  // render (patrón oficial de React para esto), no en un efecto.
  if (q.data && q.data.invitation.id !== idCargado) {
    setIdCargado(q.data.invitation.id)
    const leido = documentoLeido.ver(q.data.invitation.id)
    setDoc(leido ?? q.data.invitation.guestDoc ?? '')
    setDocLeido(Boolean(leido))
    setPlate(q.data.invitation.plate ?? '')
    setSeguro(VACIO); setSeguroAuto(VACIO); setCorrigiendo({ proveedor: false, auto: false })
  }

  // El veredicto se recalcula en la API cuando el guardia cambia documento o
  // patente (300 ms después de la última tecla). Mientras sean los de la
  // invitación, vale el inicial.
  const docDemorado = useDemora(doc)
  const plateDemorada = useDemora(plate)
  const base = q.data
  const distinto = (d: string, p: string) => Boolean(base) && (normalizarDoc(d) !== normalizarDoc(base?.invitation.guestDoc ?? '')
    || !mismaPatente(p, base?.invitation.plate ?? null))
  // Los dos: al cargar, la demora arranca en '' y tarda 300 ms en alcanzar la precarga;
  // sin mirar el valor actual, pediría (y mostraría) un veredicto sin documento ni patente.
  const cambio = distinto(doc, plate) && distinto(docDemorado, plateDemorada)
  const vivo = useVeredictoEnVivo(id, cambio ? { doc: docDemorado, plate: plateDemorada } : null)

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
  // Con el alta abierta no escucha, y Radix hace preventDefault al cerrar el sheet: ese Esc no saca también del veredicto.
  useEffect(() => {
    if (altaAbierta || anulando) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) salir() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altaAbierta, anulando])

  // Se consume al salir: volver a abrir esta invitación más tarde no lo trae.
  useEffect(() => () => documentoLeido.borrar(id), [id, documentoLeido])

  /*
   * Con un ingreso pendiente, un DNI es el de quien está adelante: completa y
   * enfoca "Registrar ingreso" (nunca registra solo). Si no, es el siguiente
   * invitado. Un QR siempre es el siguiente; replace para que Volver lleve a
   * donde estaba el guardia antes del primero.
   */
  // Dos lecturas seguidas pueden resolverse desordenadas: solo vale la última.
  const secuencia = useRef(0)
  async function leer(l: Lectura | null) {
    // Escribiendo el motivo de una anulación, una lectura no es para esta pantalla.
    if (anulando) return
    if (!l) { anotar('No reconocido'); toast.error(NO_RECONOCIDO); return }
    const mia = ++secuencia.current
    if (l.tipo === 'qr') {
      setAltaAbierta(false); setLecturaAlta(null)
      try {
        const r = await abrirQr(l.token, true, () => mia === secuencia.current)
        if (mia === secuencia.current) anotar(`QR · ${r.invitation.guestName}`)
      } catch (e) {
        if (mia !== secuencia.current) return
        anotar(`QR · ${mensajeDeError(e)}`)
        toast.error(mensajeDeError(e))
      }
      return
    }
    if (altaAbierta) {
      anotar(`DNI ${formatearDni(l.documento)} · completó el alta exprés`)
      setLecturaAlta(l)
      return
    }
    if (q.data && !hecho && !q.data.adentro && (q.data.check.ok || rechazoPorSeguro(q.data.check))) {
      anotar(`DNI ${formatearDni(l.documento)} · completó el documento`)
      setDoc(l.documento)
      setDocLeido(true)
      accionRef.current?.focus()
      return
    }
    dniPendiente.dejar(l)
    router.push('/garita')
  }
  useLectora({ onLectura: (texto) => leer(interpretarLectura(texto)) })
  // Un QR leído en el campo navega: se restituye el valor que tendría el campo (cambia el
  // texto, así no se vuelve a disparar) sin dejarlo vacío si abrirQr falla.
  const teclaDoc = useCampoLectora(doc, (l) => {
    if (l.tipo === 'qr') setDoc(documentoLeido.ver(id) ?? q.data?.invitation.guestDoc ?? '')
    leer(l)
  })

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

  // El de la invitación hasta que el guardia cambia algo; después, el recalculado.
  const resultado = (cambio && vivo.data) || q.data
  const { invitation: inv, check, adentro } = resultado
  // Un egreso no se valida: si está adentro, sale. `check` es del ingreso.
  const esEgreso = hecho ? hecho.esEgreso : Boolean(adentro)
  const ok = Boolean(hecho) || esEgreso || check.ok

  const hoy = hoyISO()
  const warn = resultado.insuranceWarnDays
  const esProveedor = inv.kind === 'proveedor' || inv.frequentAs === 'proveedor'
  const estadoProv = estadoDe(resultado.provider?.insurance ?? null, inv.requiresInsurance, hoy, warn)
  const pideAuto = resultado.vehicleInsuranceRequired && plate.trim() !== ''
  const estadoAuto = estadoDe(resultado.vehicle?.insurance ?? null, pideAuto, hoy, warn)
  const falta = (e: string) => e === 'sin_cargar' || e === 'vencido'

  // Campos abiertos: lo que falta o venció, y lo que el guardia está corrigiendo.
  // Con alguien adentro (egreso), ya registrado o rechazado por otra cosa (horario,
  // vencida), nada se abre: no habría con qué guardarlo.
  const activo = !hecho && !esEgreso && (check.ok || rechazoPorSeguro(check))
  const abiertoProv = activo && (falta(estadoProv) || corrigiendo.proveedor)
  const abiertoAuto = activo && (falta(estadoAuto) || corrigiendo.auto)
  const completoProv = estadoSeguroCargado(seguro) === 'completo'
  const completoAuto = estadoSeguroCargado(seguroAuto) === 'completo'

  // NO PASA por seguro: el guardia carga lo que falta y el ingreso se registra en el mismo paso.
  const cargaSeguro = !ok && rechazoPorSeguro(check)
  // Lo que falta tiene que estar completo; lo que se corrige, solo si se llenó.
  const listoParaGuardar = (!abiertoProv || !falta(estadoProv) || completoProv)
    && (!abiertoAuto || !falta(estadoAuto) || completoAuto)
  const mandaProv = abiertoProv && completoProv
  const mandaAuto = abiertoAuto && completoAuto
  const datos = (v: ValorSeguro) => ({ company: v.company.trim(), policy: v.policy.trim(), expiresOn: v.expiresOn })

  async function registrar() {
    setFechaPasada(false); setFechaPasadaAuto(false); setDocInvalido(false)
    try {
      const mov = esEgreso
        ? await egresar.mutateAsync(inv.id)
        : await ingresar.mutateAsync({
          invitationId: inv.id, guestName: inv.guestName,
          // plate va siempre, '' incluido: sin la clave la API usa la de la invitación, y "Viene a pie" la tiene que pisar.
          guestDoc: doc || undefined, plate,
          insurance: mandaProv ? datos(seguro) : undefined,
          vehicleInsurance: mandaAuto ? datos(seguroAuto) : undefined,
        })
      setHecho({ movimiento: mov, esEgreso })
    } catch (e) {
      // El toast de error ya lo muestra la mutación, salvo estos: van bajo su campo.
      if (e instanceof ApiError && e.code === 'insurance_expired') setFechaPasada(true)
      if (e instanceof ApiError && e.code === 'vehicle_insurance_expired') setFechaPasadaAuto(true)
      if (e instanceof ApiError && e.code === 'doc_required') setDocInvalido(true)
    }
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const detalle = !ok ? detalleRechazo((check as { reason: string }).reason, inv,
    { franjas: resultado.franjas, tradeName: inv.tradeName, plate, vehicle: resultado.vehicle }) : null
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'
  const palabra = esEgreso ? 'EGRESO' : ok ? 'INGRESO' : 'NO PASA'
  const registrando = ingresar.isPending || egresar.isPending

  // La línea de detalle se completa, no se reescribe: el ingreso que ya
  // estaba queda, y la hora nueva se suma al lado.
  const entro = hecho ? hecho.movimiento.enteredAt : adentro?.enteredAt
  const salio = hecho?.esEgreso ? hecho.movimiento.exitedAt : null

  const editable = (ok && !esEgreso && !hecho) || cargaSeguro
  const borde = ok ? 'border-ink/15' : 'border-current/20'
  const avisoSeguro = ok && !esEgreso && estadoProv === 'por_vencer'
  const avisoAuto = ok && !esEgreso && estadoAuto === 'por_vencer'
  // "Autorizar igual" no sirve para un auto sin seguro si el barrio no lo permite.
  const puedeAutorizar = (check as { reason: string }).reason !== 'revoked'
    && !(rechazoPorAuto(check) && !resultado.vehicleInsuranceOverride)
  const quienAuto = resultado.vehicle
    // hoyISO de un instante da su día en Buenos Aires: cortar el ISO daría el de UTC.
    ? `Lo cargó ${resultado.vehicle.updatedByName ?? 'la guardia'} el ${fechaCompleta(hoyISO(new Date(resultado.vehicle.updatedAt)))}` : null
  const quienProv = resultado.provider?.insuranceSource === 'link' ? 'Lo cargó él desde su link'
    : resultado.provider?.insuranceSource === 'garita' ? 'Lo cargó la guardia' : null
  const noCoincide = Boolean(editable && inv.guestDoc && soloDigitos(doc).length >= 7
    && soloDigitos(doc) !== soloDigitos(inv.guestDoc))
  const kbd = 'rounded border border-current/30 px-1.5 py-0.5 font-mono text-xs'

  return (
    <main aria-live="assertive"
      className={`min-h-dvh overflow-x-hidden p-6 sm:p-10 lg:px-14 ${ok ? 'bg-verde-tint text-ink' : 'bg-no-pasa text-no-pasa-texto'}`}>
      {/* Un solo árbol. Mobile: una columna, la acción al pie. Desde lg: lo que
          decide a la izquierda, para leer de lejos; la ficha y la acción a la
          derecha, para el guardia sentado. Solo cambia la grilla. */}
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-2xl grid-rows-[auto_1fr] gap-8 sm:min-h-[calc(100dvh-5rem)] lg:max-w-7xl lg:grid-cols-[3fr_2fr] lg:grid-rows-1 lg:items-center lg:gap-16">
        <section className="min-w-0">
          <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
            className="font-display origin-left text-6xl font-extrabold leading-[0.9] tracking-[-0.035em] sm:text-8xl lg:text-9xl xl:text-[10rem]">
            {palabra}
          </motion.h1>

          {!ok && (
            <p className="mt-4 text-2xl font-semibold sm:text-3xl lg:text-4xl">
              {motivo}
              {sinCupo && resultado.lastEntryAt && (
                <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
              )}
            </p>
          )}
          {detalle && <p className="mt-1 text-xl tabular opacity-80 sm:text-2xl lg:text-3xl">{detalle}</p>}
          {avisoSeguro && resultado.provider?.insurance && (
            <p className="mt-1 text-xl font-semibold tabular text-espera sm:text-2xl lg:text-3xl">
              Seguro {textoVence(resultado.provider.insurance.expiresOn, hoy)}
            </p>
          )}
          {avisoAuto && resultado.vehicle && (
            <p className="mt-1 text-xl font-semibold tabular text-espera sm:text-2xl lg:text-3xl">
              Seguro del auto {textoVence(resultado.vehicle.insurance.expiresOn, hoy)}
            </p>
          )}

          <p className={`mt-8 break-words border-t pt-5 text-3xl font-semibold leading-tight sm:text-4xl lg:text-6xl ${borde}`}>
            {inv.guestName}
          </p>
        </section>

        <section className={`flex min-w-0 flex-col justify-between gap-8 lg:justify-center lg:border-l lg:pl-12 ${borde}`}>
          {/* Lo que el guardia compara con lo que tiene adelante: la persona y el
              auto, cada uno con su seguro. Y la invitación, que en la barrera no cambia. */}
          <div className="flex flex-col gap-7">
            <SeccionSeguro titulo={esProveedor ? 'Proveedor' : 'Visitante'} idBase="seguro-proveedor"
              estado={estadoProv} guardado={resultado.provider?.insurance ?? null} quien={quienProv}
              abierto={abiertoProv} valor={seguro} onCambio={(v) => { setSeguro(v); setFechaPasada(false) }}
              fechaPasada={fechaPasada}
              onCorregir={activo ? () => {
                const s = resultado.provider?.insurance
                if (s) setSeguro({ ...s })
                setCorrigiendo((c) => ({ ...c, proveedor: true }))
              } : undefined}
              onGuardar={corrigiendo.proveedor && doc.trim() ? () => corregir.mutate(
                { tipo: 'proveedor', doc, name: inv.guestName, insurance: datos(seguro) },
                { onSuccess: () => setCorrigiendo((c) => ({ ...c, proveedor: false })) }) : undefined}
              guardando={corregir.isPending}>
              {inv.note && <Dato etiqueta="Nota">{inv.note}</Dato>}
              {editable ? (
                <>
                  <dt className="self-start pt-2.5 opacity-80"><label htmlFor="doc-veredicto">Documento</label></dt>
                  <dd className="min-w-0">
                    {/* El campo es claro en los dos temas: el dark:bg-input/30 del Input lo ensuciaría. */}
                    <Input id="doc-veredicto" value={doc} onKeyDown={teclaDoc}
                      aria-invalid={docInvalido || undefined}
                      aria-describedby={[docLeido && doc.trim() && 'doc-leido', noCoincide && 'doc-no-coincide', !doc.trim() && 'doc-falta', docInvalido && 'doc-invalido'].filter(Boolean).join(' ') || undefined}
                      onChange={(e) => { setDoc(e.target.value); setDocLeido(false); setDocInvalido(false) }}
                      className="tabular h-12 border-control bg-card text-xl" />
                    {docLeido && doc.trim() && <p id="doc-leido" className="mt-1 text-sm font-semibold">Leído del DNI</p>}
                    {/* Spec 3.8: avisa, no bloquea. Por dígitos: 30.123.456 y 30123456 son el mismo.
                        Los dos números lado a lado: comparar es más rápido que leer una frase. */}
                    {noCoincide && (
                      <p id="doc-no-coincide" className="mt-1 text-base font-semibold tabular">
                        No coincide · Invitación {inv.guestDoc} · {docLeido ? 'Leído' : 'Cargado'} {doc}
                      </p>
                    )}
                    {/* Nadie entra sin documento: si la invitación no lo traía, se carga acá. */}
                    {!doc.trim() && <p id="doc-falta" className="mt-1 text-sm font-semibold opacity-80">Hace falta para registrar el ingreso.</p>}
                    {docInvalido && <p id="doc-invalido" className="mt-1 text-base font-semibold">Cargá un documento válido.</p>}
                  </dd>
                </>
              ) : (
                <Dato etiqueta="Documento">{doc || inv.guestDoc || '—'}</Dato>
              )}
              <Dato etiqueta="Tipo">{KIND_LABEL[inv.kind]}{inv.tradeName && ` · ${inv.kind === 'frecuente' ? `${KIND_LABEL.proveedor} · ` : ''}${inv.tradeName}`}</Dato>
            </SeccionSeguro>

            <SeccionSeguro titulo="Vehículo" idBase="seguro-auto"
              estado={estadoAuto} guardado={resultado.vehicle?.insurance ?? null} quien={quienAuto}
              abierto={abiertoAuto} valor={seguroAuto} onCambio={(v) => { setSeguroAuto(v); setFechaPasadaAuto(false) }}
              fechaPasada={fechaPasadaAuto}
              onCorregir={activo && pideAuto ? () => {
                const s = resultado.vehicle?.insurance
                if (s) setSeguroAuto({ ...s })
                setCorrigiendo((c) => ({ ...c, auto: true }))
              } : undefined}
              onGuardar={corrigiendo.auto && plate.trim() ? () => corregir.mutate(
                { tipo: 'auto', plate, insurance: datos(seguroAuto) },
                { onSuccess: () => setCorrigiendo((c) => ({ ...c, auto: false })) }) : undefined}
              guardando={corregir.isPending}>
              {editable ? (
                <>
                  <dt className="self-start pt-2.5 opacity-80"><label htmlFor="patente-veredicto">Patente</label></dt>
                  <dd className="min-w-0">
                    <Input id="patente-veredicto" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                      className="tabular h-12 border-control bg-card text-xl uppercase" />
                    {/* Una sugerencia, no un vínculo: sale del último ingreso de este DNI. */}
                    {resultado.lastPlate && !mismaPatente(resultado.lastPlate, plate) && (
                      <button type="button" onClick={() => setPlate(resultado.lastPlate!)}
                        className="mt-1 min-h-11 text-base font-semibold underline underline-offset-4">
                        Última vez: {resultado.lastPlate}
                      </button>
                    )}
                  </dd>
                </>
              ) : (
                <Dato etiqueta="Patente">{plate || inv.plate || '—'}</Dato>
              )}
            </SeccionSeguro>

            <section aria-labelledby="seccion-invitacion" className="flex flex-col gap-2.5">
              <h2 id="seccion-invitacion" className="text-sm font-bold uppercase tracking-[0.08em] opacity-80">Invitación</h2>
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-lg sm:text-xl">
                <Dato etiqueta="Lote">{inv.unitLabel} · invita {inv.inviterName}</Dato>
                {!esEgreso && <Dato etiqueta="Vigencia">{vigencia(inv)}</Dato>}
                {/* Una frecuente lleva cupo 999 para ser ilimitada: "1 de 999" no le dice nada al guardia. */}
                {inv.capacity > 1 && inv.kind !== 'frecuente' && (
                  <Dato etiqueta="Cupo">{resultado.usedCount} de {inv.capacity} entraron</Dato>
                )}
                {entro && (
                  <Dato etiqueta="Entró">
                    <motion.span key={`e-${entro}`} initial={hecho && !hecho.esEgreso ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: SALIDA }} className="inline-block">
                      {horaODia(entro, hoyISO())}
                      {/* Cuánto lleva adentro: alguien con dos días salta a la vista. */}
                      {esEgreso && !hecho && <span className="font-normal opacity-75"> · adentro hace {tiempoDesde(entro)}</span>}
                    </motion.span>
                  </Dato>
                )}
                {salio && (
                  <Dato etiqueta="Salió">
                    <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, ease: SALIDA }} className="inline-block">
                      {hora(salio)}
                    </motion.span>
                  </Dato>
                )}
              </dl>
            </section>
          </div>

          <motion.div layout transition={{ duration: 0.32, ease: SALIDA }} className="w-full">
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
                  <button ref={accionRef} onClick={registrar}
                    disabled={registrando || (!esEgreso && !doc.trim()) || !listoParaGuardar}
                    className="flex min-h-16 items-center justify-center gap-2 rounded bg-ink text-xl font-bold text-card transition-colors disabled:bg-ink/40">
                    {registrando && <Loader2 className="size-5 animate-spin" aria-hidden />}
                    {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso'
                      : mandaProv || mandaAuto ? 'Guardar seguro y registrar ingreso' : 'Registrar ingreso'}
                  </button>
                  <p className="hidden text-sm opacity-70 lg:block"><kbd className={kbd}>Enter</kbd> registra · <kbd className={kbd}>Esc</kbd> vuelve</p>
                  <button onClick={salir} className="min-h-11 underline underline-offset-4 opacity-70">
                    Cancelar (Esc)
                  </button>
                  {/* Con alguien adentro no se anula (la API lo rechaza): ahí el paso es el egreso. */}
                  {!esEgreso && (
                    <button onClick={() => setAnulando(true)} className="min-h-11 text-sm underline underline-offset-4 opacity-60">
                      Anular esta invitación…
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div key="rechazo" className="flex flex-col gap-3">
                  {cargaSeguro ? (
                    <>
                      <button ref={accionRef} onClick={registrar} disabled={registrando || !listoParaGuardar || !doc.trim()}
                        className="flex min-h-16 w-full items-center justify-center gap-2 rounded bg-no-pasa-texto text-xl font-bold text-no-pasa disabled:opacity-40">
                        {registrando && <Loader2 className="size-5 animate-spin" aria-hidden />}
                        {registrando ? 'Registrando…' : 'Guardar seguro y registrar ingreso'}
                      </button>
                      {rechazoPorAuto(check) && (
                        <button onClick={() => { setPlate(''); setSeguroAuto(VACIO) }}
                          className="min-h-14 w-full rounded border-2 border-current/40 text-lg font-bold">
                          Viene a pie
                        </button>
                      )}
                      <button onClick={salir} className="min-h-14 w-full rounded border-2 border-current/40 text-lg font-bold">
                        Volver (Esc)
                      </button>
                    </>
                  ) : (
                    <button ref={accionRef} onClick={salir}
                      className="min-h-16 w-full rounded bg-no-pasa-texto text-xl font-bold text-no-pasa">
                      Volver (Esc)
                    </button>
                  )}
                  {/* El vecino ya dijo que sí por teléfono. Una anulada no: ahí dijo que no. */}
                  {puedeAutorizar && (
                    <button onClick={(e) => { setDisparadorAlta(e.currentTarget); setAltaAbierta(true) }}
                      className="min-h-11 text-base font-semibold underline underline-offset-4 opacity-80">
                      Autorizar igual…
                    </button>
                  )}
                  {(check as { reason: string }).reason !== 'revoked' && !esEgreso && (
                    <button onClick={() => setAnulando(true)} className="min-h-11 text-sm underline underline-offset-4 opacity-70">
                      Anular esta invitación…
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </section>
      </div>

      <AnularInvitacion abierto={anulando} onAbiertoChange={setAnulando} invitacion={inv}
        onAnulada={() => { toast.success('Invitación anulada.'); salir() }} />

      <AltaExpres abierto={altaAbierta} disparador={disparadorAlta}
        onAbiertoChange={(v) => { setAltaAbierta(v); if (!v) setLecturaAlta(null) }}
        lectura={lecturaAlta}
        inicial={{
          guestName: inv.guestName,
          guestDoc: doc || inv.guestDoc || '',
          plate: plate || inv.plate || '',
          unidad: { unitId: inv.unitId, unitLabel: inv.unitLabel, residentName: inv.inviterName },
          // Un rubro que ya no está activo lo descarta el sheet: ahí elige el guardia.
          kind: inv.kind === 'proveedor' || inv.frequentAs === 'proveedor' ? 'proveedor' : 'visita',
          tradeId: inv.tradeId ?? '',
        }}
        // replace: "Volver" en el veredicto nuevo lleva a donde estaba el guardia antes del rechazo.
        onCreada={(nuevo) => router.replace(`/garita/invitacion/${nuevo}`)}
        onQr={(token) => leer({ tipo: 'qr', token })} />
    </main>
  )
}
