'use client'
import { Marca } from '@/components/dominio/marca'
import { Pase } from '@/components/dominio/pase'
import type { Marca as DatosMarca } from '@/lib/marca'

/**
 * Cómo se va a ver el color/logo que se está editando, antes de guardar:
 * el header (logo, o mark de Pazzit en su color y nombre) y el pase. Usa los
 * componentes reales con `marcaOverride` — no una copia aparte — para que
 * la vista previa sea exactamente lo que se va a ver, no una aproximación
 * que se puede desalinear con el tiempo.
 */
export function VistaPreviaMarca({ marca }: { marca: DatosMarca }) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-sunk p-4">
      <p className="text-[13px] font-semibold text-ink-soft">Así se ve</p>

      {/* El acento de la página es el color guardado: acá se pisa con el que se está eligiendo. */}
      <div className="flex h-14 items-center rounded-md border border-line bg-card px-4"
        style={{ '--azul': marca.color } as React.CSSProperties}>
        <Marca conPazzit marcaOverride={marca} />
      </div>

      <Pase marcaOverride={marca} qr="vista-previa" datos={{
        tipo: 'Visita', vigencia: 'Hoy', invitado: 'Nombre del invitado', unidad: 'Lote 142', invita: 'Vecino',
      }} className="max-w-none" />
    </div>
  )
}
