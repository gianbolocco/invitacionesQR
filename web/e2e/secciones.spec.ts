import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('sin sesión, la home lleva al login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('el vecino entra a su home y no puede ver el admin', async ({ page }) => {
  await entrar(page, 'vecino')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin/guardias')
  await expect(page).toHaveURL(/\/$/)
})

test('el guardia entra a la garita y la home lo devuelve ahí', async ({ page }) => {
  await entrar(page, 'guardia')
  await expect(page).toHaveURL(/\/garita$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/garita$/)
})

test('el admin llega al tablero y a la auditoría', async ({ page }) => {
  await entrar(page, 'admin')
  await expect(page).toHaveURL(/\/$/) // esperar a que termine el login antes de navegar
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/auditoria')
  await expect(page).toHaveURL(/\/auditoria$/)
})

test('una ruta inexistente muestra la página propia', async ({ page }) => {
  await page.goto('/no-existe-esto')
  await expect(page.getByText('Esta página no existe')).toBeVisible()
})

test('el manifest lleva el nombre del barrio', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toBeTruthy()
  expect(m.name).not.toBe('VisitPass')
})
