'use client'
import { Fragment, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Inbox } from 'lucide-react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { hoyISO, sumarDias, fechaNumerica, fechaHora, horaODia } from '@/lib/fechas'
import { ChromeAdmin } from '@/components/admin/chrome'
import { ChromeGarita } from '@/components/garita/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Button } from '@/components/ui/button'

type AuditRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  validFrom: string
  validTo: string
  status: 'adentro' | 'concluida' | 'esperando' | 'vencida' | 'anulada'
  enteredAt: string | null
  enteredCount: number
  guardName: string | null
  exitedAt: string | null
  exitGuardName: string | null
}

const ESTADO: Record<AuditRow['status'], { label: string; clase: string }> = {
  adentro: { label: 'Adentro', clase: 'text-marca font-bold' },
  concluida: { label: 'Concluida', clase: 'text-marca' },
  esperando: { label: 'Pendiente', clase: '' },
  vencida: { label: 'Vencida', clase: 'text-peligro' },
  anulada: { label: 'Anulada', clase: 'opacity-60' },
}

type Movimiento = {
  id: string
  enteredAt: string
  exitedAt: string | null
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
const ATAJOS = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7', etiqueta: '7 días' },
  { valor: '30', etiqueta: '30 días' },
] as const

export default function AuditoriaPage() {
  const me = useMe()
  const [from, setFrom] = useState(sumarDias(hoyISO(), -7))
  const [to, setTo] = useState(hoyISO())
  const [estado, setEstado] = useState<'todos' | AuditRow['status']>('todos')
  const [page, setPage] = useState(1)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)

  async function desplegar(id: string) {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id)
    setMovimientos(null)
    setMovimientos(await api<Movimiento[]>(`/gate/audit/${id}/entries`).catch(() => []))
  }

  // Sin page/pageSize: la usa también el link de exportar, que trae todo el rango.
  const filtros = useCallback(() => {
    const p = new URLSearchParams({ from, to })
    if (estado !== 'todos') p.set('status', estado)
    return p
  }, [from, to, estado])

  // TanStack Query, no un efecto a mano: antes, cambiar de filtro rápido
  // podía pintar una respuesta vieja encima de una más nueva si llegaban
  // desordenadas. Query cancela la consulta anterior sola.
  const consulta = useQuery({
    queryKey: ['auditoria', from, to, estado, page],
    enabled: Boolean(me),
    queryFn: ({ signal }) => {
      const p = filtros()
      p.set('page', String(page))
      p.set('pageSize', String(PAGE_SIZE))
      return api<Pagina>(`/gate/audit?${p}`, { signal })
    },
  })

  function aplicarAtajo(valor: typeof ATAJOS[number]['valor']) {
    setTo(hoyISO())
    setFrom(valor === 'hoy' ? hoyISO() : sumarDias(hoyISO(), -Number(valor)))
    setPage(1)
    setAbierta(null)
  }

  if (!me) return <main className="p-6">Cargando…</main>
  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>La auditoría es de la guardia y la administración.</p></main>
  }

  const lista = consulta.data?.rows ?? []
  const counts = consulta.data?.counts
  const total = consulta.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const todos = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  // Se llega acá desde las dos secciones (bug reportado: sin esto, la
  // pantalla no tenía ninguna forma de volver ni de navegar a otro lado).
  // Cada rol ve el marco de su propia sección, con el resto de su menú.
  const Chrome = me.role === 'admin' ? ChromeAdmin : ChromeGarita

  return (
    <Chrome>
      <div className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Auditoría" />

      <div className="flex flex-wrap items-end gap-3">
        {/* Botones sueltos, no Chips: un atajo es una acción de un solo toque,
            no un filtro con una selección que se mantiene — nada en el rango
            de fechas dice "cuál de los tres tocaste por última vez". */}
        <div role="group" aria-label="Rango rápido" className="flex gap-1.5">
          {ATAJOS.map((a) => (
            <Button key={a.valor} type="button" variant="outline" size="sm" onClick={() => aplicarAtajo(a.valor)}>
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <CampoFecha id="desde" valor={from} onCambio={(v) => { setFrom(v); setPage(1) }} className="w-40" />
        <CampoFecha id="hasta" valor={to} onCambio={(v) => { setTo(v); setPage(1) }} className="w-40" />
        <a href={`${apiBase}/gate/audit.xlsx?${filtros()}`}
          className="inline-flex min-h-11 items-center rounded-md bg-marca px-4 text-sm font-semibold text-sobre-marca">
          Exportar a Excel
        </a>
      </div>

      <Chips etiqueta="Estado" valor={estado} onCambio={(v) => { setEstado(v); setPage(1); setAbierta(null) }}
        opciones={[
          { valor: 'todos', etiqueta: 'Todos', contador: todos },
          { valor: 'adentro', etiqueta: 'Adentro', contador: counts?.adentro ?? 0 },
          { valor: 'concluida', etiqueta: 'Concluidas', contador: counts?.concluida ?? 0 },
          { valor: 'esperando', etiqueta: 'Pendientes', contador: counts?.esperando ?? 0 },
          { valor: 'vencida', etiqueta: 'Vencidas', contador: counts?.vencida ?? 0 },
          { valor: 'anulada', etiqueta: 'Anuladas', contador: counts?.anulada ?? 0 },
        ]} />

      {consulta.isPending ? (
        <SkeletonFilas filas={6} />
      ) : consulta.isError ? (
        <ErrorConReintento onReintentar={() => consulta.refetch()} reintentando={consulta.isFetching} />
      ) : lista.length === 0 ? (
        <Vacio icono={Inbox} titulo="No hay invitaciones en ese rango" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface-sunk">
              <tr className="border-b border-line">
                <th className="w-[22%] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Invitado</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Unidad</th>
                <th className="w-[14%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Fecha</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Estado</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Ingreso</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Salida</th>
                <th className="w-[16%] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Guardia</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-line">
                    <td className="px-4 py-3 font-semibold">{r.guestName}</td>
                    <td className="px-3 py-3 tabular">{r.unitLabel}</td>
                    <td className="px-3 py-3 tabular">
                      {r.validFrom === r.validTo ? fechaNumerica(r.validFrom) : `${fechaNumerica(r.validFrom)}–${fechaNumerica(r.validTo)}`}
                    </td>
                    <td className={`px-3 py-3 font-semibold ${ESTADO[r.status].clase}`}>{ESTADO[r.status].label}</td>
                    <td className="px-3 py-3">
                      {r.enteredCount === 0 ? <span className="tabular">—</span> : (
                        <button onClick={() => desplegar(r.id)} aria-expanded={abierta === r.id}
                          className="flex items-center gap-1 tabular underline underline-offset-4">
                          {/* Con fecha si no fue el primer día de la invitación: una frecuente
                              entra muchos días distintos. */}
                          {horaODia(r.enteredAt!, r.validFrom)}{r.enteredCount > 1 && ` ×${r.enteredCount}`}
                          <ChevronDown className={`size-3.5 transition-transform ${abierta === r.id ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular">
                      {/* Entró un día y salió otro: la hora sola parecía del mismo día. */}
                      {r.exitedAt ? horaODia(r.exitedAt, hoyISO(new Date(r.enteredAt ?? r.exitedAt))) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.guardName ?? '—'}
                      {r.exitGuardName && r.exitGuardName !== r.guardName && (
                        <span className="block text-xs opacity-70">salió con {r.exitGuardName}</span>
                      )}
                    </td>
                  </tr>
                  {abierta === r.id && (
                    <tr className="border-b border-line bg-surface-sunk/60">
                      <td colSpan={7} className="px-4 py-3">
                        {movimientos === null ? <SkeletonFilas filas={2} /> : movimientos.length === 0 ? (
                          <p className="text-sm text-ink-soft">Sin movimientos.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {movimientos.map((m) => (
                              <li key={m.id} className="tabular text-sm">
                                {/* fechaHora y no enteredAt.slice(0, 10): esa es la fecha UTC, y a
                                    las 22 acá ya es el día siguiente allá. */}
                                {fechaHora(m.enteredAt)}
                                {' · '}<span className="font-semibold">{m.guestName}</span>
                                {m.guestDoc && ` · ${m.guestDoc}`}{m.plate && ` · ${m.plate}`}
                                {' · lo dejó pasar '}{m.guardName ?? '(sin registrar)'}
                                {m.exitedAt
                                  ? <> · salió {horaODia(m.exitedAt, hoyISO(new Date(m.enteredAt)))}</>
                                  : <> · sin salida registrada</>}
                              </li>
                            ))}
                          </ul>
                        )}
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
          <p className="text-sm text-ink-soft tabular">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</Button>
            <span className="flex min-h-11 items-center px-2 text-sm tabular">{page} de {paginas}</span>
            <Button variant="outline" disabled={page >= paginas} onClick={() => setPage((p) => Math.min(paginas, p + 1))}>Siguiente ›</Button>
          </div>
        </nav>
      )}
      </div>
    </Chrome>
  )
}
