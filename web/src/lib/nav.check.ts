/**
 * Chequeo de la navegación. `node src/lib/nav.check.ts` (node 24 lee TS solo).
 *
 * El front no tiene runner de tests y no hace falta montar uno para esto: lo
 * único que decide algo acá es a qué sección pertenece cada ruta.
 */
import assert from 'node:assert/strict'
import { NAV, TOPE_BARRA, esActivo, seccionDe } from './nav.ts'

// El vecino y el guardia van a la barra inferior; el admin, al desplegable.
assert.ok(NAV.vecino.length <= TOPE_BARRA, 'el vecino entra en la barra')
assert.ok(NAV.garita.length <= TOPE_BARRA, 'la garita entra en la barra')
assert.ok(NAV.admin.length > TOPE_BARRA, 'el admin va al desplegable')

// Todo ítem de barra necesita ícono: sin él queda una etiqueta suelta abajo.
for (const item of [...NAV.vecino, ...NAV.garita]) {
  assert.ok(item.icono, `${item.href} sin ícono`)
}

assert.equal(seccionDe('/', 'resident'), 'vecino')
assert.equal(seccionDe('/historial', 'resident'), 'vecino')
assert.equal(seccionDe('/garita', 'guard'), 'garita')
assert.equal(seccionDe('/garita/escanear', 'guard'), 'garita')
assert.equal(seccionDe('/garita/auditoria', 'guard'), 'garita')
assert.equal(seccionDe('/admin/usuarios', 'admin'), 'admin')

// La que tiene gracia: auditoría es de los dos menús. Al admin le queda como
// una solapa más de su sección; al guardia, como la garita.
assert.equal(seccionDe('/garita/auditoria', 'admin'), 'admin')
assert.equal(seccionDe('/garita', 'admin'), 'garita')

// Un admin mirando la home del vecino sigue en la sección del vecino.
assert.equal(seccionDe('/', 'admin'), 'vecino')

// esActivo: '/' es exacta, el resto por prefijo. Si no, Invitaciones quedaría
// marcada como activa en todas las pantallas.
assert.equal(esActivo('/', '/'), true)
assert.equal(esActivo('/', '/historial'), false)
assert.equal(esActivo('/garita', '/garita/auditoria'), true)
assert.equal(esActivo('/historial', '/'), false)

console.log('nav: ok')
