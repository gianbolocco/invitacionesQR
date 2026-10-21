/** `node src/lib/franjas.check.ts`. */
import assert from 'node:assert/strict'
import { textoDias, textoHorario, franjasDelRubro, diasSinFranja, vigentesHoy, detalleFueraDeHorario, type Franja } from './franjas.ts'

const P = 'pileta'
const alamo: Franja[] = [
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: { from: '04-01', to: '10-31' }, trades: null },
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00', season: { from: '11-01', to: '03-31' }, trades: null },
  { days: [6], from: '08:00', to: '13:00', season: null, trades: [P] },
]
assert.equal(textoDias([1, 2, 3, 4, 5]), 'Lunes a viernes')
assert.equal(textoDias([6]), 'Sábados')
assert.equal(textoDias([0, 1, 2, 3, 4, 5, 6]), 'Todos los días')
assert.equal(textoDias([1, 3, 5]), 'Lun, Mié, Vie')
assert.equal(textoHorario(alamo[0]), 'Lunes a viernes, 8 a 17')
assert.equal(textoHorario({ ...alamo[0], from: '08:30', to: '24:00' }), 'Lunes a viernes, 8:30 a 24')
assert.equal(franjasDelRubro(alamo, 'plomero').length, 2)
assert.equal(franjasDelRubro(alamo, P).length, 3)
assert.equal(franjasDelRubro(alamo, null).length, 2)
// Un día "sin franja" es uno que ninguna franja del rubro cubre, en ninguna temporada.
assert.deepEqual(diasSinFranja(alamo, 'plomero', [1, 3, 6]), [6])
assert.deepEqual(diasSinFranja(alamo, P, [1, 6]), [])
assert.deepEqual(diasSinFranja([], 'plomero', [0, 6]), [])
// 21/10, martes, 17:40 en Buenos Aires.
const martes = new Date('2026-10-21T17:40:00-03:00')
assert.deepEqual(vigentesHoy(alamo, martes), [alamo[0], alamo[2]])
assert.equal(detalleFueraDeHorario(franjasDelRubro(alamo, 'plomero'), 'Plomero', martes),
  'Plomero: lunes a viernes de 8 a 17 · Son las 17:40')
const sabado = new Date('2026-10-24T10:00:00-03:00')
assert.equal(detalleFueraDeHorario(franjasDelRubro(alamo, 'plomero'), 'Plomero', sabado),
  'Su rubro no entra los sábados')
console.log('franjas: ok')
