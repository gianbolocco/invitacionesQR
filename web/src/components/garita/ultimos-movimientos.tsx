'use client'
import { History, Package } from 'lucide-react'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { hora, hoyISO } from '@/lib/fechas'
import { ultimosMovimientos } from '@/lib/ultimos-movimientos'
import { useAgenda } from '@/lib/queries/garita'
import { usePaquetesHoy } from '@/lib/queries/paquetes'
import { useMarca } from '@/lib/marca-cliente'

/** Ingresos y egresos recientes, para no perder de vista lo que acaba de pasar. */
export function UltimosMovimientos() {
  const q = useAgenda(hoyISO())
  const { packagesEnabled } = useMarca()
  const paquetes = usePaquetesHoy(packagesEnabled)
  const eventos = ultimosMovimientos(q.data ?? [], paquetes.data ?? [])

  if (eventos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
        <History className="size-3.5" aria-hidden />Últimos movimientos
      </p>
      <ul className="flex flex-col gap-1.5">
        {eventos.map((e) => (
          <li key={`${e.invitationId}-${e.tipo}-${e.cuando}`} className="flex items-center gap-2 text-sm">
            {e.tipo === 'ingreso' && <EstadoTag estado="adentro" etiqueta="Ingreso" />}
            {e.tipo === 'egreso' && <EstadoTag estado="salio" etiqueta="Egreso" />}
            {e.tipo === 'paquete' && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm bg-azul-tint px-2.5 py-1 text-[13px] leading-4 font-semibold text-ink">
                <Package className="size-3.5 shrink-0 text-azul-text" strokeWidth={2.5} aria-hidden />Paquete
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{e.guestName}</span>
            <span className="shrink-0 text-ink-soft tabular">{hora(e.cuando)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
