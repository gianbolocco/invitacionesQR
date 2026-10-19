import { describe, it, expect } from 'vitest'
import { invitationEmail, passwordResetEmail } from '../src/lib/mail-templates.js'

const brand = {
  name: 'Álamo <Alto>',
  color: '#14565c',
  logoUrl: 'https://barrio.example/api/branding/logo?v=123',
}

describe('plantillas de correo', () => {
  it('marca la invitación con el barrio, color, logo y link en texto plano', () => {
    const email = invitationEmail(brand, 'Ana & Juan', 'https://barrio.example/acceso?t=token', 7)

    expect(email.subject).toContain('Álamo <Alto>')
    expect(email.html).toContain('bgcolor="#14565c"')
    expect(email.html).toContain('https://barrio.example/api/branding/logo?v=123')
    expect(email.html).toContain('Ana &amp; Juan')
    expect(email.html).not.toContain('Hola, Ana & Juan')
    expect(email.text).toContain('Hola, Ana & Juan.')
    expect(email.text).toContain('https://barrio.example/acceso?t=token')
    expect(email.text).toContain('7 días')
  })

  it('marca el reset y explica su vencimiento en HTML y texto plano', () => {
    const email = passwordResetEmail(brand, 'Ana', 'https://barrio.example/reset?t=token', 15)

    expect(email.subject).toContain('Álamo <Alto>')
    expect(email.html).not.toMatch(/visitpass/i)
    expect(email.html).toContain('Restablecer contraseña')
    expect(email.text).toContain('https://barrio.example/reset?t=token')
    expect(email.text).toContain('15 minutos')
  })
})
