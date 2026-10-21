'use client'
import { memo } from 'react'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { TagTipo } from '@/components/dominio/tag-tipo'
import { IconoNota } from '@/components/garita/icono-nota'
import { quienInvita } from '@/lib/invitations'
import type { AgendaRow } from '@/lib/queries/garita'
import { detalleDe, estadoDe } from '@/components/garita/datos-agenda'

const TH = 'py-2 text-[13px] font-semibold text-ink-soft'

/**
 * La misma agenda como tabla densa: cabe el doble de gente en pantalla y se
 * recorre con los ojos de arriba abajo. Cada fila es clickeable entera, y el
 * nombre es un botón real para llegar con el teclado.
 */
export function Compacta({ filas, hoy, onAbrir }: {
  filas: AgendaRow[]
  hoy: string
  onAbrir: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-surface-sunk">
          <tr className="border-b border-line">
            <th className={`px-4 ${TH}`}>Invitado</th>
            <th className={`px-3 ${TH}`}>Unidad</th>
            <th className={`px-3 ${TH}`}>Documento · patente</th>
            <th className={`px-4 text-right ${TH}`}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => <FilaCompacta key={r.id} r={r} hoy={hoy} onAbrir={onAbrir} />)}
        </tbody>
      </table>
    </div>
  )
}

// Con memo, como las filas de la lista: un aviso no redibuja las que no cambiaron.
const FilaCompacta = memo(function FilaCompacta({ r, hoy, onAbrir }: { r: AgendaRow; hoy: string; onAbrir: (id: string) => void }) {
  return (
    <tr onClick={() => onAbrir(r.id)}
      className="cursor-pointer border-b border-line last:border-b-0 transition-colors duration-150 hover:bg-surface-sunk/70">
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(r.id) }}
            className="min-w-0 truncate text-left font-semibold">{r.guestName}</button>
          <IconoNota nota={r.note} />
          <TagTipo kind={r.kind} frequentAs={r.frequentAs} />
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="block tabular">{r.unitLabel}</span>
        <span className="block truncate text-xs text-ink-soft">{quienInvita(r.inviterName)}</span>
      </td>
      <td className="px-3 py-2.5 tabular text-ink-soft">
        {[r.guestDoc, r.plate].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        <EstadoTag estado={estadoDe(r, hoy)} detalle={detalleDe(r, hoy)} contexto="garita" />
      </td>
    </tr>
  )
})
