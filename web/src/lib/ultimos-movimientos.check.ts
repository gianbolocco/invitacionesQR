/** `node src/lib/ultimos-movimientos.check.ts`. */
import assert from 'node:assert/strict'
import { ultimosMovimientos } from './ultimos-movimientos.ts'

const filas = [
  { id: '1', guestName: 'Martín Gómez', lastEntryAt: '2026-10-11T17:06:00Z', lastExitAt: null },
  { id: '2', guestName: 'Rosa Benítez', lastEntryAt: '2026-10-11T16:40:00Z', lastExitAt: '2026-10-11T17:40:00Z' },
  { id: '3', guestName: 'Sofía Ledesma', lastEntryAt: null, lastExitAt: null },
]

const eventos = ultimosMovimientos(filas)
// Dos filas con movimiento dan tres eventos (Rosa entró Y salió): el más
// reciente primero.
assert.equal(eventos.length, 3)
assert.deepEqual(eventos[0], { invitationId: '2', guestName: 'Rosa Benítez', tipo: 'egreso', cuando: '2026-10-11T17:40:00Z' })
assert.deepEqual(eventos[1], { invitationId: '1', guestName: 'Martín Gómez', tipo: 'ingreso', cuando: '2026-10-11T17:06:00Z' })
assert.deepEqual(eventos[2], { invitationId: '2', guestName: 'Rosa Benítez', tipo: 'ingreso', cuando: '2026-10-11T16:40:00Z' })

// El tope corta, no filtra: sigue siendo el más reciente primero.
assert.equal(ultimosMovimientos(filas, [], 1).length, 1)
assert.equal(ultimosMovimientos(filas, [], 1)[0]?.tipo, 'egreso')

assert.deepEqual(ultimosMovimientos([]), [])

// Un paquete más reciente que todo lo demás va primero; uno viejo queda al final.
const paquetes = [
  { id: 'p1', unitLabel: 'Lote 12', notifiedAt: '2026-10-11T18:00:00Z' },
  { id: 'p2', unitLabel: 'Lote 7', notifiedAt: '2026-10-11T08:00:00Z' },
]
const conPaquetes = ultimosMovimientos(filas, paquetes, 10)
assert.equal(conPaquetes.length, 5)
assert.deepEqual(conPaquetes[0], { invitationId: 'p1', guestName: 'Lote 12', tipo: 'paquete', cuando: '2026-10-11T18:00:00Z' })
assert.equal(conPaquetes[4]?.tipo, 'paquete')

console.log('ultimos-movimientos: ok')
