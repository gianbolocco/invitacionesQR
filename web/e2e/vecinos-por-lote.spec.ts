import { entrar, expect, test } from './sesion'

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

test('el admin filtra el padrón por cuenta sin activar y por sin lote', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/vecinos')
  // El estado de la cuenta queda a la vista; el lote vive en el panel de "Filtros".
  const abrir = () => page.getByRole('button', { name: /^Filtros/ }).click()
  const cerrar = () => page.getByRole('button', { name: /^Ver \d+ (resultado|resultados)/ }).click()

  await page.getByRole('button', { name: /^Sin activar/ }).click()
  // La cuenta sin activar se marca con su estado; el chip del filtro dice lo mismo y no cuenta.
  const fueraDeBotones = page.locator(':not(button *)')
  await expect(page.getByText(/Sin activar/).and(fueraDeBotones).first()).toBeVisible()
  // Los que ya tienen cuenta no figuran.
  await expect(page.getByText(/\bActiva\b/)).toHaveCount(0)

  await abrir()
  await page.getByRole('button', { name: /^Sin lote/ }).click()
  await cerrar()
  await expect(page.getByText(/Lote \d+/)).toHaveCount(0)
  // El filtro puesto queda a la vista y se saca desde ahí.
  await page.getByRole('button', { name: 'Quitar Sin lote' }).click()

  // El contador va pegado a la etiqueta ("Todos12"), sin espacio en el nombre accesible.
  await page.getByRole('button', { name: /^Todos\d*$/ }).click()
  await expect(page.getByText(/\bActiva\b/).first()).toBeVisible()
})
