import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonFilas } from './skeleton-filas'

/**
 * La forma de una pantalla de lista mientras llega: antetítulo, título y
 * filas. Que el hueco coincida con lo que viene es lo que evita el salto.
 */
export function SkeletonPantalla({ filas = 5 }: { filas?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
      </div>
      {/* SkeletonFilas ya aporta role="status", aria-busy y el texto para lectores. */}
      <SkeletonFilas filas={filas} />
    </div>
  )
}
