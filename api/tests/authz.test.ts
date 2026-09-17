import { describe, it, expect } from 'vitest'
import { canEnter, type InvitationLike } from '../src/authz.js'

const base: InvitationLike = {
  validFrom: '2026-09-14', validTo: '2026-09-14',
  weekdays: null, capacity: 1, revokedAt: null,
}

// 2026-09-14 es lunes. 15:00 en Buenos Aires = 18:00 UTC.
const lunes15h = new Date('2026-09-14T18:00:00Z')

describe('canEnter', () => {
  it('autoriza dentro de la ventana con cupo disponible', () => {
    expect(canEnter(base, lunes15h, 0)).toEqual({ ok: true })
  })

  it('rechaza si está revocada', () => {
    expect(canEnter({ ...base, revokedAt: new Date() }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'revoked' })
  })

  it('rechaza si todavía no empezó', () => {
    expect(canEnter({ ...base, validFrom: '2026-09-20', validTo: '2026-09-20' }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'not_yet' })
  })

  it('rechaza si ya venció', () => {
    expect(canEnter({ ...base, validFrom: '2026-09-01', validTo: '2026-09-10' }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('rechaza si el día de semana no está habilitado', () => {
    // 1 = lunes. Solo martes (2) y jueves (4) habilitados.
    expect(canEnter({ ...base, validTo: '2026-12-31', weekdays: [2, 4] }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'wrong_weekday' })
  })

  it('autoriza si el día de semana sí está habilitado', () => {
    expect(canEnter({ ...base, validTo: '2026-12-31', weekdays: [1, 3] }, lunes15h, 0))
      .toEqual({ ok: true })
  })

  it('weekdays vacío se trata como "todos los días"', () => {
    expect(canEnter({ ...base, validTo: '2026-12-31', weekdays: [] }, lunes15h, 0))
      .toEqual({ ok: true })
  })

  it('rechaza cuando se agotó el cupo', () => {
    expect(canEnter(base, lunes15h, 1)).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('un cupo de 30 deja pasar al 30 pero no al 31', () => {
    const invitacion = { ...base, capacity: 30 }
    expect(canEnter(invitacion, lunes15h, 29)).toEqual({ ok: true })
    expect(canEnter(invitacion, lunes15h, 30)).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('el último día vale hasta las 23:59 de Buenos Aires', () => {
    // 2026-09-15T02:00Z = 2026-09-14 23:00 en Buenos Aires: todavía vale.
    expect(canEnter(base, new Date('2026-09-15T02:00:00Z'), 0)).toEqual({ ok: true })
    // 2026-09-15T04:00Z = 2026-09-15 01:00 en Buenos Aires: ya venció.
    expect(canEnter(base, new Date('2026-09-15T04:00:00Z'), 0)).toEqual({ ok: false, reason: 'expired' })
  })

  it('la revocación gana sobre cualquier otro motivo', () => {
    const rota = { ...base, revokedAt: new Date(), validFrom: '2026-01-01', validTo: '2026-01-02' }
    expect(canEnter(rota, lunes15h, 99)).toEqual({ ok: false, reason: 'revoked' })
  })

  it('la ventana gana sobre el cupo: una vencida dice vencida, no sin cupo', () => {
    const vencida = { ...base, validFrom: '2026-01-01', validTo: '2026-01-02' }
    expect(canEnter(vencida, lunes15h, 99)).toEqual({ ok: false, reason: 'expired' })
  })
})
