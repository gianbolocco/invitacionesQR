import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('el admin ve los seguros vencidos y exporta el excel', async ({ page, browser }) => {
  // Patente única por corrida y por proyecto: la base de desarrollo no se limpia sola.
  const patente = `V${test.info().project.name.slice(0, 2).toUpperCase()}${String(Date.now()).slice(-6)}`

  // Lo carga un guardia (el admin solo mira): con la sesión del guardia, por API.
  const g = await browser.newContext()
  const gp = await g.newPage()
  await entrar(gp, 'guardia')
  const r = await gp.request.put(`${API}/gate/vehicles/insurance`, {
    data: { plate: patente, insurance: { company: 'E2E Seguros', policy: 'P-1', expiresOn: '2020-01-01' } },
  })
  expect(r.ok()).toBe(true)
  await g.close()

  await entrar(page, 'admin')
  await page.goto('/seguros?estado=vencido')
  // En el celular es una lista y en escritorio una tabla: se busca el texto, no la celda.
  await expect(page.getByText(patente, { exact: true }).locator('visible=true').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Corregir/ })).toHaveCount(0)
  const descarga = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exportar a Excel' }).click()
  expect((await descarga).suggestedFilename()).toMatch(/seguros-autos\.xlsx$/)
})
