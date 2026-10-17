'use client'
import { useEffect, useRef, useState } from 'react'
import { History, Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { useHistorial, type FiltrosHistorial } from '@/lib/queries/invitaciones'
import { useDemora } from '@/lib/use-demora'
import { useSesion } from '@/lib/sesion-contexto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { FilaInvitacion } from '@/components/vecino/fila-invitacion'
import { FiltrosHistorialPanel } from '@/components/vecino/filtros-historial'
import { cn } from '@/lib/utils'

const SIN_FILTROS: Omit<FiltrosHistorial, 'q'> = { kind: '', estado: '', soloMias: false }

export default function HistorialPage() {
  const me = useSesion()
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const qDemorada = useDemora(q)
  const h = useHistorial({ q: qDemorada, ...filtros })
  const centinela = useRef<HTMLDivElement>(null)

  const filas = h.data?.pages.flatMap((p) => p.rows) ?? []
  const total = h.data?.pages[0]?.total ?? 0
  const activos = Number(Boolean(filtros.kind)) + Number(Boolean(filtros.estado)) + Number(filtros.soloMias)
  const hayFiltro = Boolean(q.trim()) || activos > 0

  // Cargar más al llegar al final, sin botón. El botón queda para quien no
  // hace scroll (teclado, lector de pantalla).
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = h
  useEffect(() => {
    const el = centinela.current
    if (!el || !hasNextPage) return
    const obs = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function limpiar() { setQ(''); setFiltros(SIN_FILTROS) }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina antetitulo="Todo lo que invitaste" titulo="Historial" />

      {/* El buscador queda pegado arriba al hacer scroll: es lo que más se usa. */}
      <div className="sticky top-14 z-20 -mx-4 flex gap-2 bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, documento o patente" aria-label="Buscar en el historial" className="pl-10" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="sm:hidden" aria-label={`Filtros${activos ? ` (${activos} activos)` : ''}`}>
              <SlidersHorizontal aria-hidden />
              {activos > 0 && <span className="grid size-5 place-items-center rounded-full bg-azul text-[13px] text-white">{activos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-lg">
            <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
            <div className="px-4 pb-8"><FiltrosHistorialPanel valor={filtros} onCambio={setFiltros} /></div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_15rem]">
        <section className="min-w-0">
          <div className="flex items-center justify-between pb-2">
            <p className="text-[13px] font-semibold text-ink-soft tabular" aria-live="polite">
              {h.isPending ? 'Buscando…' : `${total} ${total === 1 ? 'invitación' : 'invitaciones'}`}
            </p>
            {hayFiltro && (
              <Button variant="ghost" size="sm" onClick={limpiar}><X aria-hidden />Limpiar</Button>
            )}
          </div>

          {h.isPending ? (
            <SkeletonFilas filas={6} />
          ) : h.isError ? (
            <ErrorConReintento onReintentar={() => h.refetch()} reintentando={h.isFetching} />
          ) : filas.length === 0 ? (
            <Vacio icono={History}
              titulo={hayFiltro ? 'No encontramos nada' : 'Todavía no hay invitaciones'}
              detalle={hayFiltro ? 'Probá con otro nombre o sacá algún filtro.' : 'Las invitaciones que crees van a quedar acá.'}
              accion={hayFiltro ? <Button variant="outline" onClick={limpiar}>Limpiar filtros</Button> : undefined} />
          ) : (
            // Al cambiar un filtro, la lista anterior queda atenuada mientras
            // llega la nueva: el salto al skeleton en cada tecla marea.
            <ul className={cn('transition-opacity duration-200', h.isPlaceholderData && 'opacity-50')}>
              {filas.map((inv) => (
                <li key={inv.id}>
                  <FilaInvitacion inv={inv} mostrarUnidad={me.units.length > 1}
                    mostrarCreador={inv.createdBy !== me.id} />
                </li>
              ))}
            </ul>
          )}

          <div ref={centinela} />
          {hasNextPage && (
            <Button variant="outline" className="mt-4 w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
              {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </section>

        <aside className="hidden sm:block">
          <div className="sticky top-32"><FiltrosHistorialPanel valor={filtros} onCambio={setFiltros} /></div>
        </aside>
      </div>
    </div>
  )
}
