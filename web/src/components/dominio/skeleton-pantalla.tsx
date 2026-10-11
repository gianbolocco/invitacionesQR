import { Skeleton } from '@/components/ui/skeleton'

/**
 * La forma de una pantalla de lista mientras llega: antetítulo, título y
 * filas. Que el hueco coincida con lo que viene es lo que evita el salto.
 */
export function SkeletonPantalla({ filas = 5 }: { filas?: number }) {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line py-4">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
