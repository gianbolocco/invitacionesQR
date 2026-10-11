'use client'
import { createContext, useContext } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Me } from './session'

export const claveSesion = ['sesion'] as const

/**
 * La persona logueada, resuelta UNA vez por el layout de la sección. Antes
 * cada pantalla pedía /auth/me por su cuenta: quince copias del mismo request
 * y del mismo "Cargando…".
 */
export const SesionContexto = createContext<Me | null>(null)

export function useSesion(): Me {
  const me = useContext(SesionContexto)
  if (!me) throw new Error('useSesion se usa dentro de una sección protegida')
  return me
}

/**
 * Lo que hace cada pantalla de acceso al entrar: tira todo lo cacheado de una
 * sesión anterior (otra persona en la misma tablet no ve datos ajenos) MENOS
 * la marca, que es del barrio y no de la persona, y deja la sesión nueva lista
 * para que el layout no la vuelva a pedir.
 */
export function abrirSesion(qc: QueryClient, yo: Me): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'marca' })
  qc.setQueryData(claveSesion, yo)
}
