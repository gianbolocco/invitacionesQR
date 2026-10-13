'use client'
import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, apiBase } from '@/lib/api'
import { hoyISO } from '@/lib/fechas'
import {
  porId, registrarIngreso, registrarEgreso, deshacer, buscarUnidades, altaExpres,
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
  validTo: string
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
  adentro: ['garita', 'adentro'] as const,
}

/*
 * Respaldo de los avisos en vivo (useAvisosGarita): si la conexión se corta
 * sin que el navegador se entere —un proxy que la deja colgada—, la garita
 * igual se pone al día en un minuto. React Query frena el intervalo con la
 * pestaña oculta y vuelve a pedir al recuperar el foco.
 */
const CADA = 60_000

/**
 * La garita queda abierta todo el turno: la API avisa por Server-Sent Events
 * cada vez que algo cambia (una invitación nueva, un ingreso de otro guardia)
 * y acá se vuelve a pedir lo que se muestra. Al (re)conectar también, por lo
 * que haya pasado mientras estaba cortado. EventSource reintenta solo.
 */
export function useAvisosGarita() {
  const qc = useQueryClient()
  useEffect(() => {
    const avisos = new EventSource(`${apiBase}/gate/eventos`, { withCredentials: true })
    const refrescar = () => invalidarGarita(qc)
    avisos.onmessage = refrescar
    avisos.onopen = refrescar
    return () => avisos.close()
  }, [qc])
}

export function useAgenda(fecha: string) {
  return useQuery({
    queryKey: claves.agenda(fecha),
    queryFn: ({ signal }) => api<AgendaRow[]>(`/gate/agenda?date=${fecha}`, { signal }),
    // Solo hoy: es lo que el guardia tiene abierto durante el turno.
    refetchInterval: fecha === hoyISO() ? CADA : false,
  })
}

/** Quiénes están en el barrio ahora, de cualquier día. Mismas filas que la agenda. */
export function useAdentro(habilitado: boolean) {
  return useQuery({
    queryKey: claves.adentro,
    queryFn: ({ signal }) => api<AgendaRow[]>('/gate/adentro', { signal }),
    enabled: habilitado,
    refetchInterval: CADA,
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

export function useBuscarUnidades(q: string) {
  return useQuery({
    queryKey: ['garita', 'unidades', q] as const,
    queryFn: () => buscarUnidades(q),
    enabled: q.length > 0,
  })
}

export function useAltaExpres() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: altaExpres,
    onError: () => toast.error('No se pudo crear la invitación. Probá de nuevo.'),
    onSuccess: () => invalidarGarita(qc),
  })
}
