export type Unit = { id: string; label: string }

export type Person = {
  id: string
  email: string | null
  username: string | null
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

/** Sin tildes ni mayúsculas: así "Lucía" matchea "lucia" y "142" matchea "Lote 142". */
export function normalizarBusqueda(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
