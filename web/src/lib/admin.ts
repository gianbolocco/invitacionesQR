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

/** Cómo está la cuenta: activa, todavía sin activar (invitado) o dada de baja. */
export type FiltroCuenta = 'todas' | Person['status']
/** Todos, o solo los que todavía no declararon su lote. */
export type FiltroLote = 'todos' | 'sinLote'

export type FiltrosVecinos = { cuenta: FiltroCuenta; lote: FiltroLote; consulta: string }

/**
 * Un admin no necesita casa: no cuenta como "sin lote" (la vista Por lote
 * hace lo mismo), aunque siga apareciendo en la lista.
 */
export const sinLote = (p: Person): boolean => p.units.length === 0 && p.role !== 'admin'

export function coincideConsulta(p: Person, consulta: string): boolean {
  if (!consulta) return true
  return normalizarBusqueda(p.name).includes(consulta)
    || p.units.some((u) => normalizarBusqueda(u.label).includes(consulta)
      || normalizarBusqueda(u.label.replace(/^lote\s*/i, '')).includes(consulta))
}

/**
 * El padrón filtrado. `consulta` ya viene normalizada (normalizarBusqueda).
 * `ignorar` deja afuera UN filtro: para contar cuántos dan las otras opciones
 * de ese mismo filtro, sin que el que está puesto las deje en cero.
 */
export function filtrarVecinos(
  vecinos: Person[],
  f: FiltrosVecinos,
  ignorar?: 'cuenta' | 'lote',
): Person[] {
  return vecinos.filter((p) =>
    coincideConsulta(p, f.consulta)
    && (ignorar === 'cuenta' || f.cuenta === 'todas' || p.status === f.cuenta)
    && (ignorar === 'lote' || f.lote === 'todos' || sinLote(p)))
}
