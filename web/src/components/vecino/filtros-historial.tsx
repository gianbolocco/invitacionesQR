'use client'
import { Chips } from '@/components/dominio/chips'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { KIND_LABEL } from '@/lib/invitations'
import type { FiltrosHistorial } from '@/lib/queries/invitaciones'

type Filtros = Omit<FiltrosHistorial, 'q'>

const TIPOS: { valor: Filtros['kind']; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos' },
  ...(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ valor: k, etiqueta: KIND_LABEL[k] })),
]

const ESTADOS: { valor: Filtros['estado']; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'entro', etiqueta: 'Entró' },
  { valor: 'no_entro', etiqueta: 'No entró' },
  { valor: 'anulada', etiqueta: 'Anuladas' },
]

/** Los filtros del historial. Uno solo para el panel del celular y la columna de escritorio. */
export function FiltrosHistorialPanel({ valor, onCambio }: { valor: Filtros; onCambio: (v: Filtros) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink-soft">Tipo</p>
        <Chips etiqueta="Tipo" valor={valor.kind} opciones={TIPOS} onCambio={(kind) => onCambio({ ...valor, kind })} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink-soft">Estado</p>
        <Chips etiqueta="Estado" valor={valor.estado} opciones={ESTADOS} onCambio={(estado) => onCambio({ ...valor, estado })} />
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <Switch id="solo-mias" checked={valor.soloMias} onCheckedChange={(soloMias) => onCambio({ ...valor, soloMias })} />
        <Label htmlFor="solo-mias">Solo las que creé yo</Label>
      </div>
    </div>
  )
}
