/** `node src/lib/fechas.check.ts`. Node 24 corre TypeScript solo. */
import assert from 'node:assert/strict'
import {
  hoyISO, sumarDias, aFecha, aISO, fechaCorta, fechaNumerica, hora, fechaHora, horaODia, tituloDia, cupoTexto,
} from './fechas.ts'

// Las 23:30 del 10 de octubre en Buenos Aires ya son el 11 en UTC: el día
// tiene que salir en hora local, que es cuando más gente entra al barrio.
assert.equal(hoyISO(new Date('2026-10-11T02:30:00Z')), '2026-10-10')

assert.equal(sumarDias('2026-10-11', 1), '2026-10-12')
assert.equal(sumarDias('2026-10-01', -1), '2026-09-30')
assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')

assert.equal(aISO(aFecha('2026-03-05')), '2026-03-05')
assert.equal(fechaCorta('2026-09-14'), '14 sept')
assert.equal(fechaNumerica('2026-09-04'), '04/09')
assert.equal(hora('2026-10-11T17:02:00Z'), '14:02')
assert.equal(hora('2026-10-11T12:05:00Z'), '09:05')
assert.equal(hora('2026-10-11T03:00:00Z'), '00:00')
assert.equal(fechaHora('2026-10-11T17:02:00Z'), '11/10, 14:02')
assert.equal(fechaHora('2026-10-04T17:02:00Z'), '04/10, 14:02')
assert.equal(horaODia('2026-10-11T17:02:00Z', '2026-10-11'), '14:02')
assert.equal(horaODia('2026-10-12T11:30:00Z', '2026-10-11'), '12/10, 08:30')
// 23:30 en Buenos Aires ya es el día siguiente en UTC: sigue siendo el mismo día.
assert.equal(horaODia('2026-10-12T02:30:00Z', '2026-10-11'), '23:30')

assert.equal(tituloDia('2026-10-11', '2026-10-11'), 'Hoy')
assert.equal(tituloDia('2026-10-12', '2026-10-11'), 'Mañana')
assert.equal(tituloDia('2026-10-10', '2026-10-11'), 'Ayer')
// El coma depende de la versión de CLDR: se acepta con y sin él.
assert.match(tituloDia('2026-10-14', '2026-10-11'), /^miércoles,? 14 de octubre$/)

// Bug: una frecuente mostraba "0 de 999 entraron". 999 es un centinela, no
// un cupo: para las frecuentes se cuentan ingresos.
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 0 }), 'Sin ingresos todavía')
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 1 }), '1 ingreso')
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 7 }), '7 ingresos')
assert.equal(cupoTexto({ kind: 'visita', capacity: 4, usedCount: 2 }), '2 de 4 entraron')
assert.equal(cupoTexto({ kind: 'visita', capacity: 1, usedCount: 0 }), null)

console.log('fechas: ok')
