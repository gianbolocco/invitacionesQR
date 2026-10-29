'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Campo } from '@/components/dominio/campo'
import { Fila } from '@/components/dominio/fila'
import { useDemora } from '@/lib/use-demora'
import { useBuscarUnidades } from '@/lib/queries/garita'
import { useCampoLectora } from '@/lib/use-lectora'
import type { Lectura } from '@/lib/lectora'
import type { UnidadHit } from '@/lib/gate'

/**
 * Elegir un lote por número o apellido. El campo es de la lectora: una lectura
 * tipeada acá se borra y se la entrega a `alLeer`.
 */
export function BuscadorLote({ id, unidad, onUnidad, alLeer }: {
  id: string
  unidad: UnidadHit | null
  onUnidad: (u: UnidadHit | null) => void
  alLeer: (l: Lectura) => void
}) {
  const [q, setQ] = useState('')
  const qDemorada = useDemora(q)
  const unidades = useBuscarUnidades(unidad ? '' : qDemorada.trim())
  const tecla = useCampoLectora(q, (l) => { setQ(''); alLeer(l) })

  return (
    <Campo id={id} etiqueta="Lote">
      {unidad ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2">
          <span className="text-sm font-semibold">{unidad.unitLabel} · {unidad.residentName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onUnidad(null)}>Cambiar</Button>
        </div>
      ) : (
        <>
          <Input id={id} onKeyDown={tecla} value={q} placeholder="Lote o apellido del vecino"
            onChange={(e) => setQ(e.target.value)} />
          {unidades.data && unidades.data.length > 0 && (
            <div className="mt-1 max-h-48 overflow-auto rounded-md border border-border p-2 [&>*:last-child]:border-b-0">
              {unidades.data.map((u) => (
                <Fila densa key={`${u.unitId}-${u.residentName}`} titulo={u.residentName} meta={u.unitLabel}
                  onClick={() => { onUnidad(u); setQ('') }} />
              ))}
            </div>
          )}
          {unidades.data?.length === 0 && (
            <p className="mt-1 text-sm text-ink-soft">Sin resultados. Probá con el lote o el apellido.</p>
          )}
        </>
      )}
    </Campo>
  )
}
