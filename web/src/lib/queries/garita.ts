'use client'
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  porId, registrarIngreso, registrarEgreso, deshacer,
  type Hit, type Resultado,
} from '@/lib/gate'

export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  enteredCount: number
  lastEntryAt: string | null
  lastExitAt: string | null
  adentro: boolean
}

/*
 * Todas cuelgan de ['garita']: después de un ingreso, un egreso o un
 * deshacer, se invalida ese prefijo entero y la agenda, la búsqueda y
 * "últimos movimientos" quedan al día juntas.
 */
export const claves = {
  agenda: (fecha: string) => ['garita', 'agenda', fecha] as const,
  busqueda: (q: string) => ['garita', 'busqueda', q] as const,
  veredicto: (id: string) => ['garita', 'veredicto', id] as const,
}

export function useAgenda(fecha: string) {
  return useQuery({
    queryKey: claves.agenda(fecha),
    queryFn: ({ signal }) => api<AgendaRow[]>(`/gate/agenda?date=${fecha}`, { signal }),
  })
}

export function useBusqueda(q: string) {
  return useQuery({
    queryKey: claves.busqueda(q),
    queryFn: ({ signal }) => api<Hit[]>(`/gate/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length > 0,
  })
}

export function useVeredicto(id: string) {
  return useQuery({
    queryKey: claves.veredicto(id),
    queryFn: () => porId(id),
  })
}

/**
 * El escáner ya trae el resultado completo al validar el token. Se precarga
 * acá antes de navegar, así la pantalla del veredicto no lo vuelve a pedir
 * ni parpadea con un skeleton que ya tiene los datos.
 */
export function usePrecargarVeredicto() {
  const qc = useQueryClient()
  // useCallback: esto se usa como dependencia de un efecto en la pantalla
  // de escanear. Sin memoizar, una función nueva en cada render reinicia la
  // cámara en cada render.
  return useCallback((id: string, resultado: Resultado) => qc.setQueryData(claves.veredicto(id), resultado), [qc])
}

function invalidarGarita(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: ['garita'] })
}

export function useRegistrarIngreso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: registrarIngreso,
    onError: () => toast.error('No se pudo registrar. Probá de nuevo.'),
    onSettled: () => invalidarGarita(qc),
  })
}

export function useRegistrarEgreso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: registrarEgreso,
    onError: () => toast.error('No se pudo registrar. Probá de nuevo.'),
    onSettled: () => invalidarGarita(qc),
  })
}

export function useDeshacerMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => deshacer(entryId),
    onError: () => toast.error('No se pudo deshacer. Revisalo en la auditoría.'),
    onSettled: () => invalidarGarita(qc),
  })
}
