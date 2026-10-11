import { describe, it, expect } from 'vitest'
import { slug } from '../src/lib/slug.js'

describe('slug', () => {
  it('saca tildes y espacios', () => {
    expect(slug('Álamo Alto')).toBe('alamo-alto')
    expect(slug('  Barrio  Los Ñandúes ')).toBe('barrio-los-nandues')
  })

  it('un nombre sin letras ni números queda vacío', () => {
    expect(slug('¡¡¡')).toBe('')
  })
})
