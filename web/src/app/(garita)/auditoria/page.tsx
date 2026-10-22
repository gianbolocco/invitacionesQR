'use client'
import { useState } from 'react'
import { Download, Inbox, LayoutGrid, Search, SearchX, Table2, X } from 'lucide-react'
import { apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { useDemora } from '@/lib/use-demora'
import { useMedia } from '@/lib/use-media'
import { usePreferencia } from '@/lib/use-preferencia'
import { paramsDe, useAuditoria, type AuditRow, type FiltrosAuditoria } from '@/lib/queries/auditoria'
import { ChromeAdmin } from '@/components/admin/chrome'
import { ChromeGarita } from '@/components/garita/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { CampoFecha, textoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { FiltrosAplicados, HojaFiltros, SeccionFiltro, type FiltroAplicado } from '@/components/dominio/hoja-filtros'
import { SelectorVista, type OpcionVista } from '@/components/dominio/selector-vista'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabla } from '@/components/auditoria/tabla'
import { Tarjetas } from '@/components/auditoria/tarjetas'
import { Detalle } from '@/components/auditoria/detalle'
import { cn } from '@/lib/utils'

type Vista = 'tabla' | 'tarjetas'
type Rango = 'hoy' | '7' | '30' | 'otro'

const PAGE_SIZE = 25
const RANGOS: { valor: Exclude<Rango, 'otro'>; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7', etiqueta: '7 días' },
  { valor: '30', etiqueta: '30 días' },
]
const TIPOS: { valor: FiltrosAuditoria['tipo']; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'visita', etiqueta: 'Visitas' },
  { valor: 'frecuente', etiqueta: 'Frecuentes' },
  { valor: 'proveedor', etiqueta: 'Proveedores' },
]

/** Qué atajo está puesto, o 'otro' si las fechas se tocaron a mano. */
function rangoActivo(from: string, to: string): Rango {
  const hoy = hoyISO()
  if (to !== hoy) return 'otro'
  if (from === hoy) return 'hoy'
  if (from === sumarDias(hoy, -7)) return '7'
  if (from === sumarDias(hoy, -30)) return '30'
  return 'otro'
}

