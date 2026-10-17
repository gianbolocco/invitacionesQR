/** `node src/lib/admin.check.ts`. */
import assert from 'node:assert/strict'
import { filtrarVecinos, normalizarBusqueda, sinLote, type Person } from './admin.ts'

const p = (name: string, status: Person['status'], lotes: number[], role: Person['role'] = 'resident'): Person => ({
  id: name, name, status, role, email: null, username: null, lastLoginAt: null,
  units: lotes.map((n) => ({ id: `u${n}`, label: `Lote ${n}` })),
})

const padron = [
  p('Ana', 'active', [142]),
  p('Beto', 'invited', []),
  p('Carla', 'invited', [9]),
  p('Dani', 'disabled', []),
  p('Admin', 'active', [], 'admin'),
]
const base = { cuenta: 'todas', lote: 'todos', consulta: '' } as const
const nombres = (xs: Person[]) => xs.map((x) => x.name)

assert.equal(filtrarVecinos(padron, base).length, 5)
// Todavía no activaron la cuenta.
assert.deepEqual(nombres(filtrarVecinos(padron, { ...base, cuenta: 'invited' })), ['Beto', 'Carla'])
// Sin lote: no cuenta el admin, que no necesita casa.
assert.deepEqual(nombres(filtrarVecinos(padron, { ...base, lote: 'sinLote' })), ['Beto', 'Dani'])
assert.equal(sinLote(padron[4]), false)
// Los dos filtros se combinan: invitados Y sin lote.
assert.deepEqual(nombres(filtrarVecinos(padron, { ...base, cuenta: 'invited', lote: 'sinLote' })), ['Beto'])
// Con la búsqueda: por nombre sin tildes ni mayúsculas y por número de lote.
assert.deepEqual(nombres(filtrarVecinos(padron, { ...base, consulta: normalizarBusqueda('ANA') })), ['Ana'])
assert.deepEqual(nombres(filtrarVecinos(padron, { ...base, consulta: normalizarBusqueda('142') })), ['Ana'])
// `ignorar` saca un solo filtro: sirve para contar las opciones de ese filtro.
const puestos = { ...base, cuenta: 'invited', lote: 'sinLote' } as const
assert.equal(filtrarVecinos(padron, puestos, 'cuenta').length, 2) // Beto y Dani, sin importar la cuenta
assert.equal(filtrarVecinos(padron, puestos, 'lote').length, 2) // Beto y Carla, sin importar el lote

console.log('admin: ok')
