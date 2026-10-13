'use client'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarX, CheckCheck, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { hoyISO, sumarDias, tituloDia, hora, horaODia } from '@/lib/fechas'
import { useAgenda, useAdentro, type AgendaRow } from '@/lib/queries/garita'
import { estadoEnAgenda } from '@/lib/estado-invitacion'

type Filtro = 'todos' | 'pendientes' | 'adentro'

function filaDe(r: AgendaRow, onAbrir: (id: string) => void) {
  const estado: Estado = estadoEnAgenda(r, hoyISO())
  const detalle = estado === 'adentro'
    // Si entró otro día, la hora sola engaña: lleva la fecha.
    ? (r.lastEntryAt ? horaODia(r.lastEntryAt, hoyISO()) : undefined)
    : estado === 'salio'
      ? (r.lastExitAt ? hora(r.lastExitAt) : undefined)
      : undefined
  const meta = [
    r.unitLabel,
    `invita ${r.inviterName}`,
    r.plate,
    r.capacity > 1 && r.enteredCount > 1 ? `${r.enteredCount} ingresos hoy` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Fila key={r.id} titulo={r.guestName} meta={meta} onClick={() => onAbrir(r.id)}
      extremo={<EstadoTag estado={estado} detalle={detalle} />} />
  )
}

/**
 * Una lista de la agenda. La que llega con el refresco entra abriéndose y con
 * un destello, para que el guardia note a quién acaban de invitar; la carga
 * inicial no anima (initial={false}), así no baila toda la lista al entrar.
 * El que cambia de sección (llegó: de Pendientes a Ya entraron) entra igual.
 */
