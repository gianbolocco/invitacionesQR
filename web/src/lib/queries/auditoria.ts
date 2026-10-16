'use client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AuditRow = {
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
  /** Algún movimiento se cargó a mano, no se escaneó. */
  manual: boolean
  /** Por qué la anuló la portería. */
  revokedReason: string | null
}

export type AuditEstado = AuditRow['status']

export type Pagina = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<AuditEstado, number>
}

export type Movimiento = {
  id: string
  enteredAt: string
  exitedAt: string | null
  guestName: string
  guestDoc: string | null
  plate: string | null
  guardName: string | null
  exitGuardName: string | null
  manual: boolean
}

export type FiltrosAuditoria = {
  from: string
  to: string
  estado: 'todos' | AuditEstado
  tipo: 'todos' | AuditRow['kind']
  q: string
}

/** Sin page/pageSize: la usa también el link de exportar, que trae todo el rango. */
export function paramsDe(f: FiltrosAuditoria): URLSearchParams {
  const p = new URLSearchParams({ from: f.from, to: f.to })
  if (f.estado !== 'todos') p.set('status', f.estado)
  if (f.tipo !== 'todos') p.set('kind', f.tipo)
  if (f.q.trim()) p.set('q', f.q.trim())
  return p
}

/*
 * TanStack Query, no un efecto a mano: cambiar de filtro rápido no puede
 * pintar una respuesta vieja encima de una más nueva. keepPreviousData deja la
 * tabla en pantalla mientras llega la búsqueda, en vez de un skeleton por tecla.
 */
export function useAuditoria(f: FiltrosAuditoria, page: number, pageSize: number, habilitado: boolean) {
  return useQuery({
    queryKey: ['auditoria', f, page, pageSize],
    enabled: habilitado,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const p = paramsDe(f)
      p.set('page', String(page))
      p.set('pageSize', String(pageSize))
      return api<Pagina>(`/gate/audit?${p}`, { signal })
    },
  })
}

/** Los ingresos de una invitación: se piden al desplegar la fila. */
export function useMovimientos(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['auditoria', 'movimientos', id],
    enabled: habilitado,
    queryFn: ({ signal }) => api<Movimiento[]>(`/gate/audit/${id}/entries`, { signal }),
  })
}
