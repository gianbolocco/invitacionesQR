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

test('el admin filtra el padrón por cuenta sin activar y por sin lote', async ({ page, isMobile }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/vecinos')
  // En el celular los filtros viven en una hoja detrás del botón "Filtros".
  const abrir = async () => { if (isMobile) await page.getByRole('button', { name: /^Filtros/ }).click() }
  const cerrar = async () => { if (isMobile) await page.getByRole('button', { name: /^Ver \d+ (resultado|resultados)/ }).click() }

  await abrir()
  await page.getByRole('button', { name: /^Sin activar/ }).click()
  await cerrar()
  await expect(page.getByText(/Invitado, todavía no entró/).first()).toBeVisible()
  // Los que ya tienen cuenta no figuran.
  await expect(page.getByText(/ · Activo · /)).toHaveCount(0)

  await abrir()
  await page.getByRole('button', { name: /^Sin lote/ }).click()
  await cerrar()
  await expect(page.getByText(/Lote \d+ · /)).toHaveCount(0)

  await abrir()
  // El contador va pegado a la etiqueta ("Todos12"), sin espacio en el nombre accesible.
  await page.getByRole('button', { name: /^Todos\d*$/ }).click()
  await page.getByRole('button', { name: /^Todos los lotes/ }).click()
  await cerrar()
  await expect(page.getByText(/Activo/).first()).toBeVisible()
})
