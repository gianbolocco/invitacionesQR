/** `node src/lib/estado-invitacion.check.ts`. */
import assert from 'node:assert/strict'
import { estadoInvitacion } from './estado-invitacion.ts'

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

console.log('estado-invitacion: ok')
