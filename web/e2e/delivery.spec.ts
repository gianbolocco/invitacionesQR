import { entrar, expect, test } from './sesion'

test('el vecino avisa un pedido y la garita registra el ingreso y el egreso del repartidor', async ({ page, browser }) => {
  // "Otro" con un texto único: el título del pase es ese texto y la búsqueda no depende de otros deliveries.
  const pedido = `Pedido E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.getByRole('button', { name: 'Espero un pedido' }).click()
  await page.getByRole('button', { name: 'Otro', exact: true }).click()
  await page.getByLabel('¿Qué esperás?').fill(pedido)
  await page.getByRole('button', { name: 'Avisar a la garita' }).click()
  await expect(page.getByText(pedido).first()).toBeVisible()
  await expect(page.getByText(/Delivery · vence \d{2}:\d{2}/).first()).toBeVisible()

  const guardia = await browser.newContext()
  await guardia.addInitScript(() => localStorage.setItem('visitpass.garita.vista', 'lista'))
  const g = await guardia.newPage()
  try {
    await entrar(g, 'guardia')
    await g.getByLabel('Buscar invitado').fill(pedido)
    await g.getByRole('option', { name: new RegExp(pedido) }).click()
    await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()

    await expect(g.getByRole('button', { name: 'Registrar ingreso' })).toBeDisabled()
    await g.getByLabel('Documento', { exact: true }).fill('30555444')
    await g.getByRole('button', { name: 'Registrar ingreso' }).click()
    await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
    await g.getByRole('button', { name: /^Siguiente/ }).click()
    await expect(g).toHaveURL(/\/garita$/)

    await g.getByRole('button', { name: /^Adentro/ }).click()
    await expect(g.getByText(pedido).first()).toBeVisible()

    await g.getByLabel('Buscar invitado').fill(pedido)
    await g.getByRole('option', { name: new RegExp(pedido) }).click()
    await expect(g.getByRole('heading', { name: 'EGRESO', exact: true })).toBeVisible()
    await g.getByRole('button', { name: 'Registrar egreso' }).click()
    await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
  } finally {
    await guardia.close()
  }
})
