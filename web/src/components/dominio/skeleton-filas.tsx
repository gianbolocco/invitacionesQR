import { Skeleton } from '@/components/ui/skeleton'

/** La forma de una lista de filas mientras llega: título, meta y etiqueta. */
export function SkeletonFilas({ filas = 4 }: { filas?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      <span className="sr-only">Cargando…</span>
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
  )
}
