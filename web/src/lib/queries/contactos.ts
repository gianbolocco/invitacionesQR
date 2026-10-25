'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import type { Contacto } from '@/lib/contactos'

const CLAVE = ['contactos'] as const

export type DatosContacto = { kind: 'visita' | 'proveedor'; name: string; doc: string | null; tradeId: string | null }

export function useContactos() {
  return useQuery({ queryKey: CLAVE, queryFn: ({ signal }) => api<Contacto[]>('/contacts', { signal }) })
}

function mensaje(e: unknown) {
  return e instanceof ApiError && e.code === 'rubro_invalido' ? 'Ese rubro ya no está disponible. Elegí otro.'
    : e instanceof ApiError && e.code === 'contact_not_found' ? 'Ese contacto ya no existe.'
    : 'No se pudo guardar el contacto. Probá de nuevo.'
}

export function useCrearContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosContacto) => api<Contacto>('/contacts', { method: 'POST', body: JSON.stringify(d) }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useEditarContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: Omit<DatosContacto, 'kind'> & { id: string }) =>
      api<Contacto>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useBorrarContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/contacts/${id}`, { method: 'DELETE' }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}
