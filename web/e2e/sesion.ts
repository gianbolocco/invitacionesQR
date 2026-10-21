import { expect, test as base, type Page } from '@playwright/test'

/**
 * El test de todos los specs: falla si el navegador bloquea algo por la CSP
 * (web/src/proxy.ts). Así un script o un recurso nuevo que la política no
 * contempla aparece acá y no en producción con la pantalla en blanco.
 */
export const test = base.extend<{ csp: void }>({
  csp: [async ({ page }, use) => {
    const bloqueos: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('Content Security Policy')) bloqueos.push(m.text())
    })
    await use()
    expect(bloqueos, 'violaciones de CSP').toEqual([])
  }, { auto: true }],
})
export { expect }

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
  await page.getByLabel('Contraseña', { exact: true }).fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Esperar a que el login termine: si no, el próximo goto lo corta a la mitad.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}
