/** `node src/lib/avisos.check.ts`. */
import assert from 'node:assert/strict'
import { estadoBanner, sinVerCount } from './avisos.ts'

const base = { habilitado: true, soportaPush: true, permiso: 'default', standalone: false, esIos: false, ahoraNo: false }

assert.equal(estadoBanner(base), 'activar')
assert.equal(estadoBanner({ ...base, habilitado: false }), 'oculto')
assert.equal(estadoBanner({ ...base, permiso: 'granted' }), 'oculto')
assert.equal(estadoBanner({ ...base, permiso: 'denied' }), 'oculto')
assert.equal(estadoBanner({ ...base, ahoraNo: true }), 'oculto')
assert.equal(estadoBanner({ ...base, soportaPush: false }), 'oculto')
// iOS sin instalar: no hay push todavía, se explica cómo instalar.
assert.equal(estadoBanner({ ...base, esIos: true, soportaPush: false }), 'instalar')
// iOS ya instalada: se pide el permiso como en cualquier lado.
assert.equal(estadoBanner({ ...base, esIos: true, standalone: true }), 'activar')
assert.equal(estadoBanner({ ...base, esIos: true, ahoraNo: true }), 'oculto')

assert.equal(sinVerCount([{ sinVer: true }, { sinVer: false }, { sinVer: true }]), 2)
assert.equal(sinVerCount([]), 0)

console.log('avisos: ok')
