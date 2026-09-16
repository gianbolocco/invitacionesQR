'use client'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { hora } from '@/lib/gate'
import { hoyISO } from '@/lib/invitations'
import { GaritaShell } from '@/components/garita-shell'
import { Eyebrow } from '@/components/ui'
import { SkeletonFilas, Cargando } from '@/components/feedback'

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

type Movimiento = {
  id: string
  enteredAt: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  guardName: string | null
}

type Pagina = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<AuditRow['status'], number>
}

const PAGE_SIZE = 25

export default function AuditoriaPage() {
  const me = useMe()
  const [from, setFrom] = useState(haceDias(30))
  const [to, setTo] = useState(hoyISO())
  const [estado, setEstado] = useState<'todos' | AuditRow['status']>('todos')
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [page, setPage] = useState(1)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)

  // Los movimientos se piden al desplegar, no con la tabla: una invitación
  // frecuente puede tener decenas y casi nunca se miran.
  async function desplegar(id: string) {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id)
    setMovimientos(null)
    setMovimientos(await api<Movimiento[]>(`/gate/audit/${id}/entries`).catch(() => []))
  }


  const filtros = useCallback(() => {
    const p = new URLSearchParams({ from, to })
    if (estado !== 'todos') p.set('status', estado)
    return p
  }, [from, to, estado])

  useEffect(() => {
    if (!me) return
    const p = filtros()
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    api<Pagina>(`/gate/audit?${p}`).then(setPagina).catch(() => setPagina(null))
  }, [me, filtros, page])

  // Cambiar un filtro vuelve a la primera página: quedarse en la 4 de una lista
  // que ahora tiene 2 muestra una tabla vacía sin explicar por qué.
  function filtrar<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1); setAbierta(null) }
  }
  const cambiarDesde = filtrar(setFrom)
  const cambiarHasta = filtrar(setTo)
  const cambiarEstado = filtrar<'todos' | AuditRow['status']>(setEstado)

  if (!me) return <main className="p-6">Cargando…</main>

  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>Esta pantalla es de la garita.</p></main>
  }

  const lista = pagina?.rows ?? []
  const counts = pagina?.counts
  const total = pagina?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const todos = counts
    ? counts.entro + counts.esperando + counts.vencida + counts.anulada
    : 0

  return (
    <GaritaShell guardName={me.name}>
      <div className="flex flex-col gap-5">
        <h1 className="display text-2xl">Auditoría</h1>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Desde
            <input type="date" value={from} onChange={(e) => cambiarDesde(e.target.value)}
              className="tabular min-h-11 rounded border border-line bg-card px-3 text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Hasta
            <input type="date" value={to} onChange={(e) => cambiarHasta(e.target.value)}
              className="tabular min-h-11 rounded border border-line bg-card px-3 text-ink" />
          </label>
          <a href={`${apiBase}/gate/audit.xlsx?${filtros()}`}
            className="inline-flex min-h-11 items-center rounded bg-alamo px-4 text-sm
              font-semibold text-surface">
            Exportar a Excel
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['todos', `Todos (${todos})`],
            ['entro', `Entraron (${counts?.entro ?? 0})`],
            ['esperando', `Esperando (${counts?.esperando ?? 0})`],
            ['vencida', `No entraron (${counts?.vencida ?? 0})`],
            ['anulada', `Anuladas (${counts?.anulada ?? 0})`],
          ] as const).map(([valor, label]) => (
            <button key={valor} onClick={() => cambiarEstado(valor)}
              aria-pressed={estado === valor}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                estado === valor ? 'border-alamo bg-alamo text-surface' : 'border-line'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {pagina === null && <Cargando><SkeletonFilas /></Cargando>}
        {pagina !== null && lista.length === 0 && (
          <p className="opacity-70">No hay invitaciones en ese rango.</p>
        )}

        {lista.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  {['Invitado', 'Documento', 'Unidad', 'Invitó', 'Fecha', 'Estado', 'Ingreso', 'Guardia']
                    .map((h) => <th key={h} className="py-2 pr-4"><Eyebrow>{h}</Eyebrow></th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-current/10">
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
                      </td>
                      <td className="py-2.5 pr-4 tabular">
                        {r.enteredCount === 0 ? '—' : (
                          <button onClick={() => desplegar(r.id)}
                            aria-expanded={abierta === r.id}
                            className="underline underline-offset-4">
                            {hora(r.enteredAt!)}
                            {r.enteredCount > 1 && ` ×${r.enteredCount}`}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">{r.guardName ?? '—'}</td>
                    </tr>

                    {/* Lo que antes vivía en la bitácora: cada movimiento con su
                        hora y su guardia, desplegable desde la fila que lo resume. */}
                    {abierta === r.id && (
                      <tr className="border-b border-current/10">
                        <td colSpan={8} className="bg-current/5 px-4 py-3">
                          {movimientos === null && <Cargando><SkeletonFilas cantidad={2} columnas={4} /></Cargando>}
                          {movimientos?.length === 0 && <p className="opacity-70">Sin movimientos.</p>}
                          <ul className="flex flex-col gap-1">
                            {movimientos?.map((m) => (
                              <li key={m.id} className="tabular">
                                {fechaCorta(m.enteredAt.slice(0, 10))} {hora(m.enteredAt)}
                                {' · '}<span className="font-semibold">{m.guestName}</span>
                                {m.guestDoc && ` · ${m.guestDoc}`}
                                {m.plate && ` · ${m.plate}`}
                                {' · lo dejó pasar '}{m.guardName ?? '(sin registrar)'}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm opacity-70 tabular">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="min-h-11 rounded border border-line px-4 text-sm font-semibold
                  disabled:opacity-40">
                ‹ Anterior
              </button>
              <span className="flex min-h-11 items-center px-2 text-sm tabular">
                {page} de {paginas}
              </span>
              <button onClick={() => setPage((p) => Math.min(paginas, p + 1))} disabled={page >= paginas}
                className="min-h-11 rounded border border-line px-4 text-sm font-semibold
                  disabled:opacity-40">
                Siguiente ›
              </button>
            </div>
          </nav>
        )}
      </div>
    </GaritaShell>
  )
}
