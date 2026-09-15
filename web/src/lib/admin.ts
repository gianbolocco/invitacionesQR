'use client'
import { useState } from 'react'
import { api } from './api'

export type Unit = { id: string; label: string }

export type Person = {
  id: string
  email: string
  name: string
  role: 'resident' | 'guard' | 'admin'
  status: 'invited' | 'active' | 'disabled'
  lastLoginAt: string | null
  units: Unit[]
}

export const ESTADO: Record<Person['status'], string> = {
  invited: 'Invitado, todavía no entró',
  active: 'Activo',
  disabled: 'Deshabilitado',
}

export function useAdminData() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [units, setUnits] = useState<Unit[]>([])

  function cargar() {
    api<Person[]>('/admin/people').then(setPeople).catch(() => setPeople([]))
    api<Unit[]>('/admin/units').then(setUnits).catch(() => {})
  }

  return { people, units, cargar }
}

export function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

export function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}
