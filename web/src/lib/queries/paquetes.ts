'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Paquete = { id: string; unitLabel: string; note: string | null; notifiedAt: string; sinVer: boolean }

export const clavePaquetes = ['paquetes'] as const

export function usePaquetes() {
  return useQuery({ queryKey: clavePaquetes, queryFn: ({ signal }) => api<Paquete[]>('/packages', { signal }) })
}

// ---- Garita ----

export type PaqueteHoy = { id: string; unitLabel: string; note: string | null; notifiedAt: string }

// Cuelga de ['garita']: cualquier invalidación de la garita lo refresca también.
export const clavePaquetesHoy = ['garita', 'paquetes-hoy'] as const

export function usePaquetesHoy(habilitado: boolean) {
  return useQuery({
    queryKey: clavePaquetesHoy,
    queryFn: ({ signal }) => api<PaqueteHoy[]>('/gate/packages/hoy', { signal }),
    enabled: habilitado,
    refetchInterval: 60_000,
  })
}

export const avisarPaquete = (datos: { unitId: string; note?: string }) =>
  api<{ id: string; notifyAt: string }>('/gate/packages', { method: 'POST', body: JSON.stringify(datos) })

export const cancelarPaquete = (id: string) => api(`/gate/packages/${id}/cancel`, { method: 'POST' })
