'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda } from '@/lib/queries/garita'
import { AltaExpres } from './alta-expres'

/** Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos. */
export function BuscarInvitado({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('')
  const qDemorada = useDemora(q)
  const busqueda = useBusqueda(qDemorada.trim())
  const [altaAbierta, setAltaAbierta] = useState(false)
  // Estado, no ref leído en el render: así Radix sabe a quién devolverle el
  // foco al cerrar el sheet (mismo patrón que DialogLote/DialogBaja del admin).
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
          className="h-12 pl-10 text-base" />
      </div>

      {busqueda.data?.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">Sin resultados. Probá con el apellido o la unidad.</p>
          <button type="button" onClick={(e) => { setDisparador(e.currentTarget); setAltaAbierta(true) }}
            className="self-start text-sm font-semibold text-marca underline underline-offset-4">
            ¿No tiene invitación? Autorizar ahora
          </button>
        </div>
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

      <AltaExpres abierto={altaAbierta} onAbiertoChange={setAltaAbierta}
        disparador={disparador} onCreada={onAbrir} />
    </div>
  )
}
