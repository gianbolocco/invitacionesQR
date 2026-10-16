import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el guardia anula una invitación con motivo y el vecino lo ve', async ({ page, browser }) => {
  const nombre = `Anula E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
  const detalle = page.url().split('?')[0]

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()

  await g.getByRole('button', { name: /Anular esta invitación/ }).click()
  const anular = g.getByRole('button', { name: 'Anular invitación', exact: true })
  // Sin motivo no se puede: es lo que el vecino va a leer.
  await expect(anular).toBeDisabled()
  await g.getByLabel('Motivo').fill('abc')
  await expect(anular).toBeDisabled()
  await g.getByLabel('Motivo').fill('El vecino llamó para cancelar')
  await anular.click()
  await expect(g.getByText('Invitación anulada. El vecino ve el motivo.')).toBeVisible()

  // La garita ya no la deja pasar, y el vecino lee por qué.
  await g.goto('/garita')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByText('La anularon')).toBeVisible()

  await page.goto(detalle)
  await expect(page.getByText('Anulada por portería: El vecino llamó para cancelar')).toBeVisible()

  await guardia.close()
})
