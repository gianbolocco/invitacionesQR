'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda } from '@/lib/queries/garita'

/** Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos. */
export function BuscarInvitado({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('')
  const qDemorada = useDemora(q)
  const busqueda = useBusqueda(qDemorada.trim())

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
          className="h-12 pl-10 text-base" />
      </div>

      {busqueda.data?.length === 0 && (
        <p className="text-sm text-ink-soft">Sin resultados. Probá con el apellido o la unidad.</p>
      )}

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
