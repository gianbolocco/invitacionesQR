'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { Button, Field, ErrorNote, Filete } from '@/components/ui'
import { SkeletonTarjetas, Cargando } from '@/components/feedback'

type Unit = { id: string; label: string }

export default function UnidadesPage() {
  const me = useMe()
  const [units, setUnits] = useState<Unit[] | null>(null)
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cargar = () => api<Unit[]>('/admin/units').then(setUnits).catch(() => setUnits([]))
  useEffect(() => { if (me) cargar() }, [me])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api('/admin/units', { method: 'POST', body: JSON.stringify({ lot: Number(lot) }) })
      setLot('')
      cargar()
    } catch {
      setError('No se pudo crear. Puede que ese lote ya esté cargado.')
    }
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <h1 className="display text-2xl">Unidades</h1>

        <Filete className="bg-card p-5">
          <form onSubmit={crear} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Número de lote" required value={lot} className="tabular"
                inputMode="numeric" pattern="[0-9]*" placeholder="142"
                hint="Solo el número. Cargar los lotes es opcional: el vecino declara el suyo al entrar."
                onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
            </div>
            <Button type="submit">Agregar</Button>
          </form>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </Filete>

        {units === null && <Cargando><SkeletonTarjetas cantidad={3} /></Cargando>}
        {units?.length === 0 && <p className="text-ink-soft">Todavía no hay unidades cargadas.</p>}

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {units?.map((u) => (
            <li key={u.id}>
              <Filete className="bg-card px-4 py-3">
                <span className="font-semibold tabular">{u.label}</span>
              </Filete>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}
