'use client'
import { useEffect, useMemo, useState } from 'react'
import { Building2, CalendarX, ChevronLeft, ChevronRight, Columns3, List, SearchX, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { HojaFiltros } from '@/components/dominio/hoja-filtros'
import { SelectorVista, type OpcionVista } from '@/components/dominio/selector-vista'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { hoyISO, sumarDias, tituloDia } from '@/lib/fechas'
import { useAgenda, useAdentro } from '@/lib/queries/garita'
import {
  armarColumnas, filtrarPorTipo, type Columnas, type FiltroEstado, type FiltroTipo,
} from '@/lib/tablero'
import { useMedia } from '@/lib/use-media'
import { usePreferencia } from '@/lib/use-preferencia'
import { Tablero } from './vistas/tablero'
import { Lista } from './vistas/lista'
import { Compacta } from './vistas/compacta'
import { PorUnidad } from './vistas/por-unidad'

type Vista = 'tablero' | 'lista' | 'compacta' | 'unidad'

const VACIAS: Columnas = { porLlegar: [], adentro: [], seFueron: [], vencidas: [] }

/**
 * La agenda del día, en el panel en reposo de la garita, con cuatro formas de
 * mirarla: tablero (solo escritorio ancho), lista, tabla compacta y por
 * unidad. La elegida se acuerda entre turnos.
 *
 * La división principal es por dónde está cada persona —por llegar, adentro,
 * se fueron—, no alfabética: es la pregunta que el guardia tiene a las 21,
 * ¿quién falta? Los frecuentes no van aparte: son gente que viene, y se
 * distinguen con un tag.
 *
 * "Adentro" no sale de la agenda: la agenda es quién puede entrar ESE día, y
 * adentro es quién está en el barrio ahora, aunque haya entrado ayer con una
 * invitación de ayer. Por eso es otra consulta, y solo se mezcla mirando hoy.
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
  const esHoy = fecha === hoy

  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [estado, setEstado] = useState<FiltroEstado>('todos')

  const ancho = useMedia('(min-width: 1280px)')
  const medio = useMedia('(min-width: 768px)')
  const [guardada, guardar] = usePreferencia<Vista>('visitpass.garita.vista')
  const disponible: Record<Vista, boolean> = { tablero: ancho, lista: true, compacta: medio, unidad: true }
  const preferida: Vista = guardada ?? 'lista'
  // Una vista guardada que esta pantalla no puede mostrar (el tablero en un celular) cae a la lista.
  const vista: Vista = disponible[preferida] ? preferida : 'lista'

  const q = useAgenda(fecha)
  const adentro = useAdentro(esHoy)

  const columnas = useMemo(() => armarColumnas(
    filtrarPorTipo(q.data ?? [], tipo),
    esHoy && adentro.data ? filtrarPorTipo(adentro.data, tipo) : null,
    hoy,
  ), [q.data, adentro.data, tipo, esHoy, hoy])

  const total = columnas.porLlegar.length + columnas.adentro.length + columnas.seFueron.length + columnas.vencidas.length
  // El filtro de estado no existe en el tablero: ahí los tres estados ya son las columnas.
  const visibles: Columnas = vista === 'tablero' || estado === 'todos' ? columnas : { ...VACIAS, [estado]: columnas[estado] }
  const planas = [...visibles.adentro, ...visibles.porLlegar, ...visibles.seFueron, ...visibles.vencidas]

  const opciones: OpcionVista<Vista>[] = [
    { valor: 'tablero', etiqueta: 'Tablero', icono: Columns3, disponible: ancho },
    { valor: 'lista', etiqueta: 'Lista', icono: List },
    { valor: 'compacta', etiqueta: 'Compacta', icono: Table2, disponible: medio },
    { valor: 'unidad', etiqueta: 'Por unidad', icono: Building2 },
  ]

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
        <div className="ml-auto">
          <SelectorVista etiqueta="Vista de la agenda" opciones={opciones} valor={vista} onCambio={guardar} />
        </div>
      </div>

      <h2 className="font-display text-2xl font-extrabold capitalize tracking-[-0.02em]">{tituloDia(fecha, hoy)}</h2>

      <HojaFiltros activos={(tipo !== 'todos' ? 1 : 0) + (vista !== 'tablero' && estado !== 'todos' ? 1 : 0)}
        resultados={q.data ? planas.length : undefined} onLimpiar={() => { setTipo('todos'); setEstado('todos') }}>
        <Chips etiqueta="Tipo de invitación" valor={tipo} onCambio={setTipo} opciones={[
          { valor: 'todos', etiqueta: 'Todos' },
          { valor: 'visita', etiqueta: 'Visitas' },
          { valor: 'frecuente', etiqueta: 'Frecuentes' },
          { valor: 'proveedor', etiqueta: 'Proveedores' },
        ]} />
        {vista !== 'tablero' && (
          <Chips etiqueta="Estado" valor={estado} onCambio={setEstado} opciones={[
            { valor: 'todos', etiqueta: 'Todos', contador: q.data ? total : undefined },
            { valor: 'porLlegar', etiqueta: 'Por llegar', contador: q.data ? columnas.porLlegar.length : undefined },
            { valor: 'adentro', etiqueta: 'Adentro', contador: q.data ? columnas.adentro.length : undefined },
            { valor: 'seFueron', etiqueta: 'Se fueron', contador: q.data ? columnas.seFueron.length : undefined },
          ]} />
        )}
      </HojaFiltros>

      {guardada === undefined || q.isPending ? (
        <SkeletonFilas filas={4} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : total === 0 ? (
        tipo === 'todos'
          ? <Vacio icono={CalendarX} titulo="Nadie tiene autorización para este día" />
          : <Vacio icono={SearchX} titulo="Ninguna invitación de ese tipo"
              accion={<Button variant="outline" onClick={() => setTipo('todos')}>Ver todos</Button>} />
      ) : vista !== 'tablero' && planas.length === 0 ? (
        <Vacio icono={SearchX} titulo="Nadie en ese estado"
          accion={<Button variant="outline" onClick={() => setEstado('todos')}>Ver todos</Button>} />
      ) : (
        // La key hace que el cambio de vista o de día entre con su animación, y el refresco no.
        <div key={`${vista}-${fecha}`} className="entra-vista">
          {vista === 'tablero' && <Tablero columnas={columnas} hoy={hoy} onAbrir={onAbrir} />}
          {vista === 'lista' && <Lista columnas={visibles} hoy={hoy} onAbrir={onAbrir} />}
          {vista === 'compacta' && <Compacta filas={planas} hoy={hoy} onAbrir={onAbrir} />}
          {vista === 'unidad' && <PorUnidad filas={planas} hoy={hoy} onAbrir={onAbrir} />}
        </div>
      )}
    </div>
  )
}
