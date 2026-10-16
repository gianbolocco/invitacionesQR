'use client'
import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { TagManual, TagTipo } from '@/components/dominio/tag-tipo'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { fechaHora, fechaNumerica } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import type { AuditRow } from '@/lib/queries/auditoria'
import { cn } from '@/lib/utils'
import { Movimientos } from './movimientos'

/** El estado de la auditoría a la etiqueta del sistema: la misma que usa la garita. */
export const ESTADO_TAG: Record<AuditRow['status'], Estado> = {
  adentro: 'adentro', concluida: 'concluida', esperando: 'esperando', vencida: 'vencida', anulada: 'anulada',
}

const TH = 'py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft'

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

/**
 * La auditoría como tabla, para escritorio. La fila con ingresos se despliega
 * para ver cada uno con su salida y sus guardias. La cabecera queda fija al
 * hacer scroll.
 */
export function Tabla({ filas }: { filas: AuditRow[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
        <thead className="bg-surface-sunk">
          <tr className="border-b border-line">
            <th className={`w-[26%] px-4 ${TH}`}>Invitado</th>
            <th className={`w-[15%] px-3 ${TH}`}>Unidad</th>
            <th className={`w-[10%] px-3 ${TH}`}>Vigencia</th>
            <th className={`w-[12%] px-3 ${TH}`}>Estado</th>
            <th className={`w-[19%] px-3 ${TH}`}>Ingreso</th>
            <th className={`w-[18%] px-4 ${TH}`}>Salida</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => {
            const abierto = abierta === r.id
            const conIngresos = r.enteredCount > 0
            return (
              <Fragment key={r.id}>
                <tr className={cn('border-b border-line align-top transition-colors duration-150',
                  abierto ? 'bg-surface-sunk/60' : 'hover:bg-surface-sunk/40')}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 truncate font-semibold">{r.guestName}</span>
                      <TagTipo kind={r.kind} />
                      {r.manual && <TagManual />}
                    </span>
                    <Secundaria>{[r.guestDoc && `DNI ${r.guestDoc}`, r.plate].filter(Boolean).join(' · ')}</Secundaria>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block tabular">{r.unitLabel}</span>
                    <Secundaria>{quienInvita(r.inviterName)}</Secundaria>
                  </td>
                  <td className="px-3 py-3 tabular">{vigenciaCorta(r)}</td>
                  <td className="px-3 py-3">
                    <EstadoTag estado={ESTADO_TAG[r.status]} />
                    {r.status === 'anulada' && r.revokedReason && (
                      <span title={r.revokedReason} className="mt-1 block truncate text-xs text-ink-soft">{r.revokedReason}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {!conIngresos ? <span className="tabular text-ink-soft">—</span> : (
                      <>
                        <span className="flex items-center gap-1.5 tabular">
                          {fechaHora(r.enteredAt!)}
                          {r.enteredCount > 1 && (
                            <button type="button" onClick={() => setAbierta(abierto ? null : r.id)}
                              aria-expanded={abierto} aria-label={`Ver los ${r.enteredCount} ingresos de ${r.guestName}`}
                              className="inline-flex min-h-7 items-center gap-0.5 rounded-sm bg-surface-sunk px-1.5 text-xs font-bold hover:bg-line">
                              ×{r.enteredCount}
                              <ChevronDown className={cn('size-3 transition-transform duration-200', abierto && 'rotate-180')} aria-hidden />
                            </button>
                          )}
                        </span>
                        <Secundaria>{r.guardName ?? 'Guardia sin registrar'}</Secundaria>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.exitedAt ? (
                      <>
                        <span className="block tabular">{fechaHora(r.exitedAt)}</span>
                        <Secundaria>{r.exitGuardName ?? 'Guardia sin registrar'}</Secundaria>
                      </>
                    ) : r.status === 'adentro' ? (
                      <span className="font-semibold">Sigue adentro</span>
                    ) : <span className="tabular text-ink-soft">—</span>}
                  </td>
                </tr>
                {abierto && (
                  <tr className="border-b border-line bg-surface-sunk/60">
                    <td colSpan={6} className="px-4 pb-3 pt-1"><Movimientos id={r.id} /></td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
