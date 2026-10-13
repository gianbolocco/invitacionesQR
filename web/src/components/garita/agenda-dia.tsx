'use client'
import { useState } from 'react'
import { CalendarX, CheckCheck, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { hoyISO, sumarDias, tituloDia, hora, fechaHora } from '@/lib/fechas'
import { useAgenda, useAdentro, type AgendaRow } from '@/lib/queries/garita'

type Filtro = 'todos' | 'pendientes' | 'adentro'

function filaDe(r: AgendaRow, onAbrir: (id: string) => void) {
  /*
   * `adentro` se pregunta PRIMERO, antes que `enteredCount`. Alguien que
   * entró ayer y nadie le registró la salida tiene enteredCount 0 para hoy
   * pero sigue adentro: preguntando al revés aparecería como "Pendiente".
   */
  const estado: Estado = r.adentro ? 'adentro' : r.enteredCount === 0 ? 'esperando' : 'salio'
  const detalle = estado === 'adentro'
    // Si entró otro día, la hora sola engaña: lleva la fecha.
    ? (r.lastEntryAt ? (hoyISO(new Date(r.lastEntryAt)) === hoyISO() ? hora(r.lastEntryAt) : fechaHora(r.lastEntryAt)) : undefined)
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
  const [fecha, setFecha] = useState(hoyISO())
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verFrecuentes, setVerFrecuentes] = useState(false)
  const esHoy = fecha === hoyISO()
  const vista: Filtro = esHoy ? filtro : 'todos'
  const q = useAgenda(fecha)
  const adentro = useAdentro(esHoy)

  const todas = q.data ?? []
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const personas = todas.filter((r) => r.kind !== 'frecuente')
  const esperando = personas.filter((r) => !r.adentro && r.enteredCount === 0)
  const entraron = personas.filter((r) => r.adentro || r.enteredCount > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Día anterior"
          onClick={() => setFecha((f) => sumarDias(f, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => setFecha(hoyISO())}>Hoy</Button>
        <Button variant="outline" size="icon" aria-label="Día siguiente"
          onClick={() => setFecha((f) => sumarDias(f, 1))}>
          <ChevronRight aria-hidden />
        </Button>
        <CampoFecha id="agenda-fecha" valor={fecha} onCambio={setFecha} className="w-44" />
      </div>

      <h2 className="font-display text-2xl font-extrabold capitalize tracking-[-0.02em]">{tituloDia(fecha)}</h2>

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
          <div>{adentro.data.map((r) => filaDe(r, onAbrir))}</div>
        )
      ) : q.isPending ? (
        <SkeletonFilas filas={4} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : vista === 'pendientes' ? (
        esperando.length === 0 ? (
          <Vacio icono={CheckCheck} titulo="No falta llegar nadie" />
        ) : (
          <div>{esperando.map((r) => filaDe(r, onAbrir))}</div>
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
              <div>{esperando.map((r) => filaDe(r, onAbrir))}</div>
            </section>
          )}
          {entraron.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Ya entraron ({entraron.length})
              </p>
              <div className="opacity-70">{entraron.map((r) => filaDe(r, onAbrir))}</div>
            </section>
          )}
          {frecuentes.length > 0 && (
            <section className="flex flex-col gap-2">
              <Button variant="ghost" size="sm" className="self-start"
                onClick={() => setVerFrecuentes((v) => !v)}>
                {verFrecuentes ? 'Ocultar' : 'Mostrar'} frecuentes habilitados ({frecuentes.length})
              </Button>
              {verFrecuentes && <div>{frecuentes.map((r) => filaDe(r, onAbrir))}</div>}
            </section>
          )}
        </>
      )}
    </div>
  )
}
