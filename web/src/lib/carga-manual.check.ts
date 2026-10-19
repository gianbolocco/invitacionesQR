/** `node src/lib/carga-manual.check.ts`. */
import assert from 'node:assert/strict'
import {
  aInstante, aItems, errorDeFila, filaVacia, leerBorrador, momentosDe, normalizarHora, validarCarga,
  type FilaPlanilla,
} from './carga-manual.ts'

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

// La planilla: hora tipeada, fila → momentos, errores, items para la API, borrador.
assert.equal(normalizarHora('2140'), '21:40')
assert.equal(normalizarHora('9'), '09:00')
assert.equal(normalizarHora('21:4'), '21:04')
assert.equal(normalizarHora('25:00'), '')
const f = (o: Partial<FilaPlanilla>): FilaPlanilla => ({
  clave: 'x', ingreso: '23:30', persona: { nombre: 'Juan', unitId: 'u', lote: 'Lote 1' }, dni: '30123456', salida: '00:40', patente: '', ...o,
})
const mo = momentosDe('2026-10-15', f({}))
assert.equal(mo.masUnDia, true)
assert.equal(mo.salida!.fecha, '2026-10-16')
assert.match(errorDeFila('2026-10-15', f({ dni: '' }), [], AHORA)!, /DNI/)
assert.match(errorDeFila('2026-10-15', f({ dni: '1'.repeat(21) }), [], AHORA)!, /más de 20/)
assert.equal(errorDeFila('2026-10-15', f({ dni: '1'.repeat(20) }), [], AHORA), null)
assert.match(errorDeFila('2026-10-15', f({ persona: null }), [], AHORA)!, /persona/)
assert.match(errorDeFila('2026-10-15', f({ persona: { nombre: 'Juan', unitId: '', lote: '' } }), [], AHORA)!, /lote/)
assert.equal(errorDeFila('2026-10-15', f({}), [], AHORA), null)
assert.deepEqual(aItems({ fecha: '2026-10-15', filas: [f({ patente: ' ab123cd ' })] }, AHORA)[0], {
  guest: { name: 'Juan', unitId: 'u' }, guestDoc: '30123456', plate: 'AB123CD',
  enteredAt: '2026-10-15T23:30:00-03:00', exitedAt: '2026-10-16T00:40:00-03:00',
})
assert.equal(leerBorrador('{roto'), null)
assert.deepEqual(leerBorrador(JSON.stringify({ fecha: '2026-10-15', filas: [f({})] }))?.filas.length, 1)

// Filas con invitación: se pisan entre sí; las de gente sin invitación nunca.
const inv = (clave: string, ingreso: string, salida: string): FilaPlanilla =>
  f({ clave, ingreso, salida, persona: { invitationId: 'i1', nombre: 'Ana', lote: 'Lote 1', dniInvitacion: null } })
assert.match(errorDeFila('2026-10-16', inv('b', '08:30', '09:30'), [inv('a', '08:00', '09:00'), inv('b', '08:30', '09:30')], AHORA)!, /pisa/)
assert.equal(errorDeFila('2026-10-16', inv('b', '09:00', '10:00'), [inv('a', '08:00', '09:00'), inv('b', '09:00', '10:00')], AHORA), null)
assert.equal(errorDeFila('2026-10-16', f({ clave: 'b', ingreso: '08:30', salida: '09:30' }), [f({ clave: 'a', ingreso: '08:00', salida: '09:00' })], AHORA), null)
assert.equal(aItems({ fecha: '2026-10-16', filas: [inv('a', '08:00', '')] }, AHORA)[0].exitedAt, null)
assert.equal(aItems({ fecha: '2026-10-16', filas: [inv('a', '08:00', '')] }, AHORA)[0].invitationId, 'i1')

// aItems no calla errores; la fila en blanco se saltea.
const vacia = f({ ingreso: '', persona: null, dni: '', salida: '', patente: '' })
assert.equal(filaVacia(vacia), true)
assert.equal(aItems({ fecha: '2026-10-15', filas: [f({}), vacia] }, AHORA).length, 1)
assert.throws(() => aItems({ fecha: '2026-10-15', filas: [f({ persona: null })] }, AHORA), /fila 1/)
assert.throws(() => aItems({ fecha: '2026-10-15', filas: [vacia, f({ dni: '' })] }, AHORA), /fila 2/)

// leerBorrador descarta lo que no encaja y completa lo que falta.
const crudo = (filas: unknown[]) => JSON.stringify({ fecha: '2026-10-15', filas })
assert.equal(leerBorrador(crudo([null, f({})]))?.filas.length, 1)
const sinSalida: Partial<FilaPlanilla> = f({})
delete sinSalida.salida
assert.equal(leerBorrador(crudo([sinSalida]))?.filas[0].salida, '')
assert.equal(leerBorrador(crudo([f({ persona: { nombre: 'J', unitId: 5, lote: 'L' } as never })]))?.filas.length, 0)
assert.equal(leerBorrador(JSON.stringify({ filas: [] })), null)
assert.equal(leerBorrador(JSON.stringify({ fecha: 'x', filas: {} })), null)

// Bordes de hora.
assert.equal(normalizarHora(''), '')
assert.equal(normalizarHora('123'), '01:23')
assert.equal(momentosDe('2026-10-15', f({ ingreso: '10:00', salida: '10:00' })).masUnDia, false)
assert.match(errorDeFila('2026-10-15', f({ salida: 'abc' }), [], AHORA)!, /Completá.*salida/)

console.log('carga-manual: ok')
