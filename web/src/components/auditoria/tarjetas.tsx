'use client'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { fechaHora } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import type { AuditRow } from '@/lib/queries/auditoria'
import { ESTADO_TAG, NombreFila, vigenciaCorta } from './tabla'

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-semibold text-ink-soft">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-[13px] tabular">{children}</dd>
    </div>
  )
}

/** La auditoría como tarjetas, para el celular. Toda la tarjeta abre el detalle en un panel. */
export function Tarjetas({ filas, warnDays, onAbrir }: { filas: AuditRow[]; warnDays: number | null; onAbrir: (r: AuditRow) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filas.map((r) => (
        <li key={r.id} className="relative flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <NombreFila r={r} warnDays={warnDays} onAbrir={() => onAbrir(r)} />
              <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                {[r.unitLabel, quienInvita(r.inviterName)].join(' · ')}
              </p>
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
        </li>
      ))}
    </ul>
  )
}
