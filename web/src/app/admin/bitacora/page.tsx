'use client'
import { useCallback, useEffect, useState } from 'react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { fechaHora, type Unit } from '@/lib/admin'
import { Filete, Eyebrow } from '@/components/ui'

type Entrada = {
  id: string
  enteredAt: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  unitLabel: string
  guardName: string | null
}

export default function BitacoraPage() {
  const me = useMe()
  const [entradas, setEntradas] = useState<Entrada[] | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [unitId, setUnitId] = useState('')

  const qs = useCallback(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (unitId) p.set('unitId', unitId)
    return p.toString()
  }, [from, to, unitId])

  const cargar = useCallback(() => {
    api<Entrada[]>(`/reports/entries?${qs()}`).then(setEntradas).catch(() => setEntradas([]))
  }, [qs])

  useEffect(() => { if (me) { cargar(); api<Unit[]>('/admin/units').then(setUnits).catch(() => {}) } },
    [me, cargar])

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <h1 className="display text-2xl">Bitácora</h1>

        <Filete className="bg-white p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="tabular min-h-11 rounded border border-ink/15 px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="tabular min-h-11 rounded border border-ink/15 px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Unidad
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}
                className="min-h-11 rounded border border-ink/15 px-3">
                <option value="">Todas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </label>
            <a href={`${apiBase}/reports/entries.csv?${qs()}`}
              className="inline-flex min-h-11 items-center rounded border border-alamo/30 px-4
                text-sm font-semibold text-alamo">
              Exportar CSV
            </a>
          </div>
        </Filete>

        {entradas === null && <p className="text-ink-soft">Cargando…</p>}
        {entradas?.length === 0 && (
          <Filete className="bg-white px-5 py-10 text-center">
            <p className="text-ink-soft">No hay ingresos en ese rango.</p>
          </Filete>
        )}

        {entradas && entradas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink/15">
                  {['Fecha', 'Invitado', 'Documento', 'Patente', 'Unidad', 'Guardia'].map((h) => (
                    <th key={h} className="py-2 pr-4"><Eyebrow>{h}</Eyebrow></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entradas.map((e) => (
                  <tr key={e.id} className="border-b border-ink/8">
                    <td className="py-2.5 pr-4 tabular">{fechaHora(e.enteredAt)}</td>
                    <td className="py-2.5 pr-4 font-semibold">{e.guestName}</td>
                    <td className="py-2.5 pr-4 tabular">{e.guestDoc ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular">{e.plate ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular">{e.unitLabel}</td>
                    <td className="py-2.5 pr-4">{e.guardName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  )
}
