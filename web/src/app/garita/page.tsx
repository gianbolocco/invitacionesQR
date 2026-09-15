'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { esDeNoche, porId, type Hit, type Resultado } from '@/lib/gate'
import { GaritaShell } from '@/components/garita-shell'
import { Agenda } from '@/components/agenda'
import { Verdict } from '@/components/verdict'

export default function GaritaHome() {
  const me = useMe()
  const [oscuro, setOscuro] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  // El horario no existe en el render del servidor: leerlo ahí daría mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOscuro(esDeNoche())
    const t = setInterval(() => setOscuro(esDeNoche()), 600_000)
    return () => clearInterval(t)
  }, [])

  const abrir = useCallback(async (id: string) => {
    const r = await porId(id).catch(() => null)
    if (r) setResultado(r)
  }, [])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) { setHits(null); return }
    setHits(await api<Hit[]>(`/gate/search?q=${encodeURIComponent(query)}`).catch(() => []))
  }

  function volver() {
    setResultado(null)
    setQuery('')
    setHits(null)
  }

  if (!me) return <main className="p-6">Cargando…</main>

  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>Esta pantalla es de la garita.</p></main>
  }

  if (resultado) {
    return <Verdict resultado={resultado} onSalir={volver} />
  }

  const borde = oscuro ? 'border-white/20' : 'border-ink/12'

  return (
    <GaritaShell oscuro={oscuro} onTema={() => setOscuro((v) => !v)} guardName={me.name}>
      <div className="flex flex-col gap-6">
        {/* El botón es lo primero y lo más grande: es la acción del turno. */}
        <Link href="/garita/escanear"
          className="flex min-h-20 items-center justify-center gap-3 rounded bg-alamo
            text-2xl font-bold text-white">
          <span aria-hidden className="text-3xl">⛶</span>
          Escanear QR
        </Link>

        <form onSubmit={buscar} className="flex flex-col gap-2">
          <label htmlFor="q" className="font-semibold">Buscar</label>
          <div className="flex gap-2">
            <input id="q" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Apellido, unidad o patente"
              className={`min-h-14 min-w-0 flex-1 rounded border ${borde} bg-white px-3 text-lg text-ink`} />
            <button className="min-h-14 shrink-0 rounded bg-alamo px-5 font-semibold text-white">
              Buscar
            </button>
          </div>
        </form>

        {hits !== null && hits.length === 0 && (
          <p className="opacity-70">Sin resultados. Probá con el apellido o la unidad.</p>
        )}

        {hits && hits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button onClick={() => abrir(h.id)}
                  className={`min-h-16 w-full rounded border ${borde} px-4 text-left text-lg`}>
                  <span className="font-semibold">{h.guestName}</span>
                  <span className="opacity-70 tabular"> · {h.unitLabel}{h.plate && ` · ${h.plate}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {hits === null && <Agenda oscuro={oscuro} onAbrir={abrir} />}
      </div>
    </GaritaShell>
  )
}
