'use client'
import { Marca } from '@/components/dominio/marca'
import { Pase } from '@/components/dominio/pase'
import type { Marca as DatosMarca } from '@/lib/marca'

/**
 * Cómo se va a ver el color/logo que se está editando, antes de guardar:
 * la banda del vecino y el pase del invitado, en miniatura. Usa los
 * componentes reales con `marcaOverride` — no una copia aparte — para que
 * la vista previa sea exactamente lo que se va a ver, no una aproximación
 * que se puede desalinear con el tiempo.
 */
export function VistaPreviaMarca({ marca }: { marca: DatosMarca }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-sunk p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Así se ve</p>

      <div className="overflow-hidden rounded-md" style={{ backgroundColor: marca.color }}>
        <div className="flex h-12 items-center px-3">
          <Marca variante="banda" marcaOverride={marca} />
        </div>
      </div>

      <Pase marcaOverride={marca} qr="vista-previa" datos={{
        tipo: 'Visita', vigencia: 'Hoy', invitado: 'Nombre del invitado', unidad: 'Lote 142', invita: 'Vecino',
      }} className="max-w-none" />
    </div>
  )
}
