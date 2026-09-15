'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from './api'

export type Me = {
  id: string
  neighborhoodId: string
  name: string
  email: string
  role: 'resident' | 'guard' | 'admin'
  units: { id: string; label: string }[]
}

/** Resuelve la sesión. Si no hay, manda a /login. */
export function useMe() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    api<Me>('/auth/me')
      .then(setMe)
      .catch(() => router.replace('/login'))
  }, [router])

  return me
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
