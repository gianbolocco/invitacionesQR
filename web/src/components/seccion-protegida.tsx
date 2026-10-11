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
 * - Sin sesión (401) → login.
 * - Otro error (red caída, API reiniciándose) → error con reintentar. NO
 *   desloguea: antes cualquier falla de /auth/me mandaba al login, y el
 *   guardia con mala señal terminaba ahí con un auto esperando.
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

  const sinSesion = sesion.error instanceof ApiError && sesion.error.status === 401
  const rolAjeno = sesion.data && !roles.includes(sesion.data.role)

  useEffect(() => {
    if (sinSesion) router.replace('/login')
    else if (rolAjeno && sesion.data) router.replace(homeFor(sesion.data.role))
  }, [sinSesion, rolAjeno, sesion.data, router])

  // Mientras se vuelve a pedir, un error viejo en caché no decide nada.
  if (sesion.isPending || (sesion.isFetching && !sesion.data)) return <Arranque />
  if (sinSesion || rolAjeno) return <Arranque />
  if (sesion.isError) {
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

  return <SesionContexto.Provider value={sesion.data}>{children}</SesionContexto.Provider>
}
