/** `node src/lib/estado-invitacion.check.ts`. */
import assert from 'node:assert/strict'
import { estadoEnAgenda, estadoInvitacion, sePuedeEditar } from './estado-invitacion.ts'

const HOY = '2026-10-11'
const base = { kind: 'visita', revokedAt: null, validTo: HOY, usedCount: 0, adentro: false }

assert.equal(estadoInvitacion(base, HOY), 'esperando')
// Anulada gana sobre todo, también sobre estar adentro: es lo que hay que saber.
assert.equal(estadoInvitacion({ ...base, revokedAt: '2026-10-11T10:00:00Z', adentro: true }, HOY), 'anulada')
assert.equal(estadoInvitacion({ ...base, adentro: true, usedCount: 1 }, HOY), 'adentro')
assert.equal(estadoInvitacion({ ...base, usedCount: 1 }, HOY), 'salio')
assert.equal(estadoInvitacion({ ...base, validTo: '2026-10-10' }, HOY), 'vencida')
// Una frecuente que ya entró y salió sigue esperando el próximo ingreso.
assert.equal(estadoInvitacion({ ...base, kind: 'frecuente', usedCount: 5 }, HOY), 'esperando')
// Una visita usada de un día que ya pasó cuenta como que salió, no como vencida.
assert.equal(estadoInvitacion({ ...base, validTo: '2026-10-01', usedCount: 1 }, HOY), 'salio')

// Solo se edita una pendiente que nunca se usó.
assert.equal(sePuedeEditar(base, HOY), true)
assert.equal(sePuedeEditar({ ...base, kind: 'frecuente', usedCount: 5 }, HOY), false)
assert.equal(sePuedeEditar({ ...base, adentro: true, usedCount: 1 }, HOY), false)
assert.equal(sePuedeEditar({ ...base, kind: 'delivery' }, HOY), false)
assert.equal(sePuedeEditar({ ...base, validTo: '2026-10-10' }, HOY), false)

// Agenda: la visita de ayer que no vino venció, no está pendiente.
const fila = { adentro: false, enteredCount: 0, validTo: HOY }
assert.equal(estadoEnAgenda(fila, HOY), 'esperando')
assert.equal(estadoEnAgenda({ ...fila, validTo: '2026-10-10' }, HOY), 'vencida')
assert.equal(estadoEnAgenda({ ...fila, validTo: '2026-10-10', enteredCount: 1 }, HOY), 'salio')
// Entró ayer con una invitación de ayer y no salió: adentro, no vencida.
assert.equal(estadoEnAgenda({ ...fila, validTo: '2026-10-10', adentro: true }, HOY), 'adentro')

// Delivery: vence por instante, aunque su día sea hoy.
const AHORA = new Date('2026-10-11T15:00:00Z')
const del = { ...base, kind: 'delivery' }
assert.equal(estadoInvitacion({ ...del, expiresAt: '2026-10-11T14:59:00Z' }, HOY, AHORA), 'vencida')
assert.equal(estadoInvitacion({ ...del, expiresAt: '2026-10-11T16:00:00Z' }, HOY, AHORA), 'esperando')
assert.equal(estadoEnAgenda({ ...fila, expiresAt: '2026-10-11T14:59:00Z' }, HOY, AHORA), 'vencida')
assert.equal(estadoEnAgenda({ ...fila, expiresAt: '2026-10-11T16:00:00Z' }, HOY, AHORA), 'esperando')

console.log('estado-invitacion: ok')
