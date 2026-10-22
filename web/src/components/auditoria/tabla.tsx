'use client'
import { ChevronRight, Repeat, Truck } from 'lucide-react'
import { TagManual } from '@/components/dominio/tag-tipo'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { fechaHora, fechaNumerica, hoyISO } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import { estadoSeguro } from '@/lib/seguro'
import type { AuditRow } from '@/lib/queries/auditoria'
import { cn } from '@/lib/utils'

/** El estado de la auditoría a la etiqueta del sistema: la misma que usa la garita. */
export const ESTADO_TAG: Record<AuditRow['status'], Estado> = {
  adentro: 'adentro', concluida: 'concluida', esperando: 'esperando', vencida: 'vencida', anulada: 'anulada',
}

const TH = 'py-2 text-[13px] font-semibold text-ink-soft'

/** La segunda línea de una celda: el dato que acompaña al principal. */
function Secundaria({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <span className="mt-0.5 block truncate text-xs text-ink-soft tabular">{children}</span>
}

export function vigenciaCorta(r: Pick<AuditRow, 'validFrom' | 'validTo'>): string {
  return r.validFrom === r.validTo
    ? fechaNumerica(r.validFrom)
    : `${fechaNumerica(r.validFrom)}–${fechaNumerica(r.validTo)}`
}

export const COLOR_SEGURO = { por_vencer: 'text-espera', vencido: 'text-alto', sin_cargar: 'text-alto', vigente: 'text-ink', no_aplica: 'text-ink-soft' } as const
export const TEXTO_SEGURO = { por_vencer: 'Por vencer', vencido: 'Vencido', sin_cargar: 'Sin cargar', vigente: 'Vigente', no_aplica: '' } as const

const ICONO = 'inline-flex size-5 shrink-0 items-center justify-center rounded-sm [&_svg]:size-3.5'

/** Es proveedor a secas o una frecuente que viene a trabajar. */
export const esProveedor = (r: Pick<AuditRow, 'kind' | 'frequentAs'>) =>
  r.kind === 'proveedor' || (r.kind === 'frecuente' && r.frequentAs === 'proveedor')

/**
 * Nombre entero, iconos de tipo y la línea secundaria. El botón es el único
 * foco de la fila (Enter/Espacio); su ::after cubre al contenedor `relative`
 * y el clic en cualquier parte abre el detalle.
 */
export function NombreFila({ r, warnDays, onAbrir }: { r: AuditRow; warnDays: number | null; onAbrir: () => void }) {
  const proveedor = esProveedor(r)
  const seguro = proveedor ? estadoSeguro(r, hoyISO(), warnDays) : 'no_aplica'
  const rubro = proveedor ? r.tradeName : null
  const docs = [r.guestDoc && `DNI ${r.guestDoc}`, r.plate].filter(Boolean).join(' · ')
  const aviso = { por_vencer: 'seguro por vencer', vencido: 'seguro vencido', sin_cargar: 'sin seguro' }[seguro as string]
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir() }} aria-label={`Ver detalle de ${r.guestName}`} data-fila={r.id}
          className="min-w-0 break-words rounded-sm text-left font-bold after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          {r.guestName}
        </button>
        {r.kind === 'frecuente' && (
          <span role="img" aria-label="Frecuente" title="Frecuente" className={cn(ICONO, 'bg-azul-tint text-azul-text')}><Repeat aria-hidden /></span>
        )}
        {proveedor && (
          <span role="img" aria-label="Proveedor" title="Proveedor" className={cn(ICONO, 'bg-surface-sunk text-ink-soft')}><Truck aria-hidden /></span>
        )}
        {r.manual && <TagManual />}
      </div>
      {(rubro || aviso || docs) && (
        <p className="mt-0.5 break-words text-xs text-ink-soft tabular">
          {rubro}
          {aviso && (
            <span className={cn('font-semibold', seguro === 'por_vencer' ? 'text-espera' : 'text-alto')}>
              {rubro && ' · '}{aviso}
            </span>
          )}
          {(rubro || aviso) && docs && ' · '}
          {docs}
        </p>
      )}
    </div>
  )
}

/**
 * La auditoría como tabla, para escritorio. Toda la fila abre el detalle en
 * un panel; el botón del nombre es lo que recibe el foco. La cabecera queda
 * fija al hacer scroll.
 */
export function Tabla({ filas, warnDays, onAbrir }: { filas: AuditRow[]; warnDays: number | null; onAbrir: (r: AuditRow) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-card">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
        <thead className="bg-surface-sunk">
          <tr className="border-b border-line">
            <th className={`w-[27%] px-4 ${TH}`}>Invitado</th>
            <th className={`w-[14%] px-3 ${TH}`}>Unidad</th>
            <th className={`w-[10%] px-3 ${TH}`}>Vigencia</th>
            <th className={`w-[12%] px-3 ${TH}`}>Estado</th>
            <th className={`w-[18%] px-3 ${TH}`}>Ingreso</th>
            <th className={`w-[16%] px-3 ${TH}`}>Salida</th>
            <th className="w-10"><span className="sr-only">Detalle</span></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.id} onClick={() => onAbrir(r)}
              className="cursor-pointer border-b border-line align-top transition-colors duration-150 hover:bg-surface-sunk/40">
              <td className="relative px-4 py-3">
                <NombreFila r={r} warnDays={warnDays} onAbrir={() => onAbrir(r)} />
              </td>
              <td className="px-3 py-3">
                <span className="block tabular">{r.unitLabel}</span>
                <Secundaria>{quienInvita(r.inviterName)}</Secundaria>
              </td>
              <td className="px-3 py-3 tabular">{vigenciaCorta(r)}</td>
              <td className="px-3 py-3">
                <EstadoTag estado={ESTADO_TAG[r.status]} contexto="garita" />
                {r.status === 'anulada' && r.revokedReason !== null && (
                  <span title={r.revokedReason} className="mt-1 block truncate text-xs text-ink-soft">
                    {r.revokedReason || 'Por portería'}
                  </span>
                )}
              </td>
              <td className="px-3 py-3">
                {r.enteredCount === 0 ? <span className="tabular text-ink-soft">—</span> : (
                  <>
                    <span className="block tabular">{fechaHora(r.enteredAt!)}</span>
                    <Secundaria>{r.guardName ?? 'Guardia sin registrar'}</Secundaria>
                  </>
                )}
              </td>
              <td className="px-3 py-3">
                {r.exitedAt ? (
                  <>
                    <span className="block tabular">{fechaHora(r.exitedAt)}</span>
                    <Secundaria>{r.exitGuardName ?? 'Guardia sin registrar'}</Secundaria>
                  </>
                ) : r.status === 'adentro' ? (
                  <span className="font-semibold">Sigue adentro</span>
                ) : <span className="tabular text-ink-soft">—</span>}
              </td>
              <td className="py-3 pr-3 text-ink-soft"><ChevronRight className="size-4" aria-hidden /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
