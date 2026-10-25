'use client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { paramsSeguros, type EstadoListado, type FilaProveedor, type FilaVehiculo } from '@/lib/seguros'

type Filtro = { estado: 'todos' | EstadoListado; q: string }

export function useSegurosAutos(f: Filtro) {
  return useQuery({
    // Cuelga de ['garita']: un ingreso o una corrección invalidan ese prefijo y la lista se pone al día.
    queryKey: ['garita', 'seguros', 'autos', f] as const,
    queryFn: ({ signal }) => api<{ rows: FilaVehiculo[]; counts: Record<'vencido' | 'por_vencer' | 'vigente', number> }>(
      `/insurance/vehicles?${paramsSeguros(f)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useSegurosProveedores(f: Filtro) {
  return useQuery({
    queryKey: ['garita', 'seguros', 'proveedores', f] as const,
    queryFn: ({ signal }) => api<{ rows: FilaProveedor[]; counts: Record<EstadoListado, number> }>(
      `/insurance/providers?${paramsSeguros(f)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}
