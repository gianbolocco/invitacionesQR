import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el admin ve el padrón agrupado por lote y ya no existe la página de unidades', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/vecinos')

  await page.getByRole('button', { name: 'Por lote' }).click()
  // Cada lote es una sección con su título y la cuenta de vecinos.
  await expect(page.getByRole('region', { name: /^Lote \d+/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByRole('region', { name: /^Lote \d+/ })).toHaveCount(0)

  // La navegación ya no ofrece Unidades.
  await expect(page.getByRole('link', { name: 'Unidades' })).toHaveCount(0)
  await page.goto('/admin/unidades')
  await expect(page.getByText(/no existe|No encontramos|404/i).first()).toBeVisible()
})
