'use client'
import { createContext, useContext } from 'react'
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
