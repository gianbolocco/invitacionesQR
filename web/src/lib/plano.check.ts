import assert from 'node:assert/strict'
import { loteDeLabel, urlPlano } from './plano.ts'
assert.equal(loteDeLabel('Lote 87'), '87')
assert.equal(loteDeLabel('87'), '87')
assert.equal(loteDeLabel('Casa A'), null)
assert.equal(loteDeLabel('Lote 12 bis'), '12')
assert.equal(urlPlano('/api', 3, '87'), '/api/branding/plano?v=3&lote=87')
assert.equal(urlPlano('/api', 3, null), '/api/branding/plano?v=3')
console.log('plano: ok')
