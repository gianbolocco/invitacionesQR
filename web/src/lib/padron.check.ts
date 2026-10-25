/** `node src/lib/padron.check.ts`. */
import assert from 'node:assert/strict'
import { mismaPatente, normalizarDoc, normalizarPatente } from './padron.ts'
assert.equal(normalizarDoc('30.123.456'), '30123456')
assert.equal(normalizarDoc('aaa 123-456'), 'AAA123456')
assert.equal(normalizarPatente('ab-123 cd'), 'AB123CD')
assert.equal(normalizarPatente(' - '), '')
assert.equal(mismaPatente('AB 123 CD', 'ab123cd'), true)
assert.equal(mismaPatente('AB 123 CD', 'AB 123 CE'), false)
assert.equal(mismaPatente(null, ''), true)
console.log('padron: ok')
