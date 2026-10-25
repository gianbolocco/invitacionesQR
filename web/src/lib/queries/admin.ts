'use client'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, apiBase, ApiError } from '@/lib/api'
import { claveMarca } from '@/lib/marca-cliente'
import type { Person, Unit } from '@/lib/admin'
import type { Franja } from '@/lib/franjas'

export const claves = {
  personas: ['admin', 'personas'] as const,
  unidades: ['admin', 'unidades'] as const,
  kpis: ['admin', 'kpis'] as const,
  entradasPorDia: ['admin', 'entradas-dia'] as const,
  entradasPorHora: ['admin', 'entradas-hora'] as const,
  invitacionesPorPersona: ['admin', 'invitaciones-persona'] as const,
  actividadPorGuardia: ['admin', 'actividad-guardia'] as const,
  barrio: ['admin', 'barrio'] as const,
}

function invalidarPersonas(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: claves.personas })
}

export function usePersonas() {
  return useQuery({ queryKey: claves.personas, queryFn: ({ signal }) => api<Person[]>('/admin/people', { signal }) })
}

export function useUnidades() {
  return useQuery({ queryKey: claves.unidades, queryFn: ({ signal }) => api<Unit[]>('/admin/units', { signal }) })
}

export type Kpis = {
  entriesToday: number
  entriesWeek: number
  entriesMonth: number
  activeInvitations: number
  enabledResidents: number
  activeResidents30d: number
  unitsWithoutResidents: number
  insideNow: number
  staleInside: number
  entriesSameDayLastWeek: number
  invitedNeverLoggedIn: number
  /** Autos y proveedores con el seguro vencido que entraron en el último mes. */
  segurosVencidos: number
  segurosPorVencer: number
  /** Ingresos de los últimos 7 días por un alta exprés con algún seguro faltante. */
  autorizadosSinSeguro: number
}
export type PorDia = { day: string; total: number }
export type PorHora = { hour: number; total: number }
export type PorPersona = { id: string; name: string; unitLabel: string; total: number }
export type PorGuardia = { id: string | null; name: string | null; total: number; lastAt: string | null }

export function useKpis() {
  return useQuery({ queryKey: claves.kpis, queryFn: ({ signal }) => api<Kpis>('/reports/kpis', { signal }) })
}
export function useEntradasPorDia() {
  return useQuery({
    queryKey: claves.entradasPorDia,
    queryFn: ({ signal }) => api<PorDia[]>('/reports/entries-by-day', { signal }),
  })
}
export function useEntradasPorHora() {
  return useQuery({
    queryKey: claves.entradasPorHora,
    queryFn: ({ signal }) => api<PorHora[]>('/reports/entries-by-hour', { signal }),
  })
}
export function useInvitacionesPorPersona() {
  return useQuery({
    queryKey: claves.invitacionesPorPersona,
    queryFn: ({ signal }) => api<PorPersona[]>('/reports/invitations-by-person', { signal }),
  })
}
export function useActividadPorGuardia() {
  return useQuery({
    queryKey: claves.actividadPorGuardia,
    queryFn: ({ signal }) => api<PorGuardia[]>('/reports/activity-by-guard', { signal }),
  })
}

export function useAltaVecino() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: { name: string; email: string; lot?: number }) =>
      api<{ id: string; email: string; status: string; mailEnviado: boolean }>('/admin/people', {
        method: 'POST', body: JSON.stringify({ ...datos, role: 'resident' }),
      }),
    // El alta queda hecha igual si el mail falla: se avisa para que se
    // reenvíe desde la lista, no se bloquea el cierre del sheet.
    onSuccess: (r) => {
      if (!r.mailEnviado) toast.error(`Dimos de alta a ${r.email}, pero el mail no salió. Probá "Reenviar" en la lista.`)
    },
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useAltaGuardia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: { name: string; username: string; password: string }) =>
      api<{ id: string; username: string; status: string }>('/admin/guards', {
        method: 'POST', body: JSON.stringify(datos),
      }),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useReenviarInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id' | 'email' | 'username'>) => api(`/admin/people/${p.id}/resend`, { method: 'POST' }),
    onSuccess: (_d, p) => toast.success(`Reenviamos la invitación a ${p.email ?? p.username ?? 'la persona'}.`),
    onError: (e, p) => toast.error(e instanceof ApiError && e.status === 429
      ? 'Ya le reenviamos la invitación hace menos de un minuto. Esperá un poco antes de mandarla de nuevo.'
      : `No pudimos mandarle el mail a ${p.email ?? p.username ?? 'la persona'}. Probá de nuevo en un rato.`),
    onSettled: () => invalidarPersonas(qc),
  })
}

/**
 * Copia el link de alta para mandarlo por WhatsApp. El pedido sale adentro del
 * ClipboardItem y no antes: Safari solo deja escribir el portapapeles durante
 * el clic, y un `await` previo lo hace perder.
 */
export async function copiarLinkDeAlta(p: Pick<Person, 'id' | 'name'>): Promise<void> {
  const url = api<{ url: string }>(`/admin/people/${p.id}/invite-link`, { method: 'POST' }).then((r) => r.url)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': url.then((u) => new Blob([u], { type: 'text/plain' })) }),
    ])
    toast.success(`Copiamos el link de alta de ${p.name}. Mandáselo por donde quieras.`)
  } catch {
    const u = await url.catch(() => null)
    if (u) window.prompt('No pudimos copiarlo solo. Copiá el link desde acá:', u)
    else toast.error('No pudimos generar el link. Probá de nuevo.')
  }
}

