'use client'
import { Marca } from '@/components/dominio/marca'
import { LogoPazzit } from '@/components/dominio/logo-pazzit'
import { Pase } from '@/components/dominio/pase'
import type { Marca as DatosMarca } from '@/lib/marca'

/**
 * Cómo se va a ver el color/logo que se está editando, antes de guardar:
 * el header (logo o nombre) y el pase con el punto del color del barrio. Usa los
 * componentes reales con `marcaOverride` — no una copia aparte — para que
 * la vista previa sea exactamente lo que se va a ver, no una aproximación
 * que se puede desalinear con el tiempo.
 */
export function VistaPreviaMarca({ marca }: { marca: DatosMarca }) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-sunk p-4">
      <p className="text-[13px] font-semibold text-ink-soft">Así se ve</p>

      <div className="flex h-14 items-center gap-2.5 rounded-md border border-line bg-card px-4">
        <LogoPazzit variante="mark" ancho={24} alt="" />
        <Marca marcaOverride={marca} />
      </div>

      <Pase marcaOverride={marca} qr="vista-previa" datos={{
        tipo: 'Visita', vigencia: 'Hoy', invitado: 'Nombre del invitado', unidad: 'Lote 142', invita: 'Vecino',
      }} className="max-w-none" />
    </div>
  )
}
