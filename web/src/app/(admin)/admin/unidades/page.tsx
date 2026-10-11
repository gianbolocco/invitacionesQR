'use client'
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useUnidades, usePersonas, useAltaUnidad } from '@/lib/queries/admin'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function UnidadesPage() {
  const unidades = useUnidades()
  const personas = usePersonas()
  const alta = useAltaUnidad()
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Cuántos vecinos tiene cada unidad: se deriva del padrón que ya se pide
  // para Vecinos, sin otra llamada a la API.
  const porUnidad = new Map<string, number>()
  for (const p of personas.data ?? []) {
    for (const u of p.units) porUnidad.set(u.id, (porUnidad.get(u.id) ?? 0) + 1)
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await alta.mutateAsync(Number(lot))
      setLot('')
    } catch {
      setError('No se pudo crear. Puede que ese lote ya esté cargado.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Unidades" />

      <form onSubmit={crear} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 sm:max-w-xs">
          <Campo id="lote-nuevo" etiqueta="Número de lote"
            ayuda="Cargar los lotes es opcional: el vecino declara el suyo al entrar.">
            <Input id="lote-nuevo" required value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142"
              className="tabular" onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        </div>
        <Button type="submit" disabled={alta.isPending}>Agregar</Button>
      </form>
      {error && <Nota tono="error">{error}</Nota>}

      {unidades.isPending ? (
        <SkeletonFilas filas={3} />
      ) : unidades.isError ? (
        <ErrorConReintento onReintentar={() => unidades.refetch()} reintentando={unidades.isFetching} />
      ) : unidades.data!.length === 0 ? (
        <Vacio icono={Building2} titulo="Todavía no hay unidades cargadas" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {unidades.data!.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-3">
              <span className="font-semibold tabular">{u.label}</span>
              <span className="text-sm text-ink-soft tabular">
                {porUnidad.get(u.id) ?? 0} {(porUnidad.get(u.id) ?? 0) === 1 ? 'vecino' : 'vecinos'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
