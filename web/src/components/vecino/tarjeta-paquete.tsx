import Link from 'next/link'
import { Package } from 'lucide-react'
import { horaODia, hoyISO } from '@/lib/fechas'
import type { Paquete } from '@/lib/queries/paquetes'

/** Aviso del inicio: hay paquetes que el vecino todavía no vio. `ultimo` es el más reciente. */
export function TarjetaPaquete({ ultimo, cantidad }: { ultimo: Paquete; cantidad: number }) {
  return (
    <section aria-label="Paquete" className="flex gap-3 rounded-md bg-azul-tint p-4">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-azul-text">
        <Package className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Te llegó un paquete</p>
        <p className="text-sm text-ink-soft">
          {[horaODia(ultimo.notifiedAt, hoyISO()), ultimo.note].filter(Boolean).join(' · ')}
        </p>
        <Link href="/paquetes" className="mt-2 inline-block text-sm font-semibold text-azul-text underline-offset-4 hover:underline">
          Ver paquetes ({cantidad})
        </Link>
      </div>
    </section>
  )
}
