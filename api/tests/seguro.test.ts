import { describe, it, expect } from 'vitest'
import { pideSeguro, seguroCompleto, seguroVigente } from '../src/lib/seguro.js'
const ba = (iso: string) => new Date(`${iso}-03:00`)
describe('seguro', () => {
  it('lo pide un proveedor de un rubro que lo pide', () => {
    expect(pideSeguro('proveedor', null, true)).toBe(true)
    expect(pideSeguro('frecuente', 'proveedor', true)).toBe(true)
    expect(pideSeguro('frecuente', 'visita', true)).toBe(false)
    expect(pideSeguro('proveedor', null, false)).toBe(false)
    expect(pideSeguro('proveedor', null, null)).toBe(false) // sin rubro
    expect(pideSeguro('visita', null, true)).toBe(false)
  })
  it('completo son los tres campos con texto', () => {
    expect(seguroCompleto('La Segunda', '4471-22', '2027-04-12')).toBe(true)
    expect(seguroCompleto('La Segunda', '', '2027-04-12')).toBe(false)
    expect(seguroCompleto(null, null, null)).toBe(false)
  })
  it('vale hasta el día que vence inclusive, en Buenos Aires', () => {
    expect(seguroVigente('2026-10-21', ba('2026-10-21T23:59'))).toBe(true)
    expect(seguroVigente('2026-10-21', ba('2026-10-22T00:00'))).toBe(false)
  })
})
