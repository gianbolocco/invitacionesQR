import { describe, it, expect } from 'vitest'
import { todayInBuenosAires, weekdayInBuenosAires, unMesDespues } from '../src/lib/dates.js'

describe('fechas en Buenos Aires', () => {
  it('a las 02:00 UTC sigue siendo el día anterior en Buenos Aires', () => {
    expect(todayInBuenosAires(new Date('2026-09-15T02:00:00Z'))).toBe('2026-09-14')
  })

  it('a las 12:00 UTC ya es el mismo día', () => {
    expect(todayInBuenosAires(new Date('2026-09-15T12:00:00Z'))).toBe('2026-09-15')
  })

  it('devuelve el día de semana local, no el UTC', () => {
    // 2026-09-15T02:00Z es martes en UTC pero lunes (1) en Buenos Aires
    expect(weekdayInBuenosAires(new Date('2026-09-15T02:00:00Z'))).toBe(1)
  })
})

describe('unMesDespues', () => {
  it('es el mismo día del mes siguiente, o el último si no existe', () => {
    expect(unMesDespues('2026-10-19')).toBe('2026-11-19')
    expect(unMesDespues('2026-12-15')).toBe('2027-01-15')
    expect(unMesDespues('2026-01-31')).toBe('2026-02-28')
  })
})
