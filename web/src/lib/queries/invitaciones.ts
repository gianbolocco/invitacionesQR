'use client'
import {
  keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import type { Invitation } from '@/lib/invitations'
import type { Franja } from '@/lib/franjas'

export type FiltrosHistorial = {
  q: string
  kind: '' | Invitation['kind']
  estado: '' | 'entro' | 'no_entro' | 'anulada'
  soloMias: boolean
}

export type DatosInvitacion = {
  kind: Invitation['kind']
  /** Solo se manda en las frecuentes. */
  frequentAs?: 'visita' | 'proveedor'
  guestName: string
  guestDoc: string | null
  plate: string | null
  note: string | null
  validFrom: string
  validTo: string
  weekdays: number[] | null
  capacity: number
  /** Solo proveedores; null = sin rubro. Si no se manda, no cambia. */
  tradeId?: string | null
}

type PaginaHistorial = { rows: Invitation[]; total: number; page: number; pageSize: number }

const POR_PAGINA = 20

/*
 * Todas cuelgan de ['invitaciones']: después de cualquier cambio se invalida
 * ese prefijo y la home, el detalle y el historial se ponen al día juntos.
 */
export const claves = {
  todas: ['invitaciones'] as const,
  vigentes: ['invitaciones', 'vigentes'] as const,
  una: (id: string) => ['invitaciones', 'una', id] as const,
  historial: (f: FiltrosHistorial) => ['invitaciones', 'historial', f] as const,
}

export function useInvitaciones() {
  return useQuery({
    queryKey: claves.vigentes,
    queryFn: ({ signal }) => api<Invitation[]>('/invitations', { signal }),
  })
}

export function useInvitacion(id: string) {
  const qc = useQueryClient()
  // Los 4 genéricos a mano: sin ellos TS confunde el tipo de dato con el tipo
  // de la función de placeholderData y no matchea ningún overload de useQuery.
  return useQuery<Invitation, Error, Invitation, ReturnType<typeof claves.una>>({
    queryKey: claves.una(id),
    queryFn: ({ signal }) => api<Invitation>(`/invitations/${id}`, { signal }),
    // Si la home ya la tiene, el pase aparece al instante mientras llega la fresca.
    placeholderData: () => qc.getQueryData<Invitation[]>(claves.vigentes)?.find((i) => i.id === id),
  })
}

export function useHistorial(f: FiltrosHistorial) {
  return useInfiniteQuery({
    queryKey: claves.historial(f),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ page: String(pageParam), pageSize: String(POR_PAGINA) })
      if (f.q.trim()) p.set('q', f.q.trim())
      if (f.kind) p.set('kind', f.kind)
      if (f.estado) p.set('estado', f.estado)
      if (f.soloMias) p.set('soloMias', 'true')
      return api<PaginaHistorial>(`/invitations/historial?${p}`, { signal })
    },
    getNextPageParam: (ultima) =>
      ultima.page * ultima.pageSize < ultima.total ? ultima.page + 1 : undefined,
    // Al cambiar un filtro, la lista anterior queda visible (atenuada) en vez
    // de saltar al skeleton en cada tecla.
    placeholderData: keepPreviousData,
  })
}

export function useCrearInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosInvitacion & { unitId: string }) =>
      api<Invitation>('/invitations', {
        method: 'POST',
        // La API valida opcionales con `optional()`: undefined, nunca null.
        body: JSON.stringify({
          ...d,
          guestDoc: d.guestDoc ?? undefined,
          plate: d.plate ?? undefined,
          note: d.note ?? undefined,
          weekdays: d.weekdays ?? undefined,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

export function useEditarInvitacion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosInvitacion) =>
      api<Invitation>(`/invitations/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

export function useRestaurarInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inv: Invitation) => api(`/invitations/${inv.id}/restore`, { method: 'POST' }),
    onSuccess: (_r, inv) => toast.success(`La invitación de ${inv.guestName} vuelve a estar vigente`),
    onError: () => toast.error('No se pudo volver a habilitar. Probá de nuevo.'),
    onSettled: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

/**
 * Anular es optimista: la fila se va al toque y vuelve sola si el servidor
 * falla. El toast trae "Deshacer", que es lo que se busca justo después de
 * tocar algo por error.
 */
export function useAnularInvitacion() {
  const qc = useQueryClient()
  const restaurar = useRestaurarInvitacion()
  return useMutation({
    mutationFn: (inv: Invitation) => api(`/invitations/${inv.id}/revoke`, { method: 'POST' }),
    onMutate: async (inv) => {
      await qc.cancelQueries({ queryKey: claves.vigentes })
      const antes = qc.getQueryData<Invitation[]>(claves.vigentes)
      qc.setQueryData<Invitation[]>(claves.vigentes, (l) => l?.filter((i) => i.id !== inv.id))
      return { antes }
    },
    onError: (e, _inv, ctx) => {
      if (ctx?.antes) qc.setQueryData(claves.vigentes, ctx.antes)
      toast.error(e instanceof ApiError && e.code === 'guest_inside'
        ? 'No se puede anular mientras el invitado está adentro.'
        : 'No se pudo anular. Probá de nuevo.')
    },
    onSuccess: (_r, inv) => {
      toast.success(`Anulaste la invitación de ${inv.guestName}`, {
        action: { label: 'Deshacer', onClick: () => restaurar.mutate(inv) },
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

/** Rubros activos del barrio y las franjas de ingreso de proveedores. Vacío = función apagada. */
export function useRubrosDelBarrio() {
  return useQuery({
    queryKey: ['invitaciones', 'rubros'] as const,
    queryFn: ({ signal }) => api<{ trades: { id: string; name: string; requiresInsurance: boolean }[]; providerWindows: Franja[] }>('/invitations/trades', { signal }),
    staleTime: 5 * 60_000,
  })
}
