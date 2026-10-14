'use client'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda } from '@/lib/queries/garita'
import { useCampoLectora } from '@/lib/use-lectora'
import { interpretarLectura, type Lectura } from '@/lib/lectora'

/** Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos. */
export function BuscarInvitado({ q, onQ, onAbrir, onLectura }: {
  q: string
  onQ: (q: string) => void
  onAbrir: (id: string) => void
  onLectura: (l: Lectura) => void
}) {
  const qDemorada = useDemora(q)
  const teclaLectura = useCampoLectora(q, (l) => { onQ(''); onLectura(l) })
  // El texto crudo de una lectura no se busca: lo resuelve onLectura.
  const busqueda = useBusqueda(interpretarLectura(qDemorada) ? '' : qDemorada.trim())

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <Input type="search" value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={teclaLectura}
          placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
          className="h-12 pl-10 text-base" />
      </div>

      {busqueda.data && busqueda.data.length > 0 && (
        <div>
          {busqueda.data.map((h) => (
            <Fila key={h.id} titulo={h.guestName} onClick={() => onAbrir(h.id)}
              meta={[h.unitLabel, h.guestDoc, h.plate].filter(Boolean).join(' · ')}
              extremo={h.adentro ? <EstadoTag estado="adentro" /> : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
