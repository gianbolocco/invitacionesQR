/** `node src/lib/contactos.check.ts`. */
import assert from 'node:assert/strict'
import { agruparContactos, filtrarContactos, lineaContacto, type Contacto } from './contactos.ts'

const c = (o: Partial<Contacto>): Contacto => ({
  id: o.name ?? 'x', unitId: 'u', kind: 'visita', name: 'X', doc: null, tradeId: null, tradeName: null,
  insuranceState: 'no_aplica', insuranceExpiresOn: null, ...o,
})
const rosa = c({ name: 'Rosa Benítez', doc: '28.443.120' })
const carlos = c({ name: 'Carlos Gómez', kind: 'proveedor', tradeName: 'Jardinería', insuranceState: 'vigente', insuranceExpiresOn: '2027-03-12' })
const hugo = c({ name: 'Hugo Ríos', kind: 'proveedor', tradeName: 'Plomería', insuranceState: 'vencido', insuranceExpiresOn: '2026-10-10' })
const todos = [rosa, carlos, hugo]

assert.deepEqual(filtrarContactos(todos, 'benitez', 'todos'), [rosa])
assert.deepEqual(filtrarContactos(todos, '28443', 'todos'), [rosa])
assert.deepEqual(filtrarContactos(todos, '', 'proveedor'), [carlos, hugo])
assert.deepEqual(filtrarContactos(todos, 'rios', 'visita'), [])
assert.deepEqual(agruparContactos(todos), { visitas: [rosa], proveedores: [carlos, hugo] })
assert.equal(lineaContacto(rosa), 'DNI 28.443.120')
assert.equal(lineaContacto(c({ name: 'Mamá' })), 'Visita')
assert.equal(lineaContacto(carlos), 'Jardinería · Seguro hasta 12/03/2027')
assert.equal(lineaContacto(hugo), 'Plomería · Seguro vencido')
assert.equal(lineaContacto({ ...hugo, insuranceState: 'sin_cargar', insuranceExpiresOn: null }), 'Plomería · Sin seguro cargado')
assert.equal(lineaContacto({ ...carlos, insuranceState: 'no_aplica', tradeName: null }), 'Proveedor')
console.log('contactos: ok')
