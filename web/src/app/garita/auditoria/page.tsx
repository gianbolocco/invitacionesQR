'use client'
import { useCallback, useEffect, useState } from 'react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { esDeNoche, hora } from '@/lib/gate'
import { hoyISO } from '@/lib/invitations'
import { GaritaShell } from '@/components/garita-shell'
import { Eyebrow } from '@/components/ui'

type AuditRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  eventName: string | null
  unitLabel: string
  inviterName: string
  validFrom: string
  validTo: string
  status: 'entro' | 'esperando' | 'vencida' | 'anulada'
  enteredAt: string | null
  enteredCount: number
  guardName: string | null
}

const ESTADO: Record<AuditRow['status'], { label: string; clase: string }> = {
  entro: { label: 'Entró', clase: 'text-alamo' },
  esperando: { label: 'Esperando', clase: '' },
  vencida: { label: 'No entró', clase: 'text-deny-field' },
  anulada: { label: 'Anulada', clase: 'opacity-60' },
}

function haceDias(n: number): string {
  const d = new Date(`${hoyISO()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
    .format(new Date(y, m - 1, d))
}

export default function AuditoriaPage() {
  const me = useMe()
  const [oscuro, setOscuro] = useState(false)
  const [from, setFrom] = useState(haceDias(30))
  const [to, setTo] = useState(hoyISO())
  const [estado, setEstado] = useState<'todos' | AuditRow['status']>('todos')
  const [filas, setFilas] = useState<AuditRow[] | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOscuro(esDeNoche())
  }, [])

  const qs = useCallback(() => new URLSearchParams({ from, to }).toString(), [from, to])

  useEffect(() => {
    if (!me) return
    api<AuditRow[]>(`/gate/audit?${qs()}`).then(setFilas).catch(() => setFilas([]))
  }, [me, qs])

  if (!me) return <main className="p-6">Cargando…</main>

  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>Esta pantalla es de la garita.</p></main>
  }

  const todas = filas ?? []
  const lista = estado === 'todos' ? todas : todas.filter((r) => r.status === estado)
  const borde = oscuro ? 'border-white/20' : 'border-ink/12'
  const conteo = (s: AuditRow['status']) => todas.filter((r) => r.status === s).length

  return (
    <GaritaShell oscuro={oscuro} onTema={() => setOscuro((v) => !v)} guardName={me.name}>
      <div className="flex flex-col gap-5">
        <h1 className="display text-2xl">Auditoría</h1>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Desde
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className={`tabular min-h-11 rounded border ${borde} bg-white px-3 text-ink`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Hasta
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className={`tabular min-h-11 rounded border ${borde} bg-white px-3 text-ink`} />
          </label>
          <a href={`${apiBase}/gate/audit.csv?${qs()}`}
            className="inline-flex min-h-11 items-center rounded bg-alamo px-4 text-sm
              font-semibold text-white">
            Exportar a Excel
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['todos', `Todos (${todas.length})`],
            ['entro', `Entraron (${conteo('entro')})`],
            ['esperando', `Esperando (${conteo('esperando')})`],
            ['vencida', `No entraron (${conteo('vencida')})`],
            ['anulada', `Anuladas (${conteo('anulada')})`],
          ] as const).map(([valor, label]) => (
            <button key={valor} onClick={() => setEstado(valor)}
              aria-pressed={estado === valor}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                estado === valor ? 'border-alamo bg-alamo text-white' : borde
              }`}>
              {label}
            </button>
          ))}
        </div>

        {filas === null && <p className="opacity-70">Cargando…</p>}
        {filas !== null && lista.length === 0 && (
          <p className="opacity-70">No hay invitaciones en ese rango.</p>
        )}

        {lista.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead>
                <tr className={`border-b ${borde}`}>
                  {['Invitado', 'Documento', 'Unidad', 'Invitó', 'Fecha', 'Estado', 'Ingreso', 'Guardia']
                    .map((h) => <th key={h} className="py-2 pr-4"><Eyebrow>{h}</Eyebrow></th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className="border-b border-current/10">
                    <td className="py-2.5 pr-4">
                      <span className="font-semibold">{r.guestName}</span>
                      {r.eventName && (
                        <span className="block text-xs opacity-70">en {r.eventName}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tabular">{r.guestDoc ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular">{r.unitLabel}</td>
                    <td className="py-2.5 pr-4">{r.inviterName}</td>
                    <td className="py-2.5 pr-4 tabular">
                      {r.validFrom === r.validTo
                        ? fechaCorta(r.validFrom)
                        : `${fechaCorta(r.validFrom)}–${fechaCorta(r.validTo)}`}
                    </td>
                    <td className={`py-2.5 pr-4 font-semibold ${ESTADO[r.status].clase}`}>
                      {ESTADO[r.status].label}
                      {r.enteredCount > 1 && (
                        <span className="tabular font-normal"> ×{r.enteredCount}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tabular">
                      {r.enteredAt ? hora(r.enteredAt) : '—'}
                    </td>
                    <td className="py-2.5 pr-4">{r.guardName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </GaritaShell>
  )
}
