'use client'
import { useState } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { ApiError } from '@/lib/api'
import { AplicarMarca, MarcaProvider } from '@/lib/marca-cliente'
import type { Marca } from '@/lib/marca'
import { Toaster } from '@/components/ui/sonner'

const SESION_VENCIDA = new Set(['no_session', 'invalid_session'])

function esSesionVencida(error: unknown) {
  return error instanceof ApiError && error.status === 401 && SESION_VENCIDA.has(error.code)
}

/*
 * Un solo cliente de datos para toda la app.
 *
 * - Los 4xx no se reintentan: un "no encontrado" no se arregla insistiendo.
 * - Una sesión vencida a mitad de uso manda al login, desde acá y una sola
 *   vez, en vez de que cada pantalla lo resuelva a su manera. La query de la
 *   sesión queda afuera: la maneja el layout de cada sección.
 */
function crearCliente() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === 'sesion') return
        if (esSesionVencida(error)) {
          // Navegación completa a propósito: descarta toda la caché de datos.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/login'
        }
      },
    }),
    // Igual política para las acciones: guardar con la sesión vencida también sale al login.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (esSesionVencida(error)) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/login'
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (fallos, error) =>
          !(error instanceof ApiError && error.status < 500) && fallos < 2,
      },
    },
  })
}

export function Proveedores({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  const [cliente] = useState(crearCliente)
  return (
    <QueryClientProvider client={cliente}>
      {/* Con "reducir movimiento" en el sistema, motion deja solo los fundidos: nada se desplaza. */}
      <MotionConfig reducedMotion="user">
        <MarcaProvider marca={marca}>
          <AplicarMarca />
          {children}
          <Toaster />
        </MarcaProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
