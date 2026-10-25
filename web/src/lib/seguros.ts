/*
 * La pantalla Seguros: los tipos que devuelve /insurance y los textos de cada
 * estado. Mismas formas que api/src/services/seguros.ts.
 */

export type EstadoListado = 'vencido' | 'por_vencer' | 'vigente' | 'sin_cargar'
type Ultimo = { at: string; unitLabel: string; sinSeguro: boolean }

export type FilaVehiculo = {
  id: string; plate: string; company: string; policy: string; expiresOn: string
  estado: Exclude<EstadoListado, 'sin_cargar'>
  updatedByName: string | null; updatedAt: string
  ultimoIngreso: (Ultimo & { guestName: string }) | null
}

export type FilaProveedor = {
  id: string; doc: string; name: string; tradeName: string | null
  company: string | null; policy: string | null; expiresOn: string | null
  estado: EstadoListado
  source: 'garita' | 'link' | null; updatedByName: string | null; updatedAt: string | null
  lotes: string[]
  ultimoIngreso: Ultimo | null
}

/** Días de `hoy` a `iso` ('YYYY-MM-DD'), por componentes: no depende de la zona. */
const dias = (iso: string, hoy: string) => {
  const utc = (f: string) => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(iso) - utc(hoy)) / 86_400_000)
}

/** Lo que dice la etiqueta de estado: "Vencido hace 14 días", "Vence en 5 días". */
export function textoEstadoListado(e: EstadoListado, expiresOn: string | null, hoy: string): string {
  if (e === 'sin_cargar' || !expiresOn) return 'Sin cargar'
  const n = dias(expiresOn, hoy)
  if (e === 'vencido') return n === -1 ? 'Vencido ayer' : `Vencido hace ${-n} días`
  if (e === 'por_vencer') return n === 0 ? 'Vence hoy' : n === 1 ? 'Vence mañana' : `Vence en ${n} días`
  return 'Vigente'
}

export const COLOR_ESTADO: Record<EstadoListado, string> = {
  vencido: 'bg-alto-tint text-alto',
  por_vencer: 'bg-espera-tint text-espera',
  vigente: 'bg-verde-tint text-verde',
  sin_cargar: 'bg-surface-sunk text-ink-soft',
}

export function paramsSeguros(f: { estado: 'todos' | EstadoListado; q: string }): URLSearchParams {
  const p = new URLSearchParams()
  if (f.estado !== 'todos') p.set('estado', f.estado)
  if (f.q.trim()) p.set('q', f.q.trim())
  return p
}
