'use client'
import { useContext } from 'react'
import { api } from './api'
import { SesionContexto } from './sesion-contexto'

export type Me = {
  id: string
  neighborhoodId: string
  name: string
  email: string
  role: 'resident' | 'guard' | 'admin'
  units: { id: string; label: string }[]
}

/**
 * La sesión de la sección. Ya no hace un request: la resolvió el layout. Se
 * mantiene para las pantallas viejas; las nuevas usan `useSesion()`.
 */
export function useMe() {
  return useContext(SesionContexto)
}

/**
 * La casa de cada rol. Una cuenta de garita no tiene unidades, así que la home
 * del vecino le muestra "no tenés invitaciones" y un botón que no puede usar.
 * Se rutea en un solo lugar para que valga desde el login, desde el link de
 * alta y desde una pestaña vieja con la cookie todavía viva.
 */
export function homeFor(role: Me['role']): string {
  return role === 'guard' ? '/garita' : '/'
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  // Recarga dura a propósito: tira todo el estado en memoria después del logout.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/login'
}
