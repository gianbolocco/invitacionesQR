/** `node src/lib/tablero.check.ts`. */
import assert from 'node:assert/strict'
import { armarColumnas, agruparPorUnidad, filtrarPorTipo } from './tablero.ts'

const HOY = '2026-10-16'
const fila = (id: string, o: Record<string, unknown> = {}) => ({
  id, guestName: id, guestDoc: null, plate: null, kind: 'visita' as const, unitLabel: 'Lote 142',
  inviterName: 'Lucía', capacity: 1, validTo: HOY, enteredCount: 0, lastEntryAt: null,
  lastExitAt: null, adentro: false, note: null, ...o,
})

const agenda = [
  fila('espera'),
  fila('freq-espera', { kind: 'frecuente', capacity: 999, validTo: '2027-01-01' }),
  fila('adentro-hoy', { adentro: true, enteredCount: 1 }),
  fila('salio', { enteredCount: 1 }),
  fila('vencida', { validTo: '2026-10-10' }),
]
// Entró ayer y sigue adentro: no está en la agenda de hoy, sí en /gate/adentro.
const deAyer = fila('adentro-ayer', { adentro: true })

const c = armarColumnas(agenda, [agenda[2], deAyer], HOY)
assert.deepEqual(c.porLlegar.map((r) => r.id), ['espera', 'freq-espera'])
assert.deepEqual(c.adentro.map((r) => r.id), ['adentro-hoy', 'adentro-ayer'])
assert.deepEqual(c.seFueron.map((r) => r.id), ['salio'])
assert.deepEqual(c.vencidas.map((r) => r.id), ['vencida'])

// Quien está adentro no figura en otra columna aunque la agenda lo cuente distinto.
const raro = armarColumnas([fila('x', { enteredCount: 1 })], [fila('x', { adentro: true })], HOY)
assert.equal(raro.seFueron.length, 0)
assert.equal(raro.adentro.length, 1)

// Otro día: sin lista de adentro, sale de la propia agenda.
assert.deepEqual(armarColumnas(agenda, null, HOY).adentro.map((r) => r.id), ['adentro-hoy'])

assert.deepEqual(filtrarPorTipo(agenda, 'frecuente').map((r) => r.id), ['freq-espera'])
assert.equal(filtrarPorTipo(agenda, 'todos').length, agenda.length)

const g = agruparPorUnidad([
  fila('a', { unitLabel: 'Lote 142' }),
  fila('b', { unitLabel: 'Lote 9', enteredCount: 1 }),
  fila('c', { unitLabel: 'Lote 9' }),
  fila('d', { unitLabel: 'Lote 9', adentro: true }),
], HOY)
// Numérico: 9 antes que 142. Adentro, después los que faltan, al final los que ya salieron.
assert.deepEqual(g.map((x) => x.unidad), ['Lote 9', 'Lote 142'])
assert.deepEqual(g[0].filas.map((r) => r.id), ['d', 'c', 'b'])

console.log('tablero: ok')
