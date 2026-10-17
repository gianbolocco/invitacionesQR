/** `node src/lib/lotes.check.ts`. */
import assert from 'node:assert/strict'
import { agruparPorLote, SIN_LOTE } from './lotes.ts'

const u = (id: string, n: number) => ({ id, label: `Lote ${n}` })
const p = (id: string, name: string, units: { id: string; label: string }[]) => ({
  id, name, units, email: null, username: null, role: 'resident' as const, status: 'active' as const, lastLoginAt: null,
})

const unidades = [u('u142', 142), u('u9', 9), u('u7', 7)]
const vecinos = [
  p('1', 'Zoe', [unidades[0]]),
  p('2', 'Ana', [unidades[0]]),
  p('3', 'Beto', []),
  p('4', 'Carla', [unidades[1], unidades[0]]),
]

const g = agruparPorLote(vecinos, unidades, true)
// Primero los sin lote; después los lotes como número (7, 9, 142), con el vacío incluido.
assert.deepEqual(g.map((x) => x.titulo), [SIN_LOTE, 'Lote 7', 'Lote 9', 'Lote 142'])
assert.equal(g[0].sinLote, true)
assert.deepEqual(g[1].vecinos, [])
// Dentro de un lote, por nombre; quien vive en dos lotes figura en los dos.
assert.deepEqual(g[3].vecinos.map((x) => x.name), ['Ana', 'Carla', 'Zoe'])
assert.deepEqual(g[2].vecinos.map((x) => x.name), ['Carla'])

// Buscando, los lotes vacíos no aparecen.
const buscando = agruparPorLote([vecinos[0]], unidades, false)
assert.deepEqual(buscando.map((x) => x.titulo), ['Lote 142'])

// Un admin sin lote no cuenta como "sin lote".
const admin = { ...p('9', 'Admin', []), role: 'admin' as const }
assert.equal(agruparPorLote([admin], unidades, true).some((x) => x.sinLote), false)

// Sin vecinos sin lote, no hay grupo "sin lote".
assert.equal(agruparPorLote([vecinos[0]], unidades, true).some((x) => x.sinLote), false)

console.log('lotes: ok')
