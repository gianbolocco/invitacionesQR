/** `node src/lib/seguros.check.ts`. */
import assert from 'node:assert/strict'
import { paramsSeguros, textoEstadoListado } from './seguros.ts'
const HOY = '2026-10-24'
assert.equal(textoEstadoListado('vencido', '2026-10-10', HOY), 'Vencido hace 14 días')
assert.equal(textoEstadoListado('vencido', '2026-10-23', HOY), 'Vencido ayer')
assert.equal(textoEstadoListado('por_vencer', '2026-10-29', HOY), 'Vence en 5 días')
assert.equal(textoEstadoListado('por_vencer', '2026-10-24', HOY), 'Vence hoy')
assert.equal(textoEstadoListado('por_vencer', '2026-10-25', HOY), 'Vence mañana')
assert.equal(textoEstadoListado('vigente', '2027-03-12', HOY), 'Vigente')
assert.equal(textoEstadoListado('sin_cargar', null, HOY), 'Sin cargar')
assert.equal(paramsSeguros({ estado: 'todos', q: '' }).toString(), '')
assert.equal(paramsSeguros({ estado: 'vencido', q: ' AE ' }).toString(), 'estado=vencido&q=AE')
console.log('seguros: ok')
