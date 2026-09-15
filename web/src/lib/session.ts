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

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  window.location.href = '/login'
}
