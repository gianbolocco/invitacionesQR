import { describe, it, expect } from 'vitest'
import { randomToken, sha256, hashPassword, verifyPassword } from '../src/lib/crypto.js'

describe('crypto', () => {
  it('genera tokens distintos y sin caracteres de URL', () => {
    const a = randomToken(), b = randomToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('sha256 es estable', () => {
    expect(sha256('hola')).toBe(sha256('hola'))
    expect(sha256('hola')).not.toBe(sha256('chau'))
  })

  it('verifica una contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una-contrasena-larga')
    expect(await verifyPassword(hash, 'una-contrasena-larga')).toBe(true)
    expect(await verifyPassword(hash, 'otra-cosa')).toBe(false)
  })
})
