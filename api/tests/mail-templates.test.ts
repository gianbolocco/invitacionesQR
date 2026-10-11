import { describe, it, expect } from 'vitest'
import { invitationEmail, passwordResetEmail } from '../src/lib/mail-templates.js'

const brand = {
  name: 'Álamo <Alto>',
  color: '#14565c',
  logoUrl: 'https://visitpass.quest/api/branding/logo?v=123',
}

describe('plantillas de correo de VisitPass', () => {
  it('marca la invitación con el barrio, color, logo y link en texto plano', () => {
    const email = invitationEmail(brand, 'Ana & Juan', 'https://visitpass.quest/acceso?t=token', 7)

    expect(email.subject).toContain('Álamo <Alto>')
    expect(email.html).toContain('background:#14565c')
    expect(email.html).toContain('https://visitpass.quest/api/branding/logo?v=123')
    expect(email.html).toContain('Ana &amp; Juan')
    expect(email.html).not.toContain('Hola, Ana & Juan')
    expect(email.text).toContain('Hola, Ana & Juan.')
    expect(email.text).toContain('https://visitpass.quest/acceso?t=token')
    expect(email.text).toContain('7 días')
  })

  it('marca el reset y explica su vencimiento en HTML y texto plano', () => {
    const email = passwordResetEmail(brand, 'Ana', 'https://visitpass.quest/reset?t=token', 15)

    expect(email.subject).toContain('VisitPass')
    expect(email.html).toContain('Restablecer contraseña')
    expect(email.text).toContain('https://visitpass.quest/reset?t=token')
    expect(email.text).toContain('15 minutos')
  })
})
