'use client'
import { memo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { TagTipo } from '@/components/dominio/tag-tipo'
import type { AgendaRow } from '@/lib/queries/garita'
import type { Columnas } from '@/lib/tablero'
import { detalleDe, estadoDe, metaDe } from '@/components/garita/datos-agenda'
import { TextoExcedido, useTiempoExcedido } from '@/components/garita/alertas-permanencia'

/*
 * Las filas van con memo: la agenda se vuelve a pedir con cada aviso de la
 * garita, y React Query conserva el objeto de cada fila que no cambió. Sin
 * memo se redibujaban cientos de filas por aviso, y la página trabada le
 * hacía perder lecturas a la lectora.
 */
export const FilaAgenda = memo(function FilaAgenda({ r, hoy, onAbrir }: { r: AgendaRow; hoy: string; onAbrir: (id: string) => void }) {
  const excedido = useTiempoExcedido(r)
  return (
    <Fila densa titulo={
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate">{r.guestName}</span>
        <TagTipo kind={r.kind} frequentAs={r.frequentAs} />
      </span>
    } meta={metaDe(r)} onClick={() => onAbrir(r.id)}
      extremo={excedido ? <TextoExcedido texto={excedido} className="text-[13px]" /> : <EstadoTag estado={estadoDe(r, hoy)} detalle={detalleDe(r, hoy)} contexto="garita" />} />
  )
})

/**
 * Un tramo de la lista. La fila que llega con el refresco entra abriéndose y
 * con un destello, para que el guardia note a quién acaban de invitar; la
 * carga inicial no anima (initial={false}), así no baila toda la lista.
 */
function Tramo({ filas, hoy, onAbrir, className }: {
  filas: AgendaRow[]
  hoy: string
  onAbrir: (id: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {filas.map((r) => <ItemTramo key={r.id} r={r} hoy={hoy} onAbrir={onAbrir} />)}
      </AnimatePresence>
    </div>
  )
}

// Variantes y no initial/animate sueltos: así el initial={false} de
// AnimatePresence también apaga el destello en la carga inicial.
// -mx-2 px-2: la fila se sale 8 px para su fondo al pasar el mouse, y el
// overflow-hidden de la animación se lo recortaba.
const ItemTramo = memo(function ItemTramo({ r, hoy, onAbrir }: { r: AgendaRow; hoy: string; onAbrir: (id: string) => void }) {
  return (
    <motion.div layout className="relative -mx-2 overflow-hidden px-2"
      initial="nueva" animate="lista" exit="sale" variants={{
        nueva: { opacity: 0, height: 0 },
        lista: { opacity: 1, height: 'auto', transition: { duration: 0.3 } },
        sale: { opacity: 0, height: 0, transition: { duration: 0.2 } },
      }}>
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-azul-tint"
        variants={{ nueva: { opacity: 1 }, lista: { opacity: 0, transition: { duration: 1.6, delay: 0.3 } } }} />
      <div className="relative"><FilaAgenda r={r} hoy={hoy} onAbrir={onAbrir} /></div>
    </motion.div>
  )
})

const TRAMOS: { clave: keyof Columnas; titulo: string; plegado?: boolean }[] = [
  { clave: 'adentro', titulo: 'Adentro' },
  { clave: 'porLlegar', titulo: 'Por llegar' },
  { clave: 'seFueron', titulo: 'Se fueron', plegado: true },
  { clave: 'vencidas', titulo: 'Vencidas', plegado: true },
]

/**
 * La lista del día en tramos. El orden es el de la pregunta del guardia: quién
 * está adentro, quién falta, y recién después lo que ya pasó. Los frecuentes
 * no van aparte ni escondidos: están en su tramo, con su tag.
 */
export function Lista({ columnas, hoy, onAbrir }: {
  columnas: Columnas
  hoy: string
  onAbrir: (id: string) => void
}) {
  const conFilas = TRAMOS.filter((t) => columnas[t.clave].length > 0)
  return (
    <div className="flex flex-col gap-6">
      {conFilas.map((t) => t.plegado && conFilas.length > 1
        ? <TramoPlegado key={t.clave} titulo={t.titulo} filas={columnas[t.clave]} hoy={hoy} onAbrir={onAbrir} />
        : (
          <section key={t.clave} className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-ink-soft">
              {t.titulo} ({columnas[t.clave].length})
            </h3>
            <Tramo filas={columnas[t.clave]} hoy={hoy} onAbrir={onAbrir} className={t.plegado ? 'opacity-70' : undefined} />
          </section>
        ))}
    </div>
  )
}

/*
 * Lo que ya pasó arranca cerrado. A la noche "Se fueron" es la mayoría de la
 * agenda, y cerrado no se monta: cada aviso de la garita redibujaba esas filas
 * y en una PC lenta la página trabada le cortaba lecturas a la lectora. Si el
 * filtro deja solo este tramo, va abierto (ver Lista).
 */
function TramoPlegado({ titulo, filas, hoy, onAbrir }: {
  titulo: string
  filas: AgendaRow[]
  hoy: string
  onAbrir: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <section className="flex flex-col gap-2">
      <h3>
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}
          className="-mx-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-ink-soft transition-colors duration-150 hover:bg-surface-sunk/70">
          <ChevronRight aria-hidden className={`size-4 transition-transform duration-200 ${abierto ? 'rotate-90' : ''}`} />
          {titulo} ({filas.length})
        </button>
      </h3>
      {abierto && <Tramo filas={filas} hoy={hoy} onAbrir={onAbrir} className="opacity-70" />}
    </section>
  )
}
