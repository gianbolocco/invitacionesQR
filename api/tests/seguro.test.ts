import { describe, it, expect } from 'vitest'
import { claveSeguro, pideSeguro, seguroCompleto, seguroVigente } from '../src/lib/seguro.js'
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
  it('claveSeguro: no aplica, sin cargar, vencido, por vencer y vigente', () => {
    const s = (expiresOn: string) => ({ company: 'La Caja', policy: '1', expiresOn })
    const ahora = ba('2026-10-24T10:00')
    expect(claveSeguro(false, s('2026-10-20'), 15, ahora)).toBe('no_aplica')
    expect(claveSeguro(true, null, 15, ahora)).toBe('sin_cargar')
    expect(claveSeguro(true, s('2026-10-23'), 15, ahora)).toBe('vencido')
    expect(claveSeguro(true, s('2026-10-24'), 15, ahora)).toBe('por_vencer')
    expect(claveSeguro(true, s('2026-11-08'), 15, ahora)).toBe('por_vencer')
    expect(claveSeguro(true, s('2026-11-09'), 15, ahora)).toBe('vigente')
    expect(claveSeguro(true, s('2026-10-24'), null, ahora)).toBe('vigente')
  })
})
