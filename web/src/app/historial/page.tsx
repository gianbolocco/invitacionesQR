'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { KIND_LABEL, fechaCorta, vigencia, type Invitation } from '@/lib/invitations'
import { Shell } from '@/components/shell'
import { Button, Eyebrow, Filete, Vacio } from '@/components/ui'
import { SkeletonTarjetas, Cargando } from '@/components/feedback'

type Pagina = { rows: Invitation[]; total: number; page: number; pageSize: number }

const TIPOS = [
  { id: '', label: 'Todos' },
  ...Object.entries(KIND_LABEL).map(([id, label]) => ({ id, label })),
]

const ESTADOS = [
  { id: '', label: 'Todas' },
  { id: 'entro', label: 'Entró' },
  { id: 'no_entro', label: 'No entró' },
  { id: 'anulada', label: 'Anuladas' },
]

const POR_PAGINA = 20

function Chips({ opciones, valor, onElegir, etiqueta }: {
  opciones: { id: string; label: string }[]
  valor: string
  onElegir: (v: string) => void
  etiqueta: string
}) {
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">{etiqueta}</legend>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <button key={o.id} type="button" onClick={() => onElegir(o.id)}
            aria-pressed={valor === o.id}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
              valor === o.id
                ? 'border-alamo bg-alamo text-surface'
                : 'border-line bg-card text-ink-soft'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function HistorialPage() {
  const me = useMe()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [estado, setEstado] = useState('')
  const [soloMias, setSoloMias] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Pagina | null>(null)
  const [cargando, setCargando] = useState(false)

  const buscar = useCallback((senal: AbortSignal) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(POR_PAGINA) })
    if (q.trim()) p.set('q', q.trim())
    if (kind) p.set('kind', kind)
    if (estado) p.set('estado', estado)
    if (soloMias) p.set('soloMias', 'true')

    setCargando(true)
    api<Pagina>(`/invitations/historial?${p}`, { signal: senal })
      .then((r) => { setData(r); setCargando(false) })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setData({ rows: [], total: 0, page: 1, pageSize: POR_PAGINA })
        setCargando(false)
      })
  }, [q, kind, estado, soloMias, page])

  /*
   * 300ms de espera antes de pedir: el vecino tipea "martin" y eso son seis
   * teclas, no seis búsquedas. El abort corta la anterior para que una
   * respuesta lenta no llegue tarde y pise el resultado de la última.
   */
  useEffect(() => {
    if (!me) return
    const ac = new AbortController()
    const t = setTimeout(() => buscar(ac.signal), 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [me, buscar])

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  // Cualquier cambio de filtro vuelve a la primera página: quedarse en la
  // página 4 de un resultado que ahora tiene 5 filas muestra una lista vacía.
  function filtrar(aplicar: () => void) {
    aplicar()
    setPage(1)
  }

  const total = data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const hayFiltro = Boolean(q.trim() || kind || estado || soloMias)

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-5">
        <h1 className="display text-2xl">Historial</h1>

        <div className="flex flex-col gap-4">
          <input
            type="search"
            value={q}
            onChange={(e) => filtrar(() => setQ(e.target.value))}
            placeholder="Buscar por nombre, documento o patente"
            aria-label="Buscar en el historial"
            className="min-h-12 w-full rounded border border-line bg-card px-3"
          />

          <Chips etiqueta="Tipo" opciones={TIPOS} valor={kind}
            onElegir={(v) => filtrar(() => setKind(v))} />
          <Chips etiqueta="Estado" opciones={ESTADOS} valor={estado}
            onElegir={(v) => filtrar(() => setEstado(v))} />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloMias}
              onChange={(e) => filtrar(() => setSoloMias(e.target.checked))}
              className="size-5 accent-[#1e6b47]" />
            Solo las mías
          </label>
        </div>

        <p className="eyebrow tabular" aria-live="polite">
          {data === null
            ? 'Buscando…'
            : `${total} ${total === 1 ? 'invitación' : 'invitaciones'}`}
        </p>

        {data === null && <Cargando><SkeletonTarjetas cantidad={4} /></Cargando>}

        {data !== null && data.rows.length === 0 && (
          <Vacio
            titulo={hayFiltro ? 'No hay resultados' : 'Todavía no hay invitaciones'}
            detalle={hayFiltro
              ? 'Probá con otro nombre o sacá algún filtro.'
              : 'Las invitaciones que crees van a quedar acá.'} />
        )}

        {/* La lista se atenúa mientras llega la página nueva en vez de
            desaparecer: el salto al esqueleto en cada tecla marea. */}
        <ul className={`flex flex-col gap-3 transition-opacity ${cargando ? 'opacity-50' : ''}`}>
          {data?.rows.map((inv) => (
            <li key={inv.id}>
              <Filete className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3.5">
                <div className="min-w-0">
                  <Eyebrow>{KIND_LABEL[inv.kind]} · {fechaCorta(inv.createdAt.slice(0, 10))}</Eyebrow>
                  <p className="display truncate text-lg">{inv.guestName}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {vigencia(inv)}
                    {inv.createdBy !== me.id && ` · por ${inv.creatorName}`}
                  </p>
                  <p className="mt-0.5 text-sm">
                    {inv.revokedAt
                      ? <span className="text-deny-field">Anulada</span>
                      : inv.usedCount === 0
                        ? <span className="text-ink-soft">No entró</span>
                        : <span className="text-alamo tabular">
                            {inv.usedCount === 1 ? 'Entró' : `${inv.usedCount} ingresos`}
                          </span>}
                  </p>
                </div>
                <Link
                  href={`/nueva?kind=${inv.kind}&guestName=${encodeURIComponent(inv.guestName)}` +
                    `&guestDoc=${encodeURIComponent(inv.guestDoc ?? '')}` +
                    `&plate=${encodeURIComponent(inv.plate ?? '')}`}
                  className="inline-flex min-h-12 items-center rounded border border-alamo/30 px-4
                    text-sm font-semibold text-alamo">
                  Volver a invitar
                </Link>
              </Filete>
            </li>
          ))}
        </ul>

        {paginas > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
            <Button variant="quiet" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              Anteriores
            </Button>
            <span className="eyebrow tabular">{page} de {paginas}</span>
            <Button variant="quiet" disabled={page >= paginas} onClick={() => setPage((n) => n + 1)}>
              Siguientes
            </Button>
          </nav>
        )}
      </div>
    </Shell>
  )
}
