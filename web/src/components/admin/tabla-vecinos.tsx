'use client'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { Button } from '@/components/ui/button'
import type { AccionFila } from '@/components/admin/menu-fila'
import { fechaConAnio } from '@/lib/fechas'
import type { Person } from '@/lib/admin'
import { cn } from '@/lib/utils'

const TAG: Record<Person['status'], Estado> = { active: 'activo', invited: 'invitado', disabled: 'deshabilitado' }
const TH = 'py-2 text-[13px] font-semibold text-ink-soft'

/**
 * El padrón como tabla, para escritorio: cada dato en su columna y las acciones
 * siempre en el mismo lugar, a la derecha. Los botones son de texto, sin borde:
 * seis botones con contorno por fila se leían como un muro; así la mirada va al
 * nombre y las acciones aparecen cuando se las busca. La baja va en rojo.
 */
export function TablaVecinos({ vecinos, acciones }: {
  vecinos: Person[]
  acciones: (p: Person) => AccionFila[]
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-card">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-surface-sunk">
          <tr className="border-b border-line">
            <th className={`px-4 ${TH}`}>Vecino</th>
            <th className={`px-3 ${TH}`}>Lote</th>
            <th className={`px-3 ${TH}`}>Cuenta</th>
            <th className={`px-3 ${TH}`}>Último acceso</th>
            <th className={`px-4 text-right ${TH}`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {vecinos.map((p) => (
            <tr key={p.id} className={cn('border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface-sunk/50',
              p.status === 'disabled' && 'opacity-55')}>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.role === 'admin' && (
                    <span className="rounded-sm bg-surface-sunk px-1.5 py-0.5 text-[13px] font-bold leading-4 text-ink-soft">
                      Admin
                    </span>
                  )}
                </span>
                {p.email && <span className="mt-0.5 block truncate text-xs text-ink-soft">{p.email}</span>}
              </td>
              <td className="px-3 py-3 tabular">
                {p.units.length > 0
                  ? p.units.map((u) => u.label).join(' · ')
                  : <span className="text-ink-soft">{p.role === 'admin' ? '—' : 'Sin lote'}</span>}
              </td>
              <td className="px-3 py-3"><EstadoTag estado={TAG[p.status]} /></td>
              <td className="px-3 py-3 tabular text-ink-soft">
                {p.lastLoginAt ? fechaConAnio(p.lastLoginAt) : 'Sin ingresos'}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-0.5">
                  {acciones(p).map((a) => (
                    <Button key={a.etiqueta} type="button" variant="ghost" size="sm" disabled={a.deshabilitada}
                      aria-label={`${a.etiqueta}: ${p.name}`} title={a.etiqueta}
                      onClick={(e) => a.onClick(e.currentTarget)}
                      className={cn('px-2.5 text-ink-soft hover:text-ink',
                        a.destructiva && 'text-alto/80 hover:bg-alto-tint hover:text-alto')}>
                      {a.corta ?? a.etiqueta}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
