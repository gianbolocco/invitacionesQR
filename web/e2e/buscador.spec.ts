import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('los resultados del buscador flotan sin mover la pantalla y se eligen con el teclado', async ({ page }) => {
  const sufijo = `${test.info().project.name} ${Date.now()}`
  await entrar(page, 'guardia')
  // Dos invitaciones propias: la prueba no depende de lo que haya en la base.
  const [lote] = await (await page.request.get(`${API}/gate/units?q=900`)).json()
  for (const n of ['Uno', 'Dos']) {
    const r = await page.request.post(`${API}/gate/invitations`, { data: { unitId: lote.unitId, guestName: `Buscado ${n} ${sufijo}` } })
    expect(r.ok()).toBe(true)
  }

  await page.goto('/garita')
  const autorizar = page.getByRole('button', { name: 'Autorizar sin invitación' })
  const antes = await autorizar.boundingBox()

  await page.getByLabel('Buscar invitado').fill(`Buscado Uno ${sufijo}`)
  const lista = page.getByRole('listbox', { name: 'Resultados de la búsqueda' })
  await expect(lista.getByRole('option')).toHaveCount(1)

  if (test.info().project.name === 'escritorio') {
    // Flota: lo de abajo no se movió ni un píxel.
    expect((await autorizar.boundingBox())?.y).toBe(antes?.y)
    await page.keyboard.press('Escape')
    await expect(lista).toHaveCount(0)
    // Volver al campo lo reabre, y Enter abre el primero.
    await page.getByLabel('Buscar invitado').click()
    await page.keyboard.press('Enter')
  } else {
    // En el celular es pantalla completa, con su flecha para salir.
    await page.getByRole('button', { name: 'Cerrar la búsqueda' }).click()
    await expect(lista).toHaveCount(0)
    await page.getByLabel('Buscar invitado').click()
    await lista.getByRole('option').first().click()
  }
  await expect(page).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
})

test('sin resultados, el buscador ofrece autorizar sin invitación', async ({ page }) => {
  await entrar(page, 'guardia')
  await page.goto('/garita')
  await page.getByLabel('Buscar invitado').fill(`Nadie Así ${Date.now()}`)
  await expect(page.getByText(/No encontramos a/)).toBeVisible()
  // El del panel va primero en la página.
  await page.getByRole('button', { name: 'Autorizar sin invitación' }).first().click()
  await expect(page.getByRole('heading', { name: 'Autorizar sin invitación' })).toBeVisible()
})
