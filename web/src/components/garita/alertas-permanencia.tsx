'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useAdentro } from '@/lib/queries/garita'
import { excedidas as calcular, type Excedida } from '@/lib/permanencia'
import { tiempoDesde } from '@/lib/fechas'
import { cn } from '@/lib/utils'

type Alertas = { ahora: Date; porId: Map<string, Excedida> }

const AlertasContexto = createContext<Alertas | null>(null)
const SIN_ALERTAS: Alertas = { ahora: new Date(0), porId: new Map() }

/** Las alertas de permanencia de la garita. Fuera de `AlertasProvider`, ninguna. */
export const useAlertas = () => useContext(AlertasContexto) ?? SIN_ALERTAS

/**
 * Si esa invitación pasó su tiempo, "Hace 7 h 20 min adentro"; si no, null.
 * Dice cuánto lleva, no cuánto se pasó: es el dato que el guardia usa al llamar.
 */
export function useTiempoExcedido(fila: { id: string; lastEntryAt: string | null }): string | null {
  const { porId, ahora } = useAlertas()
  if (!porId.has(fila.id)) return null
  return fila.lastEntryAt ? `Hace ${tiempoDesde(fila.lastEntryAt, ahora)} adentro` : 'Adentro'
}

/** El aviso en amarillo de quien pasó su tiempo: ícono y texto, sin caja. */
export function TextoExcedido({ texto, className }: { texto: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-semibold text-espera', className)}>
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />{texto}
    </span>
  )
}

/** Cada cuánto se mira el reloj. La red no participa: el vencimiento ya vino calculado. */
const TIC = 30_000

/**
 * Quién pasó su tiempo adentro, para la garita: el tablero, la lista y el
 * filtro de advertencia leen de acá. Comparte la query de "Adentro" con la
 * agenda, así que no suma pedidos; lo único propio es el reloj, que hace
 * aparecer la advertencia aunque nadie haya escaneado nada.
 */
export function AlertasProvider({ children }: { children: React.ReactNode }) {
  const adentro = useAdentro(true)
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), TIC)
    return () => clearInterval(t)
  }, [])

  const valor = useMemo(() => ({
    ahora,
    porId: new Map(calcular(adentro.data ?? [], ahora).map((e) => [e.id, e])),
  }), [adentro.data, ahora])

  return <AlertasContexto.Provider value={valor}>{children}</AlertasContexto.Provider>
}
