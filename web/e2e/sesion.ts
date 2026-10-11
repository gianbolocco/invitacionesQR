import type { Page } from '@playwright/test'

export const PASS = 'e2e-contrasena-larga'
export const CUENTAS = {
  admin: 'e2e.admin@visitpass.test',
  vecino: 'e2e.vecino@visitpass.test',
  guardia: 'e2e.guardia@visitpass.test',
} as const

/** Entra por el formulario de login, como lo haría una persona. */
export async function entrar(page: Page, quien: keyof typeof CUENTAS) {
  await page.goto('/login')
  await page.getByLabel('Mail').fill(CUENTAS[quien])
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Esperar a que el login termine: si no, el próximo goto lo corta a la mitad.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}
