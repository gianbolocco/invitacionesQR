import { describe, it, expect } from 'vitest'
import { dentroDeFranja, temporadaRige, aplicaFranjas, type Franja } from '../src/lib/franjas.js'

const PILETA = 'p', PLOMERO = 'x'
const alamo: Franja[] = [
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: { from: '04-01', to: '10-31' }, trades: null },
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00', season: { from: '11-01', to: '03-31' }, trades: null },
  { days: [6], from: '08:00', to: '13:00', season: null, trades: [PILETA] },
]
// Hora de Buenos Aires = UTC-3. 2026-10-20 es martes; 2026-10-24, sábado.
const ba = (iso: string) => new Date(`${iso}-03:00`)

describe('franjas', () => {
  it('sin franjas, todo pasa', () => expect(dentroDeFranja([], PLOMERO, ba('2026-10-25T03:00'))).toBe(true))
  it('martes 16:59 entra, 17:00 no', () => {
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-20T16:59'))).toBe(true)
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-20T17:00'))).toBe(false)
  })
  it('en verano rige 8 a 18', () => expect(dentroDeFranja(alamo, PLOMERO, ba('2026-11-03T17:30'))).toBe(true))
  it('el sábado solo piletero', () => {
    expect(dentroDeFranja(alamo, PILETA, ba('2026-10-24T10:00'))).toBe(true)
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-24T10:00'))).toBe(false)
  })
  it('sin rubro, solo las franjas de todos', () => {
    expect(dentroDeFranja(alamo, null, ba('2026-10-20T10:00'))).toBe(true)
    expect(dentroDeFranja(alamo, null, ba('2026-10-24T10:00'))).toBe(false)
  })
  it('24:00 incluye las 23:59', () =>
    expect(dentroDeFranja([{ days: [0], from: '00:00', to: '24:00', season: null, trades: null }], null, ba('2026-10-25T23:59'))).toBe(true))
  it('temporada que cruza el año', () => {
    const verano = { from: '11-01', to: '03-31' }
    expect(temporadaRige(verano, '01-15')).toBe(true)
    expect(temporadaRige(verano, '03-31')).toBe(true)
    expect(temporadaRige(verano, '04-01')).toBe(false)
    expect(temporadaRige({ from: '04-01', to: '10-31' }, '10-31')).toBe(true)
  })
  it('aplica a proveedores y frecuentes que vienen a trabajar', () => {
    expect(aplicaFranjas('proveedor', null)).toBe(true)
    expect(aplicaFranjas('frecuente', 'proveedor')).toBe(true)
    expect(aplicaFranjas('frecuente', 'visita')).toBe(false)
    expect(aplicaFranjas('frecuente', null)).toBe(false)
    expect(aplicaFranjas('visita', null)).toBe(false)
  })
})
