/** `node src/lib/seguro.check.ts`. */
import assert from 'node:assert/strict'
import { estadoSeguro, textoVence } from './seguro.ts'
const s = (expiresOn: string | null, requiresInsurance = true) =>
  ({ requiresInsurance, insuranceCompany: expiresOn && 'La Segunda', insurancePolicy: expiresOn && '4471-22', insuranceExpiresOn: expiresOn })
const HOY = '2026-10-21'
assert.equal(estadoSeguro(s('2027-01-01', false), HOY, 15), 'no_aplica')
assert.equal(estadoSeguro(s(null), HOY, 15), 'sin_cargar')
assert.equal(estadoSeguro({ ...s('2027-01-01'), insuranceCompany: ' ' }, HOY, 15), 'sin_cargar')
assert.equal(estadoSeguro({ ...s('2027-01-01'), insurancePolicy: null }, HOY, 15), 'sin_cargar')
assert.equal(estadoSeguro(s('2026-10-20'), HOY, 15), 'vencido')
assert.equal(estadoSeguro(s('2026-10-21'), HOY, 15), 'por_vencer')   // vence hoy: vale, pero avisa
assert.equal(estadoSeguro(s('2026-11-05'), HOY, 15), 'por_vencer')   // 15 días justos
assert.equal(estadoSeguro(s('2026-11-06'), HOY, 15), 'vigente')
assert.equal(estadoSeguro(s('2026-10-22'), HOY, null), 'vigente')    // sin aviso configurado
assert.equal(textoVence('2026-10-26', HOY), 'vence en 5 días (26/10)')
assert.equal(textoVence('2026-10-22', HOY), 'vence mañana (22/10)')
assert.equal(textoVence('2026-10-21', HOY), 'vence hoy')
assert.equal(textoVence('2026-10-12', HOY), 'venció el 12/10')
console.log('seguro: ok')