function Lista({ filas, onAbrir, className }: {
  filas: AgendaRow[]
  onAbrir: (id: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {filas.map((r) => (
          // Variantes y no initial/animate sueltos: así el initial={false} de
          // AnimatePresence también apaga el destello en la carga inicial.
          // -mx-2 px-2: la fila se sale 8 px para su fondo al pasar el mouse, y el
          // overflow-hidden de la animación se lo recortaba.
          <motion.div key={r.id} layout className="relative -mx-2 overflow-hidden px-2"
            initial="nueva" animate="lista" exit="sale" variants={{
              nueva: { opacity: 0, height: 0 },
              lista: { opacity: 1, height: 'auto', transition: { duration: 0.3 } },
              sale: { opacity: 0, height: 0, transition: { duration: 0.2 } },
            }}>
            <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-marca-suave"
              variants={{ nueva: { opacity: 1 }, lista: { opacity: 0, transition: { duration: 1.6, delay: 0.3 } } }} />
            <div className="relative">{filaDe(r, onAbrir)}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/**
 * La agenda del día, en el panel en reposo de la garita.
 *
 * La división principal es esperando / ya entraron, no alfabética: es la
 * pregunta que el guardia tiene a las 21, ¿quién falta? Los frecuentes van
 * aparte y colapsados, porque aparecen todos los días y el guardia deja de
 * leerlos.
 *
 * "Adentro" no sale de la agenda: la agenda es quién puede entrar ESE día, y
 * adentro es quién está en el barrio ahora, aunque haya entrado ayer con una
 * invitación de ayer. Por eso es otra consulta, y solo existe mirando hoy.
 */
export function AgendaDia({ onAbrir }: { onAbrir: (id: string) => void }) {
  /*
   * null = "hoy", no una fecha fija: la garita queda abierta toda la noche y
   * a las 00:00 tiene que pasar sola al día nuevo. Con la fecha guardada al
   * montar, el guardia del turno noche miraba la agenda de ayer, sin refresco.
   * Se chequea el día cada minuto; si no cambió, setHoy no re-renderiza.
   */
  const [hoy, setHoy] = useState(hoyISO)
  useEffect(() => {
    const t = setInterval(() => setHoy(hoyISO()), 60_000)
    return () => clearInterval(t)
  }, [])
  const [elegida, setElegida] = useState<string | null>(null)
  const fecha = elegida ?? hoy
  const setFecha = (f: string) => setElegida(f === hoy ? null : f)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verFrecuentes, setVerFrecuentes] = useState(false)
  const esHoy = fecha === hoy
  const vista: Filtro = esHoy ? filtro : 'todos'
  const q = useAgenda(fecha)
  const adentro = useAdentro(esHoy)

  const todas = q.data ?? []
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const personas = todas.filter((r) => r.kind !== 'frecuente')
  const esperando = personas.filter((r) => estadoEnAgenda(r, hoy) === 'esperando')
  const vencidas = personas.filter((r) => estadoEnAgenda(r, hoy) === 'vencida')
  const entraron = personas.filter((r) => r.adentro || r.enteredCount > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Día anterior"
          onClick={() => setFecha(sumarDias(fecha, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => setElegida(null)}>Hoy</Button>
        <Button variant="outline" size="icon" aria-label="Día siguiente"
          onClick={() => setFecha(sumarDias(fecha, 1))}>
          <ChevronRight aria-hidden />
        </Button>
        <CampoFecha id="agenda-fecha" valor={fecha} onCambio={setFecha} className="w-44" />
      </div>

      <h2 className="font-display text-2xl font-extrabold capitalize tracking-[-0.02em]">{tituloDia(fecha, hoy)}</h2>

      {esHoy && (
        <Chips etiqueta="Filtrar la agenda" valor={filtro} onCambio={setFiltro} opciones={[
          { valor: 'todos', etiqueta: 'Todos' },
          { valor: 'pendientes', etiqueta: 'Pendientes', contador: q.data ? esperando.length : undefined },
          { valor: 'adentro', etiqueta: 'Adentro', contador: adentro.data?.length },
        ]} />
      )}

      {vista === 'adentro' ? (
        adentro.isPending ? (
          <SkeletonFilas filas={4} />
        ) : adentro.isError ? (
          <ErrorConReintento onReintentar={() => adentro.refetch()} reintentando={adentro.isFetching} />
        ) : adentro.data.length === 0 ? (
          <Vacio icono={DoorOpen} titulo="No hay nadie adentro" />
        ) : (
          <Lista filas={adentro.data} onAbrir={onAbrir} />
        )
      ) : q.isPending ? (
        <SkeletonFilas filas={4} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : vista === 'pendientes' ? (
        esperando.length === 0 ? (
          <Vacio icono={CheckCheck} titulo="No falta llegar nadie" />
        ) : (
          <Lista key={fecha} filas={esperando} onAbrir={onAbrir} />
        )
      ) : todas.length === 0 ? (
        <Vacio icono={CalendarX} titulo="Nadie tiene autorización para este día" />
      ) : (
        <>
          {esperando.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Pendientes ({esperando.length})
              </p>
              <Lista key={fecha} filas={esperando} onAbrir={onAbrir} />
            </section>
          )}
          {entraron.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Ya entraron ({entraron.length})
              </p>
              <Lista key={fecha} filas={entraron} onAbrir={onAbrir} className="opacity-70" />
            </section>
          )}
          {vencidas.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Vencidas ({vencidas.length})
              </p>
              <Lista key={fecha} filas={vencidas} onAbrir={onAbrir} className="opacity-70" />
            </section>
          )}
          {frecuentes.length > 0 && (
            <section className="flex flex-col gap-2">
              <Button variant="ghost" size="sm" className="self-start"
                onClick={() => setVerFrecuentes((v) => !v)}>
                {verFrecuentes ? 'Ocultar' : 'Mostrar'} frecuentes habilitados ({frecuentes.length})
              </Button>
              {verFrecuentes && <Lista key={fecha} filas={frecuentes} onAbrir={onAbrir} />}
            </section>
          )}
        </>
      )}
    </div>
  )
}
