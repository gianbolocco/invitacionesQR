'use client'
import { useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, apiBase } from '@/lib/api'
import { hoyISO } from '@/lib/fechas'
import {
  porId, porToken, buscar, registrarIngreso, registrarEgreso, deshacer, buscarUnidades, altaExpres,
  cargarManual, mensajeCargaManual, type Resultado,
} from '@/lib/gate'
import type { LecturaDni } from '@/lib/lectora'

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
    queryFn: ({ signal }) => buscar(q, signal),
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

/** QR leído (cámara, lectora o campo) → su veredicto, sin pedirlo dos veces. Tira si falla. */
export function useAbrirQr() {
  const router = useRouter()
  const precargar = usePrecargarVeredicto()
  // `vigente`: si ya no corresponde (llegó una lectura más nueva), no navega.
  return useCallback(async (token: string, reemplazar = false, vigente: () => boolean = () => true) => {
    const r = await porToken(token)
    if (!vigente()) return r
    precargar(r.invitation.id, r)
    const url = `/garita/invitacion/${r.invitation.id}`
    if (reemplazar) router.replace(url)
    else router.push(url)
    return r
  }, [router, precargar])
}

/*
 * Lo leído viaja entre pantallas en memoria y no en la URL: en la query string
 * el DNI y el nombre quedarían en el historial de la compu de la garita.
 * Fuera de ['garita'] para que invalidarGarita no lo toque.
 */
const CLAVE_DNI = ['lectora', 'dni'] as const
const claveDoc = (id: string) => ['lectora', 'documento', id] as const

/** Un DNI leído fuera de /garita espera acá a que /garita lo resuelva. */
export function useDniPendiente() {
  const qc = useQueryClient()
  return useMemo(() => ({
    dejar: (l: LecturaDni) => { qc.setQueryData(CLAVE_DNI, l) },
    tomar: () => {
      const l = qc.getQueryData<LecturaDni>(CLAVE_DNI)
      qc.removeQueries({ queryKey: CLAVE_DNI, exact: true })
      return l
    },
  }), [qc])
}

/** El documento leído para una invitación, para que su veredicto lo traiga cargado. */
export function useDocumentoLeido() {
  const qc = useQueryClient()
  return useMemo(() => ({
    dejar: (id: string, doc: string) => { qc.setQueryData(claveDoc(id), doc) },
    ver: (id: string) => qc.getQueryData<string>(claveDoc(id)),
    borrar: (id: string) => qc.removeQueries({ queryKey: claveDoc(id), exact: true }),
  }), [qc])
}

export type UltimaLectura = { descripcion: string; cuando: string }
const CLAVE_ULTIMA = ['lectora', 'ultima'] as const

/**
 * La última lectura y qué pasó con ella, para el recuadro "Lectora" de la
 * garita: la confirmación de que la lectora leyó, que un toast que se va no da.
 * En memoria (fuera de ['garita']) y sin gc: sobrevive al ir y volver del veredicto.
 */
export function useUltimaLectura() {
  const { data } = useQuery<UltimaLectura | null>({
    queryKey: CLAVE_ULTIMA,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data ?? null
}

export function useAnotarLectura() {
  const qc = useQueryClient()
  return useCallback((descripcion: string) => {
    qc.setQueryData<UltimaLectura>(CLAVE_ULTIMA, { descripcion, cuando: new Date().toISOString() })
  }, [qc])
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

/** La tanda se guarda entera o no se guarda: el error dice por qué. */
export function useCargarManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cargarManual,
    onError: (e) => toast.error(mensajeCargaManual(e)),
    // La auditoría también: las filas nuevas aparecen ahí marcadas como manuales.
    onSuccess: () => Promise.all([invalidarGarita(qc), qc.invalidateQueries({ queryKey: ['auditoria'] })]),
  })
}
