'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Paquete = { id: string; unitLabel: string; note: string | null; notifiedAt: string; sinVer: boolean }

export const clavePaquetes = ['paquetes'] as const

export function usePaquetes() {
  return useQuery({ queryKey: clavePaquetes, queryFn: ({ signal }) => api<Paquete[]>('/packages', { signal }) })
}
