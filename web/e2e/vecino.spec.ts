import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

/** Crea una invitación de visita desde la UI y devuelve su nombre. */
async function crearInvitacion(page: import('@playwright/test').Page) {
  const nombre = `Invitado E2E ${Date.now()}`
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
  await expect(page.getByText(nombre).first()).toBeVisible()
  return nombre
}

test('el vecino crea una invitación, copia el link y la anula con deshacer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await entrar(page, 'vecino')
  const nombre = await crearInvitacion(page)

  await page.getByRole('button', { name: 'Copiar link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/i\/[A-Za-z0-9_-]+$/)

  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: new RegExp(nombre) })).toHaveCount(0)

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('link', { name: new RegExp(nombre) })).toBeVisible()
})

test('el formulario no deja crear sin nombre', async ({ page }) => {
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page.getByText('Escribí el nombre de quien viene.')).toBeVisible()
  await expect(page).toHaveURL(/\/invitaciones\/nueva$/)
})

test('el invitado abre su pase y carga el documento', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await entrar(page, 'vecino')
  const nombre = await crearInvitacion(page)
  await page.getByRole('button', { name: 'Copiar link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())

  // Otra ventana, sin la sesión del vecino: como lo abriría el invitado.
  const invitado = await browser.newContext()
  const p = await invitado.newPage()
  await p.goto(link)
  await expect(p.getByText(nombre).first()).toBeVisible()
  await p.getByLabel('Documento').fill('30123456')
  await p.getByRole('button', { name: 'Guardar' }).click()
  await expect(p.getByText('Listo. El guardia ya tiene tus datos.')).toBeVisible()
  await invitado.close()
})

test('/nueva redirige al formulario nuevo conservando los datos', async ({ page }) => {
  await entrar(page, 'vecino')
  await page.goto('/nueva?kind=proveedor&guestName=Flete')
  await expect(page).toHaveURL(/\/invitaciones\/nueva\?kind=proveedor&guestName=Flete$/)
  await expect(page.getByLabel('Nombre del invitado')).toHaveValue('Flete')
})
