/** `node src/lib/carga-manual.check.ts`. */
import assert from 'node:assert/strict'
import { aInstante, pisaOtra, resumenCarga, validarCarga, type Carga } from './carga-manual.ts'

// Buenos Aires es UTC-3: las 21:10 de allá son las 00:10 UTC del día siguiente.
assert.equal(aInstante({ fecha: '2026-10-15', hora: '21:10' }), '2026-10-15T21:10:00-03:00')
assert.equal(new Date(aInstante({ fecha: '2026-10-15', hora: '21:10' })).toISOString(), '2026-10-16T00:10:00.000Z')

// "Ahora" fijo: 16/10 a las 12:00 de Buenos Aires.
const AHORA = new Date('2026-10-16T12:00:00-03:00')
const m = (fecha: string, hora: string) => ({ fecha, hora })

assert.equal(validarCarga({ entrada: m('2026-10-15', '21:10'), salida: m('2026-10-15', '22:40') }, AHORA), null)
assert.equal(validarCarga({ entrada: m('2026-10-16', '10:00'), salida: null }, AHORA), null)
assert.match(validarCarga({ entrada: m('2026-10-16', ''), salida: null }, AHORA)!, /ingreso/)
assert.match(validarCarga({ entrada: m('2026-10-16', '13:00'), salida: null }, AHORA)!, /todavía no pasó/)
assert.match(validarCarga({ entrada: m('2026-10-13', '11:00'), salida: null }, AHORA)!, /48 horas/)
assert.match(validarCarga({ entrada: m('2026-10-16', '09:00'), salida: m('2026-10-16', '08:00') }, AHORA)!, /anterior/)
assert.match(validarCarga({ entrada: m('2026-10-16', '09:00'), salida: m('2026-10-16', '12:30') }, AHORA)!, /salida todavía/)
assert.match(validarCarga({ entrada: m('2026-10-16', '09:00'), salida: m('2026-10-16', '') }, AHORA)!, /salida/)

const c = (clave: string, id: string, e: string, s: string | null): Carga => ({
  clave, invitationId: id, guestName: id, unitLabel: 'Lote 1',
  entrada: m('2026-10-16', e), salida: s ? m('2026-10-16', s) : null, nota: '',
})
const tanda = [c('1', 'a', '08:00', '09:00')]
assert.equal(pisaOtra(c('2', 'a', '08:30', '09:30'), tanda), true)
assert.equal(pisaOtra(c('2', 'a', '09:00', '10:00'), tanda), false) // se tocan en el borde
assert.equal(pisaOtra(c('2', 'b', '08:30', '09:30'), tanda), false) // otra persona
assert.equal(pisaOtra(c('2', 'a', '08:30', null), tanda), true) // abierta desde adentro del rango
assert.equal(pisaOtra(c('2', 'a', '07:00', '07:30'), [c('1', 'a', '08:00', null)]), false) // antes de una abierta

assert.equal(resumenCarga(c('1', 'a', '21:10', '22:40'), '2026-10-16'), 'Ingresó 21:10 · Salió 22:40')
assert.equal(resumenCarga(c('1', 'a', '21:10', null), '2026-10-17'), 'Ingresó 16/10 21:10 · Sigue adentro')

console.log('carga-manual: ok')