export default function AuditoriaPage() {
  const me = useMe()
  const [from, setFrom] = useState(sumarDias(hoyISO(), -7))
  const [to, setTo] = useState(hoyISO())
  const [estado, setEstado] = useState<FiltrosAuditoria['estado']>('todos')
  const [tipo, setTipo] = useState<FiltrosAuditoria['tipo']>('todos')
  const [texto, setTexto] = useState('')
  const [page, setPage] = useState(1)
  const [abierta, setAbierta] = useState<AuditRow | null>(null)

  const medio = useMedia('(min-width: 768px)')
  const [guardada, guardar] = usePreferencia<Vista>('visitpass.auditoria.vista')
  // La tabla no entra en un celular: ahí siempre tarjetas, aunque se haya elegido tabla en la compu.
  const vista: Vista = medio ? (guardada ?? 'tabla') : 'tarjetas'

  // El buscador espera a que se deje de tipear: "martin" son seis teclas, no seis consultas.
  const q = useDemora(texto)
  const filtros: FiltrosAuditoria = { from, to, estado, tipo, q }
  const consulta = useAuditoria(filtros, page, PAGE_SIZE, Boolean(me))

  /** Cada cambio de filtro vuelve a la primera página: la 3 de otra búsqueda no existe. */
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  function aplicarRango(valor: Exclude<Rango, 'otro'>) {
    setTo(hoyISO())
    setFrom(valor === 'hoy' ? hoyISO() : sumarDias(hoyISO(), -Number(valor)))
    setPage(1)
  }
  // Lo que está en el panel. El rango por defecto son 7 días: otro rango cuenta como filtro puesto.
  const rango = rangoActivo(from, to)
  const aplicados: FiltroAplicado[] = []
  if (rango !== '7') aplicados.push({
    clave: 'rango',
    etiqueta: rango === 'hoy' ? 'Hoy' : rango === '30' ? 'Últimos 30 días' : `${textoFecha(from)} → ${textoFecha(to)}`,
    quitar: () => aplicarRango('7'),
  })
  if (tipo !== 'todos') aplicados.push({
    clave: 'tipo', etiqueta: TIPOS.find((t) => t.valor === tipo)!.etiqueta, quitar: () => cambiar(setTipo)('todos'),
  })
  function limpiarPanel() { setTipo('todos'); aplicarRango('7') }

  const hayFiltros = texto !== '' || estado !== 'todos' || aplicados.length > 0
  function limpiar() { setTexto(''); setEstado('todos'); limpiarPanel() }

  if (!me) return <main className="p-6">Cargando…</main>
  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>La auditoría es de la guardia y la administración.</p></main>
  }

  const lista = consulta.data?.rows ?? []
  const counts = consulta.data?.counts
  const total = consulta.data?.total ?? 0
  const warnDays = consulta.data?.insuranceWarnDays ?? null
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const todos = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  // Se llega acá desde las dos secciones: cada rol ve el marco de la suya.
  const Chrome = me.role === 'admin' ? ChromeAdmin : ChromeGarita

  const opciones: OpcionVista<Vista>[] = [
    { valor: 'tabla', etiqueta: 'Tabla', icono: Table2, disponible: medio },
    { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: LayoutGrid },
  ]

  return (
    <Chrome>
      <div className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Auditoría" acciones={
          <>
            {medio && <SelectorVista etiqueta="Vista de la auditoría" opciones={opciones} valor={vista} onCambio={guardar} />}
            <a href={`${apiBase}/gate/audit.xlsx?${paramsDe(filtros)}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
              <Download className="size-4" aria-hidden />Exportar a Excel
            </a>
          </>
        } />

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input type="search" value={texto} onChange={(e) => cambiar(setTexto)(e.target.value)}
                placeholder="Nombre, DNI, patente o unidad" aria-label="Buscar en la auditoría"
                className="h-12 pl-10 pr-10 text-base" />
              {texto && (
                <button type="button" aria-label="Borrar la búsqueda" onClick={() => cambiar(setTexto)('')}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-surface-sunk hover:text-ink">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <HojaFiltros aplicados={aplicados} resultados={consulta.data ? total : undefined} onLimpiar={limpiarPanel}>
              <SeccionFiltro titulo="Fecha">
                <Chips etiqueta="Rango rápido" valor={rango} onCambio={(v) => v !== 'otro' && aplicarRango(v)} opciones={RANGOS} />
                <div className="flex items-center gap-2">
                  <CampoFecha id="desde" valor={from} onCambio={cambiar(setFrom)} className="flex-1" />
                  <span aria-hidden className="text-ink-soft">→</span>
                  <CampoFecha id="hasta" valor={to} onCambio={cambiar(setTo)} className="flex-1" />
                </div>
              </SeccionFiltro>
              <SeccionFiltro titulo="Tipo de invitación">
                <Chips etiqueta="Tipo de invitación" valor={tipo} onCambio={cambiar(setTipo)} opciones={TIPOS} />
              </SeccionFiltro>
            </HojaFiltros>
          </div>
          <FiltrosAplicados aplicados={aplicados} onLimpiar={limpiarPanel} />
        </div>

        <Chips etiqueta="Estado" desplaza valor={estado} onCambio={cambiar(setEstado)} opciones={[
          { valor: 'todos', etiqueta: 'Todos', contador: counts ? todos : undefined },
          { valor: 'adentro', etiqueta: 'Adentro', contador: counts?.adentro },
          { valor: 'concluida', etiqueta: 'Concluidas', contador: counts?.concluida },
          { valor: 'esperando', etiqueta: 'Pendientes', contador: counts?.esperando },
          { valor: 'vencida', etiqueta: 'Vencidas', contador: counts?.vencida },
          { valor: 'anulada', etiqueta: 'Anuladas', contador: counts?.anulada },
        ]} />

        {consulta.isPending ? (
          <SkeletonFilas filas={6} />
        ) : consulta.isError ? (
          <ErrorConReintento onReintentar={() => consulta.refetch()} reintentando={consulta.isFetching} />
        ) : lista.length === 0 ? (
          hayFiltros
            ? <Vacio icono={SearchX} titulo="Nada coincide con esa búsqueda"
                detalle="Probá con menos filtros o con otro rango de fechas."
                accion={<Button variant="outline" onClick={limpiar}>Quitar filtros</Button>} />
            : <Vacio icono={Inbox} titulo="No hay invitaciones en ese rango" />
        ) : (
          // Mientras llega la búsqueda nueva, la lista anterior queda a media luz en vez de saltar.
          <div className={cn('transition-opacity duration-150', consulta.isPlaceholderData && 'opacity-60')}>
            {vista === 'tabla' ? <Tabla filas={lista} warnDays={warnDays} onAbrir={setAbierta} /> : <Tarjetas filas={lista} warnDays={warnDays} onAbrir={setAbierta} />}
          </div>
        )}

        {total > PAGE_SIZE && (
          <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft tabular">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</Button>
              <span className="flex min-h-11 items-center px-2 text-sm tabular">{page} de {paginas}</span>
              <Button variant="outline" disabled={page >= paginas} onClick={() => setPage((p) => Math.min(paginas, p + 1))}>Siguiente ›</Button>
            </div>
          </nav>
        )}
      </div>
      <Detalle fila={abierta} warnDays={warnDays} onCerrar={() => setAbierta(null)} />
    </Chrome>
  )
}
