'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Search, SearchX, UserPlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { TagTipo } from '@/components/dominio/tag-tipo'
import { useDemora } from '@/lib/use-demora'
import { useMedia } from '@/lib/use-media'
import { useBusqueda } from '@/lib/queries/garita'
import { useCampoLectora } from '@/lib/use-lectora'
import { formatearDni, interpretarLectura, type Lectura } from '@/lib/lectora'
import type { Hit } from '@/lib/gate'
import { cn } from '@/lib/utils'

/** Lo que devuelve /gate/search como mucho: el aviso lo dice para que no parezca que no hay más. */
const TOPE = 20

/**
 * Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos.
 *
 * Los resultados flotan sobre la pantalla, anclados al campo, en vez de meterse
 * en el flujo: antes cada letra empujaba la agenda y "Autorizar sin invitación"
 * cientos de píxeles, y al borrar todo volvía a saltar. En el celular, donde un
 * desplegable no entra con el teclado abierto, el mismo bloque pasa a pantalla
 * completa: es el mismo campo (la lectora sigue escribiendo en él), no otro.
 *
 * Teclado: flechas para moverse, Enter abre el marcado (el primero si no se
 * tocó nada), Esc cierra. El Enter de una lectura gana: lo resuelve la lectora.
 */
export function BuscarInvitado({ q, onQ, onAbrir, onLectura, onAutorizar }: {
  q: string
  onQ: (q: string) => void
  onAbrir: (id: string) => void
  onLectura: (l: Lectura) => void
  /** Sin resultados, el atajo a "Autorizar sin invitación" va en el mismo panel. */
  onAutorizar?: () => void
}) {
  const qDemorada = useDemora(q)
  const teclaLectura = useCampoLectora(q, (l) => { onQ(''); onLectura(l) })
  // El texto crudo de una lectura no se busca: lo resuelve onLectura.
  const busqueda = useBusqueda(interpretarLectura(qDemorada) ? '' : qDemorada.trim())
  const hits = busqueda.data ?? []
  const buscando = q.trim() !== qDemorada.trim() || busqueda.isFetching

  const id = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const movil = useMedia('(max-width: 767px)')
  const [cerrado, setCerrado] = useState(false)
  const [activo, setActivo] = useState(0)

  // Un texto nuevo (tipeado, o puesto por la página tras leer un DNI) vuelve a
  // abrir el panel con el primero marcado. Se ajusta durante el render, sin efecto.
  const [qPrevia, setQPrevia] = useState(q)
  if (q !== qPrevia) {
    setQPrevia(q)
    setCerrado(false)
    setActivo(0)
  }

  const abierto = q.trim() !== '' && !cerrado && !interpretarLectura(q)
  const marcado = Math.min(activo, Math.max(hits.length - 1, 0))

  // En escritorio, un clic afuera lo cierra; en el celular tapa todo, se cierra con la flecha.
  useEffect(() => {
    if (!abierto || movil) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setCerrado(true) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, movil])

  // Pantalla completa en el celular: lo de atrás no scrollea.
  useEffect(() => {
    if (!abierto || !movil) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [abierto, movil])

  // El marcado con las flechas siempre a la vista dentro de la lista.
  useEffect(() => {
    if (abierto) document.getElementById(`${id}-op-${marcado}`)?.scrollIntoView({ block: 'nearest' })
  }, [abierto, marcado, id])

  function elegir(h: Hit) {
    setCerrado(true)
    onAbrir(h.id)
  }

  function tecla(e: React.KeyboardEvent<HTMLInputElement>) {
    teclaLectura(e)
    if (e.defaultPrevented) return
    if (e.key === 'Escape') {
      // Con el panel abierto, Esc solo lo cierra: no borra lo escrito.
      if (abierto) { e.preventDefault(); setCerrado(true) }
      return
    }
    if (!abierto || hits.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((marcado + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((marcado - 1 + hits.length) % hits.length) }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(hits[marcado]) }
  }

  const resumen = buscando && hits.length === 0 ? 'Buscando…'
    : hits.length === 1 ? '1 resultado'
    : hits.length >= TOPE ? `Los primeros ${TOPE}: escribí más para acotar`
    : `${hits.length} resultados`

  return (
    <div ref={raiz} className={cn('relative',
      abierto && 'max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:bg-surface max-md:px-4 max-md:pt-[calc(0.75rem+env(safe-area-inset-top,0px))]')}>
      <div className="flex items-center gap-2">
        {abierto && (
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:hidden"
            aria-label="Cerrar la búsqueda" onClick={() => setCerrado(true)}>
            <ArrowLeft aria-hidden />
          </Button>
        )}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input type="search" value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={tecla}
            onFocus={() => setCerrado(false)} onClick={() => setCerrado(false)}
            placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
            role="combobox" aria-autocomplete="list" aria-expanded={abierto} aria-controls={`${id}-lista`}
            aria-activedescendant={abierto && hits.length ? `${id}-op-${marcado}` : undefined}
            autoComplete="off" className="h-12 pl-10 text-base" />
        </div>
      </div>

      {abierto && (
        <div className={cn(
          'flex flex-col overflow-hidden',
          'md:absolute md:inset-x-0 md:top-[calc(100%+0.5rem)] md:z-20 md:rounded-md md:border md:border-line md:bg-card md:shadow-(--sombra-flotante)',
          'md:animate-in md:fade-in md:slide-in-from-top-1 md:duration-150 md:ease-out',
          'max-md:-mx-4 max-md:mt-3 max-md:min-h-0 max-md:flex-1 max-md:border-t max-md:border-line',
        )}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-[13px] text-ink-soft">
            <span aria-live="polite" className="tabular">{hits.length === 0 && !buscando ? 'Sin resultados' : resumen}</span>
            {hits.length > 0 && <span className="hidden lg:inline">Flechas para moverte · Enter abre · Esc cierra</span>}
          </div>

          {hits.length > 0 ? (
            <ul id={`${id}-lista`} role="listbox" aria-label="Resultados de la búsqueda"
              className={cn('overflow-y-auto overscroll-contain py-1 md:max-h-[min(26rem,60vh)] max-md:flex-1',
                buscando && 'opacity-70 transition-opacity duration-150')}>
              {hits.map((h, i) => (
                <li key={h.id} id={`${id}-op-${i}`} role="option" aria-selected={i === marcado}
                  onPointerMove={() => { if (i !== marcado) setActivo(i) }}
                  // Antes que el blur del campo: así el clic no pierde el foco a mitad de camino.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => elegir(h)}
                  className={cn('flex min-h-14 cursor-pointer gap-x-3 gap-y-1.5 px-4 py-2.5 max-md:flex-col md:items-center',
                    i === marcado && 'bg-surface-sunk')}>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[15px] font-semibold', h.anulada && 'text-ink-soft line-through decoration-1')}>
                      {h.guestName}
                    </p>
                    <p className="truncate text-[13px] text-ink-soft tabular">
                      {[h.unitLabel, h.guestDoc && `DNI ${formatearDni(h.guestDoc)}`, h.plate].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {h.anulada ? <EstadoTag estado="anulada" /> : h.adentro ? <EstadoTag estado="adentro" /> : null}
                    <TagTipo kind={h.kind} frequentAs={h.frequentAs} />
                  </div>
                </li>
              ))}
            </ul>
          ) : !buscando && (
            <div id={`${id}-lista`} className="flex flex-col items-start gap-3 px-4 py-5">
              <p className="flex items-center gap-2 font-semibold">
                <SearchX className="size-4 text-ink-soft" aria-hidden />No encontramos a «{q.trim()}»
              </p>
              <p className="text-sm text-ink-soft">Probá con el apellido, el DNI, el lote o la patente. Si no tiene invitación, autorizalo acá.</p>
              {onAutorizar && (
                <Button type="button" variant="outline" onClick={() => { setCerrado(true); onAutorizar() }}>
                  <UserPlus aria-hidden />Autorizar sin invitación
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
