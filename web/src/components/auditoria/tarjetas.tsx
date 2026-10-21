'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { TagManual, TagTipo } from '@/components/dominio/tag-tipo'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { fechaHora } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import type { AuditRow } from '@/lib/queries/auditoria'
import { cn } from '@/lib/utils'
import { Movimientos } from './movimientos'
import { ESTADO_TAG, vigenciaCorta } from './tabla'

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-semibold text-ink-soft">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-[13px] tabular">{children}</dd>
    </div>
  )
}

/**
 * La auditoría como tarjetas: lo que la tabla no puede ser en un celular.
 * Arriba quién y cómo terminó; abajo cuándo entró y salió. Si entró más de
 * una vez, se despliega el detalle de cada ingreso.
 */
export function Tarjetas({ filas }: { filas: AuditRow[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filas.map((r) => {
        const abierto = abierta === r.id
        return (
          <li key={r.id} className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 text-[15px] font-semibold leading-snug">{r.guestName}</span>
                  <TagTipo kind={r.kind} frequentAs={r.frequentAs} tradeName={r.tradeName} />
                  {r.manual && <TagManual />}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                  {[r.unitLabel, quienInvita(r.inviterName)].join(' · ')}
                </p>
                {(r.guestDoc || r.plate) && (
                  <p className="truncate text-[13px] text-ink-soft tabular">
                    {[r.guestDoc && `DNI ${r.guestDoc}`, r.plate].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <EstadoTag estado={ESTADO_TAG[r.status]} contexto="garita" />
            </div>

            {r.status === 'anulada' && r.revokedReason !== null && (
              <p className="text-[13px] text-ink-soft">Anulada por portería{r.revokedReason ? `: ${r.revokedReason}` : ''}</p>
            )}

            <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
              <Dato etiqueta="Vigencia">{vigenciaCorta(r)}</Dato>
              <Dato etiqueta="Ingreso">{r.enteredAt ? fechaHora(r.enteredAt) : '—'}</Dato>
              <Dato etiqueta="Salida">
                {r.exitedAt ? fechaHora(r.exitedAt) : r.status === 'adentro' ? 'Sigue adentro' : '—'}
              </Dato>
            </dl>

            {r.enteredCount > 0 && (
              <>
                <p className="text-xs text-ink-soft">
                  {r.guardName ? `Ingreso: ${r.guardName}` : 'Guardia sin registrar'}
                  {r.exitedAt && ` · Salida: ${r.exitGuardName ?? 'sin registrar'}`}
                </p>
                {(r.enteredCount > 1 || r.manual) && (
                  <>
                    <button type="button" onClick={() => setAbierta(abierto ? null : r.id)} aria-expanded={abierto}
                      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-semibold">
                      {abierto ? 'Ocultar' : 'Ver'} {r.enteredCount > 1 ? `los ${r.enteredCount} ingresos` : 'el ingreso'}
                      <ChevronDown className={cn('size-4 transition-transform duration-200', abierto && 'rotate-180')} aria-hidden />
                    </button>
                    {abierto && <Movimientos id={r.id} />}
                  </>
                )}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
