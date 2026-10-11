import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el guardia busca un invitado, registra el ingreso y lo deshace', async ({ page, browser }) => {
  // Lo crea el vecino, para tener una invitación vigente y fresca.
  const nombre = `Garita E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Otra ventana, con la sesión del guardia.
  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  await g.getByLabel('Buscar invitado').fill(nombre)
  await expect(g.getByText(nombre)).toBeVisible()
  await g.getByText(nombre).click()
  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()

  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(g.getByText('Deshacer')).toBeVisible()

  await g.getByRole('button', { name: 'Deshacer' }).click()
  await expect(g).toHaveURL(/\/garita\/escanear$/)

  await guardia.close()
})

test('la agenda se mueve relativa al día elegido, no a hoy', async ({ page }) => {
  await entrar(page, 'guardia')
  await page.goto('/garita')

  const siguiente = page.getByRole('button', { name: 'Día siguiente' })
  const anterior = page.getByRole('button', { name: 'Día anterior' })

  // +2, -1: si el botón fuera relativo a hoy en vez de al día elegido,
  // terminaría mostrando "Hoy" en lugar de "Mañana".
  await siguiente.click()
  await siguiente.click()
  await anterior.click()

  await expect(page.locator('h2')).toHaveText('Mañana')
})

test('una invitación anulada no pasa', async ({ page, browser }) => {
  const nombre = `Rechazo E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByText('NO PASA')).toBeVisible()
  await expect(g.getByText('La anularon')).toBeVisible()
  await guardia.close()
})
