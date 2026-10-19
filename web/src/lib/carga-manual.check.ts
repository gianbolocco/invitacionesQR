/** `node src/lib/carga-manual.check.ts`. */
import assert from 'node:assert/strict'
import {
  aInstante, aItems, errorDeFila, leerBorrador, momentosDe, normalizarHora, pisaOtra, resumenCarga, validarCarga,
  type Carga, type FilaPlanilla,
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

// La planilla: hora tipeada, fila → momentos, errores, items para la API, borrador.
assert.equal(normalizarHora('2140'), '21:40')
assert.equal(normalizarHora('9'), '09:00')
assert.equal(normalizarHora('21:4'), '21:04')
assert.equal(normalizarHora('25:00'), '')
const f = (o: Partial<FilaPlanilla>): FilaPlanilla => ({
  clave: 'x', ingreso: '23:30', persona: { nombre: 'Juan', unitId: 'u', lote: 'Lote 1' }, dni: '30123456', salida: '00:40', nota: '', ...o,
})
const mo = momentosDe('2026-10-15', f({}))
assert.equal(mo.masUnDia, true)
assert.equal(mo.salida!.fecha, '2026-10-16')
assert.match(errorDeFila('2026-10-15', f({ dni: '' }), [], AHORA)!, /DNI/)
assert.match(errorDeFila('2026-10-15', f({ persona: null }), [], AHORA)!, /persona/)
assert.equal(errorDeFila('2026-10-15', f({}), [], AHORA), null)
assert.deepEqual(aItems({ fecha: '2026-10-15', filas: [f({ nota: 'corte' })] })[0], {
  guest: { name: 'Juan', unitId: 'u' }, guestDoc: '30123456',
  enteredAt: '2026-10-15T23:30:00-03:00', exitedAt: '2026-10-16T00:40:00-03:00', note: 'corte',
})
assert.equal(leerBorrador('{roto'), null)
assert.deepEqual(leerBorrador(JSON.stringify({ fecha: '2026-10-15', filas: [f({})] }))?.filas.length, 1)

// Filas con invitación: se pisan entre sí; las de gente sin invitación nunca.
const inv = (clave: string, ingreso: string, salida: string): FilaPlanilla =>
  f({ clave, ingreso, salida, persona: { invitationId: 'i1', nombre: 'Ana', lote: 'Lote 1', dniInvitacion: null } })
assert.match(errorDeFila('2026-10-16', inv('b', '08:30', '09:30'), [inv('a', '08:00', '09:00'), inv('b', '08:30', '09:30')], AHORA)!, /pisa/)
assert.equal(errorDeFila('2026-10-16', inv('b', '09:00', '10:00'), [inv('a', '08:00', '09:00'), inv('b', '09:00', '10:00')], AHORA), null)
assert.equal(errorDeFila('2026-10-16', f({ clave: 'b', ingreso: '08:30', salida: '09:30' }), [f({ clave: 'a', ingreso: '08:00', salida: '09:00' })], AHORA), null)
assert.equal(aItems({ fecha: '2026-10-16', filas: [inv('a', '08:00', '')] })[0].exitedAt, null)
assert.equal(aItems({ fecha: '2026-10-16', filas: [inv('a', '08:00', '')] })[0].invitationId, 'i1')

console.log('carga-manual: ok')
