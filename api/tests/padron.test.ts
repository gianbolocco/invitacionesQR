import { describe, it, expect } from 'vitest'
import { normalizarDoc, normalizarPatente } from '../src/lib/padron.js'

describe('normalización del padrón', () => {
  it('un DNI con puntos y otro sin ellos son el mismo', () => {
    expect(normalizarDoc('30.123.456')).toBe('30123456')
    expect(normalizarDoc(' 30123456 ')).toBe('30123456')
  })
  it('un pasaporte conserva las letras, en mayúscula', () => {
    expect(normalizarDoc('aaa 123-456')).toBe('AAA123456')
  })
  it('una patente con espacios, guiones o minúsculas es la misma', () => {
    expect(normalizarPatente('ab-123 cd')).toBe('AB123CD')
    expect(normalizarPatente('ABC 123')).toBe('ABC123')
  })
  it('lo que no tiene letras ni dígitos queda vacío', () => {
    expect(normalizarDoc(' .-. ')).toBe('')
    expect(normalizarPatente('')).toBe('')
  })
})
