'use client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { paramsSeguros, type EstadoListado, type FilaProveedor, type FilaVehiculo } from '@/lib/seguros'

type Filtro = { estado: 'todos' | EstadoListado; q: string }

/** `habilitado`: recién con la sesión resuelta, como la auditoría. */
export function useSegurosAutos(f: Filtro, habilitado = true) {
  // Un auto no tiene "sin cargar" (sin seguro no está en el padrón): ese filtro se pide como todos.
  const filtro = { ...f, estado: f.estado === 'sin_cargar' ? 'todos' as const : f.estado }
  return useQuery({
    enabled: habilitado,
    // Cuelga de ['garita']: un ingreso o una corrección invalidan ese prefijo y la lista se pone al día.
    queryKey: ['garita', 'seguros', 'autos', filtro] as const,
    queryFn: ({ signal }) => api<{ rows: FilaVehiculo[]; counts: Record<'vencido' | 'por_vencer' | 'vigente', number> }>(
      `/insurance/vehicles?${paramsSeguros(filtro)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useSegurosProveedores(f: Filtro, habilitado = true) {
  return useQuery({
    enabled: habilitado,
    queryKey: ['garita', 'seguros', 'proveedores', f] as const,
    queryFn: ({ signal }) => api<{ rows: FilaProveedor[]; counts: Record<EstadoListado, number> }>(
      `/insurance/providers?${paramsSeguros(f)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}
