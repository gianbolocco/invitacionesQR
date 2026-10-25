import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'
const PLANO = join(__dirname, '../../docs/barrios/alamo-alto-plano.svg')

test('el invitado ve el plano del barrio', async ({ page, browser }) => {
  await entrar(page, 'admin')
  try {
    const subido = await page.request.put(`${API}/admin/branding/plano`, {
      data: readFileSync(PLANO), headers: { 'content-type': 'image/svg+xml' },
    })
    expect(subido.ok()).toBe(true)

    const vecino = await browser.newContext()
    await vecino.grantPermissions(['clipboard-read', 'clipboard-write'])
    const v = await vecino.newPage()
    await entrar(v, 'vecino')
    await v.goto('/invitaciones/nueva')
    await v.getByLabel('Nombre del invitado').fill(`Plano E2E ${Date.now()}`)
    await v.getByRole('button', { name: 'Crear invitación' }).click()
    await expect(v).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
    await v.getByRole('button', { name: 'Copiar link' }).click()
    const link = await v.evaluate(() => navigator.clipboard.readText())
    await vecino.close()

    const invitado = await browser.newContext()
    const g = await invitado.newPage()
    await g.goto(link)
    const plano = g.locator('img[alt^="Plano del barrio"]').first()
    await expect(plano).toBeVisible()
    await expect.poll(() => plano.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)

    await g.getByRole('button', { name: /Ampliar/ }).click()
    await expect(g.getByRole('dialog')).toBeVisible()
    await g.keyboard.press('Escape')
    await expect(g.getByRole('dialog')).toBeHidden()
    await invitado.close()
  } finally {
    await page.request.delete(`${API}/admin/branding/plano`)
  }
})
