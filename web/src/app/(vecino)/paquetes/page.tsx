'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { api } from '@/lib/api'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { horaODia, hoyISO } from '@/lib/fechas'
import { clavePaquetes, usePaquetes } from '@/lib/queries/paquetes'

export default function PaquetesPage() {
  const q = usePaquetes()
  const qc = useQueryClient()

  // Abrir la lista es verlos: se marca al montar y la tarjeta del inicio se va.
  useEffect(() => {
    api('/packages/seen', { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: clavePaquetes })).catch(() => {})
  }, [qc])

  return (
    <div className="flex flex-col gap-7">
      <EncabezadoPagina antetitulo="Últimos 30 días" titulo="Paquetes" />
      {q.isPending ? <SkeletonFilas />
        : q.isError ? <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
        : q.data.length === 0 ? (
          <Vacio icono={Package} titulo="No llegó ningún paquete en los últimos 30 días." />
        ) : (
          <ul>
            {q.data.map((p) => (
              <li key={p.id} className="flex items-start gap-3 border-b border-line py-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-azul-tint text-azul-text">
                  <Package className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{horaODia(p.notifiedAt, hoyISO())}{p.note && ` · ${p.note}`}</p>
                  <p className="text-sm text-ink-soft">Lo recibió la garita{p.unitLabel && ` · ${p.unitLabel}`}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
