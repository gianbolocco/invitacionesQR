/** `node src/lib/permanencia.check.ts`. */
import assert from 'node:assert/strict'
import { excedidas, primeroExcedidas } from './permanencia.ts'

const AHORA = new Date('2026-10-19T20:00:00-03:00')
const fila = (id: string, alertaDesde: string | null) => ({
  id, guestName: id, guestDoc: null, plate: null, kind: 'visita' as const, unitLabel: 'Lote 142',
  inviterName: 'Lucía', capacity: 1, validTo: '2026-10-19', enteredCount: 1, lastEntryAt: null,
  lastExitAt: null, adentro: true, alertaDesde,
})

const filas = [
  fila('sin-umbral', null),
  fila('todavia-no', '2026-10-19T20:01:00-03:00'),
  fila('justo', '2026-10-19T20:00:00-03:00'),
  fila('hace-rato', '2026-10-19T17:00:00-03:00'),
  fila('recien', '2026-10-19T19:30:00-03:00'),
]

// Justo en alertaDesde ya cuenta; null nunca; la que más se pasó primero.
const e = excedidas(filas, AHORA)
assert.deepEqual(e.map((f) => f.id), ['hace-rato', 'recien', 'justo'])

// Los excedidos van primero sin perder el orden de cada grupo.
assert.deepEqual(
  primeroExcedidas([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], new Set(['c', 'a'])).map((f) => f.id),
  ['a', 'c', 'b', 'd'],
)

console.log('permanencia: ok')