export function useReactivarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id'>) => api(`/admin/people/${p.id}/enable`, { method: 'POST' }),
    onError: () => toast.error('No se pudo reactivar. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useDeshabilitarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id'>) => api(`/admin/people/${p.id}/disable`, { method: 'POST' }),
    onError: () => toast.error('No se pudo dar de baja. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useCambiarLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, lot }: { personId: string; lot: number }) =>
      api(`/admin/people/${personId}/lot`, { method: 'POST', body: JSON.stringify({ lot }) }),
    onError: () => toast.error('No se pudo cambiar el lote. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useCambiarContrasenaGuardia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, password }: { personId: string; password: string }) =>
      api(`/admin/people/${personId}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
    onError: () => toast.error('No se pudo cambiar la contraseña. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export type Barrio = {
  id: string
  name: string
  address: string | null
  mapUrl: string | null
  brandColor: string | null
  /** Horas adentro antes de alertar a la garita; null = ese tipo no alerta. */
  overstayHours: HorasPermanencia
  /** Días antes del vencimiento del seguro para avisar; null = no avisa. */
  insuranceWarnDays: number | null
  /** La garita frena el auto que entra sin seguro vigente cargado. */
  vehicleInsuranceRequired: boolean
  /** Si está apagado, ese auto no entra ni con autorización (la persona puede entrar a pie). */
  vehicleInsuranceOverride: boolean
  paleta: string[]
  providerWindows: Franja[]
}

export type HorasPermanencia = { visita: number | null; proveedor: number | null }

export function useBarrio() {
  return useQuery({ queryKey: claves.barrio, queryFn: ({ signal }) => api<Barrio>('/admin/neighborhood', { signal }) })
}

export function useGuardarBarrio() {
  const qc = useQueryClient()
  return useMutation({
    // Todo opcional: cada pestaña de Configuración guarda solo lo suyo.
    mutationFn: (datos: { name?: string; address?: string; mapUrl?: string; brandColor?: string; overstayHours?: HorasPermanencia; insuranceWarnDays?: number | null; vehicleInsuranceRequired?: boolean; vehicleInsuranceOverride?: boolean }) =>
      api<Barrio>('/admin/neighborhood', { method: 'PATCH', body: JSON.stringify(datos) }),
    onSuccess: (b) => {
      qc.setQueryData(claves.barrio, b)
      qc.invalidateQueries({ queryKey: claveMarca })
    },
    // Sin toast: cada pestaña de Configuración muestra el error en su propia sección.
  })
}

export function useSubirLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      // fetch directo y no api(): este manda un binario con su propio
      // Content-Type, y el helper fuerza application/json.
      const res = await fetch(`${apiBase}/admin/branding/logo`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': file.type }, body: file,
      })
      if (!res.ok) throw new Error(String(res.status))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
    onError: () => toast.error('No se pudo subir. Tiene que ser un PNG o un JPG de menos de 500 KB.'),
  })
}

export function useQuitarLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api('/admin/branding/logo', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
  })
}

/** Algunos navegadores no informan el tipo de un SVG arrastrado: se deduce de la extensión. */
export function tipoDePlano(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type || ({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' } as Record<string, string>)[extension] || ''
}

export function useSubirPlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api('/admin/branding/plano', {
      method: 'PUT', headers: { 'Content-Type': tipoDePlano(file) }, body: file,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
  })
}

export function useQuitarPlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api('/admin/branding/plano', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
  })
}

export type FilaPreview = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'ready' | 'invalid' | 'duplicate_file' | 'existing'
  errors: string[]
}
export type Preview = {
  rows: FilaPreview[]
  summary: { total: number; ready: number; duplicates: number; invalid: number }
}
export type ResultadoFila = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'created' | 'mail_failed' | 'existing' | 'failed'
}

export function usePreviewCsv() {
  return useMutation({
    mutationFn: (csv: string) => api<Preview>('/admin/people/import/preview', {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv,
    }),
  })
}

export function useImportarTanda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: Pick<ResultadoFila, 'line' | 'name' | 'email' | 'lot'>[]) =>
      api<{ results: ResultadoFila[] }>('/admin/people/import', { method: 'POST', body: JSON.stringify({ rows }) }),
    onSettled: () => invalidarPersonas(qc),
  })
}

export { ApiError }

export type Rubro = { id: string; name: string; archivedAt: string | null; requiresInsurance: boolean }

const claveRubros = ['admin', 'rubros'] as const

export function useRubros() {
  return useQuery({ queryKey: claveRubros, queryFn: ({ signal }) => api<Rubro[]>('/admin/trades', { signal }) })
}

const ERRORES_RUBRO: Record<string, string> = { rubro_duplicado: 'Ya hay un rubro con ese nombre.' }

export function useCrearRubro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { name: string; requiresInsurance: boolean }) => api<Rubro>('/admin/trades', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveRubros }),
    onError: (e) => toast.error(ERRORES_RUBRO[(e as ApiError).code] ?? 'No se pudo guardar el rubro. Probá de nuevo.'),
  })
}

export function useEditarRubro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; name?: string; archived?: boolean; requiresInsurance?: boolean }) =>
      api<Rubro>(`/admin/trades/${id}`, { method: 'PATCH', body: JSON.stringify(datos) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveRubros }),
    onError: (e) => toast.error(ERRORES_RUBRO[(e as ApiError).code] ?? 'No se pudo guardar el rubro. Probá de nuevo.'),
  })
}

export function useGuardarFranjas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (providerWindows: Franja[]) =>
      api<Barrio>('/admin/neighborhood', { method: 'PATCH', body: JSON.stringify({ providerWindows }) }),
    onSuccess: (b) => qc.setQueryData(claves.barrio, b),
    onError: (e) => toast.error((e as ApiError).code === 'franja_invalida'
      ? 'Revisá las franjas: cada una necesita al menos un día y un horario de inicio anterior al de fin.'
      : 'No se pudieron guardar los horarios. Probá de nuevo.'),
  })
}
