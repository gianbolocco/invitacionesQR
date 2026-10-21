'use client'
import { memo } from 'react'
import { LayoutGroup, MotionConfig, motion } from 'motion/react'
import { CheckCheck, DoorOpen, Hourglass } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TarjetaInvitado } from '@/components/garita/tarjeta-invitado'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { TagTipo } from '@/components/dominio/tag-tipo'
import { IconoNota } from '@/components/garita/icono-nota'
import type { AgendaRow } from '@/lib/queries/garita'
import type { Columnas } from '@/lib/tablero'
import { cn } from '@/lib/utils'
import { metaDe } from '@/components/garita/datos-agenda'

/*
 * Las columnas se distinguen por relleno y peso: macizo es "está pasando
 * ahora", contorno es "viene". Se lee igual en escala de grises.
 * Solo las dos que el guardia usa para decidir (decisión del dueño): quién ya
 * se fue no cambia nada en la barrera, y sigue en la vista lista y en el filtro.
 */
const COLUMNAS: {
  clave: 'porLlegar' | 'adentro'
  titulo: string
  vacio: string
  icono: LucideIcon
  cabecera: string
}[] = [
  { clave: 'porLlegar', titulo: 'Por llegar', vacio: 'No falta llegar nadie', icono: Hourglass,
    cabecera: 'border-[1.5px] border-ink text-ink' },
  { clave: 'adentro', titulo: 'Adentro', vacio: 'No hay nadie adentro', icono: DoorOpen,
    cabecera: 'bg-ink text-surface' },
]

/**
 * El día de un vistazo: quién viene y quién está adentro. Es
 * solo lectura —ingresar y egresar pasa por el veredicto, que es donde se
 * decide—, pero cuando alguien cambia de estado su tarjeta viaja de una
 * columna a la otra, así se ve qué se movió. Las vencidas quedan abajo,
 * plegadas: no son una columna del flujo, son lo que no vino.
 */
export function Tablero({ columnas, hoy, onAbrir }: {
  columnas: Columnas
  hoy: string
  onAbrir: (id: string) => void
}) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="grid grid-cols-2 items-start gap-3">
          {COLUMNAS.map((c) => {
            const filas = columnas[c.clave]
            const Icono = c.icono
            return (
              <section key={c.clave} aria-label={c.titulo}
                className="flex min-w-0 flex-col gap-2 rounded-md bg-surface-sunk/70 p-2">
                <header className="flex items-center justify-between px-1 pt-1">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] font-bold leading-4',
                    c.cabecera)}>
                    <Icono className="size-3" aria-hidden />{c.titulo}
                  </span>
                  <span className="font-display text-xl font-extrabold tabular">{filas.length}</span>
                </header>

                <div className="flex max-h-[calc(100dvh-19rem)] min-h-24 flex-col gap-2 overflow-y-auto p-0.5">
                  {filas.length === 0 && (
                    <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-ink-soft">
                      <CheckCheck className="size-4" aria-hidden />{c.vacio}
                    </p>
                  )}
                  {filas.map((r) => <ItemColumna key={r.id} r={r} hoy={hoy} onAbrir={onAbrir} />)}
                </div>
              </section>
            )
          })}
        </div>
      </LayoutGroup>

      {columnas.vencidas.length > 0 && <Vencidas filas={columnas.vencidas} onAbrir={onAbrir} />}
    </MotionConfig>
  )
}

// Con memo, como las filas de la lista: un aviso no redibuja las tarjetas que no cambiaron.
const ItemColumna = memo(function ItemColumna({ r, hoy, onAbrir }: { r: AgendaRow; hoy: string; onAbrir: (id: string) => void }) {
  return (
    <motion.div layout="position" layoutId={r.id}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
      <TarjetaInvitado fila={r} hoy={hoy} onAbrir={onAbrir} />
    </motion.div>
  )
})

function Vencidas({ filas, onAbrir }: { filas: AgendaRow[]; onAbrir: (id: string) => void }) {
  return (
    <details className="mt-3 rounded-md border border-line bg-card px-4 py-2">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
        Vencidas <span className="tabular text-ink-soft">({filas.length})</span>
      </summary>
      <div className="pb-1">
        {filas.map((r) => (
          <Fila densa key={r.id}
            titulo={<span className="flex items-center gap-2"><span className="min-w-0 truncate">{r.guestName}</span><IconoNota nota={r.note} /><TagTipo kind={r.kind} frequentAs={r.frequentAs} tradeName={r.tradeName} /></span>}
            meta={metaDe(r)} onClick={() => onAbrir(r.id)} extremo={<EstadoTag estado="vencida" />} />
        ))}
      </div>
    </details>
  )
}
