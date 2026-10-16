import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el guardia carga a mano un movimiento y la auditoría lo marca', async ({ page, browser }) => {
  // Lo crea el vecino, para tener una invitación fresca.
  const nombre = `Manual E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  await g.getByRole('link', { name: /Cargar movimientos/ }).click()
  await expect(g).toHaveURL(/\/garita\/cargar$/)

  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()

  // Las 00:00 de hoy: siempre pasaron, a cualquier hora del día en que corra la prueba.
  await g.locator('#ingreso-hora').fill('00:00')
  await g.locator('#salida-hora').fill('00:00')
  await g.getByLabel('Nota').fill('corte de luz')
  await g.getByRole('button', { name: 'Agregar a la tanda' }).click()
  await expect(g.getByRole('heading', { name: /^Tanda \(1\)/ })).toBeVisible()

  await g.getByRole('button', { name: 'Guardar 1 movimiento' }).click()
  await expect(g.getByText('Se cargó 1 movimiento.')).toBeVisible()

  await g.goto('/auditoria')
  await g.getByLabel('Buscar en la auditoría').fill(nombre)
  await expect(g.getByText('Carga manual').first()).toBeVisible()

  await guardia.close()
})

test('no deja agregar una carga sin hora de ingreso', async ({ page }) => {
  await entrar(page, 'guardia')
  await page.goto('/garita/cargar')
  await page.getByLabel('Buscar invitado').fill('a')
  const primero = page.getByRole('button').filter({ hasText: /Lote/ }).first()
  await primero.click()
  await page.getByRole('button', { name: 'Agregar a la tanda' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('hora de ingreso')
})
