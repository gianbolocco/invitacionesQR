'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { SesionContexto, claveSesion } from '@/lib/sesion-contexto'
import { Arranque } from './dominio/arranque'
import { ErrorConReintento } from './dominio/error-con-reintento'

/**
 * Resuelve la sesión y verifica el rol de la sección, en un solo lugar.
 *
 * - 401 firme (y sin pedido en curso) → login, aunque haya datos: una sesión
 *   revocada en pleno uso también sale. Un 401 viejo en caché no decide nada
 *   mientras se vuelve a pedir.
 * - Otro error (red caída, API reiniciándose): si ya hay sesión válida, la
 *   página sigue como está (no se pierde su estado, p. ej. el escáner); si no
 *   hay, error con reintentar. NUNCA desloguea.
 * - Rol que no corresponde → la casa de su rol.
 */
export function SeccionProtegida({ roles, children }: {
  roles: Me['role'][]
  children: React.ReactNode
}) {
  const router = useRouter()
  const sesion = useQuery({
    queryKey: claveSesion,
    queryFn: ({ signal }) => api<Me>('/auth/me', { signal }),
    staleTime: 5 * 60_000,
    retry: (fallos, error) => !(error instanceof ApiError && error.status === 401) && fallos < 2,
  })

  const sinSesion = sesion.error instanceof ApiError && sesion.error.status === 401 && !sesion.isFetching
  const rolAjeno = !!sesion.data && !roles.includes(sesion.data.role)

  useEffect(() => {
    if (sinSesion) {
      // Carga completa a propósito: descarta la caché del usuario anterior, que
      // con router.replace sobreviviría y la vería quien entre después.
      window.location.replace('/login')
    }
    else if (rolAjeno && sesion.data) router.replace(homeFor(sesion.data.role))
  }, [sinSesion, rolAjeno, sesion.data, router])

  if (sinSesion || rolAjeno) return <Arranque />
  // Con sesión válida en mano, un refetch fallido no tira la página.
  if (sesion.data) return <SesionContexto.Provider value={sesion.data}>{children}</SesionContexto.Provider>
  // Un 401 viejo en caché mientras se vuelve a pedir no es "sin conexión":
  // cae al arranque en vez de mostrar el error un instante.
  if (sesion.isError && !(sesion.error instanceof ApiError && sesion.error.status === 401)) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <ErrorConReintento
          titulo="No pudimos conectarnos"
          detalle="Revisá la conexión. Tu sesión sigue abierta."
          onReintentar={() => sesion.refetch()}
          reintentando={sesion.isFetching} />
      </main>
    )
  }

  return <Arranque />
}
