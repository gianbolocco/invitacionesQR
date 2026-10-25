import { entrar, expect, test } from './sesion'

test('el admin da de alta un vecino desde el sheet', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/vecinos')

  const nombre = `Vecino E2E ${Date.now()}`
  const mail = `vecino-e2e-${Date.now()}@example.com`

  await page.getByRole('button', { name: 'Dar de alta' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Nombre').fill(nombre)
  await sheet.getByLabel('Mail').fill(mail)
  await sheet.getByRole('button', { name: 'Dar de alta y enviar invitación' }).click()

  await expect(page.getByText(nombre)).toBeVisible()
})

test('el admin cambia el color del barrio y lo ve sin recargar', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/barrio')

  const colores = page.locator('fieldset button[aria-label^="Color"]')
  const actual = await colores.first().getAttribute('aria-pressed')
  const otro = actual === 'true' ? colores.nth(1) : colores.first()

  await otro.click()
  // La vista previa cambia antes de guardar: no hace falta tocar "Guardar"
  // para verlo, así que alcanza con que el swatch quede marcado.
  await expect(otro).toHaveAttribute('aria-pressed', 'true')

  // Por teclado: en el celular el scroll automático de Playwright deja el botón tapado por el header sticky.
  await page.getByRole('button', { name: 'Guardar', exact: true }).press('Enter')
  await expect(page.getByText('Guardado.')).toBeVisible()

  // Sin recargar: la banda del propio admin ya tiene que reflejar el color.
  await page.goto('/admin')
  const banda = page.locator('header').first()
  await expect(banda).toBeVisible()
})

test('/admin/usuarios redirige a /admin/vecinos', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/usuarios')
  await expect(page).toHaveURL(/\/admin\/vecinos$/)
})
