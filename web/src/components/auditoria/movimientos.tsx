'use client'
import { TagManual } from '@/components/dominio/tag-tipo'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { fechaHora } from '@/lib/fechas'
import { useMovimientos } from '@/lib/queries/auditoria'

const guardia = (manual: boolean, nombre: string | null) =>
  manual && nombre ? `Carga manual · ${nombre}` : nombre ?? 'guardia sin registrar'

/**
 * Cada ingreso de una invitación con su salida y sus dos guardias: la fila de
 * la auditoría resume el último; acá están todos. Se pide recién al desplegar.
 */
export function Movimientos({ id }: { id: string }) {
  const q = useMovimientos(id, true)
  if (q.isPending) return <SkeletonFilas filas={2} />
  if (q.isError) return <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
  if (q.data.length === 0) return <p className="text-sm text-ink-soft">Sin movimientos.</p>
  return (
    <ul className="flex flex-col divide-y divide-line/70 text-[13px]">
      {q.data.map((m) => (
        <li key={m.id} className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[1fr_1fr]">
          {/* fechaHora y no enteredAt.slice(0, 10): esa es la fecha UTC, y a
              las 22 acá ya es el día siguiente allá. */}
          <p><span className="text-ink-soft">Ingresó </span><span className="tabular font-medium">{fechaHora(m.enteredAt)}</span>
            <span className="text-ink-soft"> · {guardia(m.manual, m.guardName)}</span>
            {m.manual && !m.guardName && <TagManual className="ml-2 align-middle" />}</p>
          <p><span className="text-ink-soft">Salió </span>
            {m.exitedAt
              ? <><span className="tabular font-medium">{fechaHora(m.exitedAt)}</span><span className="text-ink-soft"> · {guardia(m.manual, m.exitGuardName)}</span></>
              : <span className="font-semibold">Sigue adentro</span>}
          </p>
          {(m.guestName || m.guestDoc || m.plate) && (
            <p className="text-ink-soft sm:col-span-2">
              {[m.guestName, m.guestDoc && `DNI ${m.guestDoc}`, m.plate].filter(Boolean).join(' · ')}
            </p>
          )}
          {m.manual && (m.loadedAt || m.note) && (
            <p className="text-ink-soft sm:col-span-2">
              {[m.loadedAt && `Cargado a mano por ${m.loaderName ?? 'guardia sin registrar'} el ${fechaHora(m.loadedAt)}`, m.note]
                .filter(Boolean).join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
