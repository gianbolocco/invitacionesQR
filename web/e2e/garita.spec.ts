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
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()

  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  // La confirmación tiene que decir INGRESO, no EGRESO: la mutación invalida
  // el veredicto al terminar, y esEgreso no se puede recalcular después de
  // eso o termina leyendo el estado opuesto al que se acaba de registrar.
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(g.getByText('Deshacer')).toBeVisible()

  // Vuelve a donde estaba (la búsqueda), no siempre al escáner.
  await g.getByRole('button', { name: 'Deshacer' }).click()
  await expect(g).toHaveURL(/\/garita$/)

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
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByText('La anularon')).toBeVisible()
  await guardia.close()
})

test('el guardia registra el ingreso y después el egreso del mismo invitado', async ({ page, browser }) => {
  const nombre = `Egreso E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  // Ingreso.
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()

  // Siguiente vuelve a la garita, de donde vino, y busca al mismo invitado:
  // ahora tiene que ofrecer el egreso. .first(): la agenda, debajo del
  // buscador, ya lo muestra en "Ya entraron" desde el ingreso, así que el
  // nombre aparece dos veces en la página; el resultado del buscador es el
  // primero en el DOM.
  await g.getByRole('button', { name: /^Siguiente/ }).click()
  await expect(g).toHaveURL(/\/garita$/)
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await expect(g.getByRole('heading', { name: 'EGRESO', exact: true })).toBeVisible()
  await g.getByRole('button', { name: 'Registrar egreso' }).click()
  await expect(g.getByRole('heading', { name: 'EGRESO', exact: true })).toBeVisible()
  await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()

  // La agenda lo deja afuera, en "ya entraron". .first(): en escritorio,
  // "Últimos movimientos" también nombra al invitado, aparte de la agenda.
  // Se queda en la garita: vuelve UNA pantalla, no dos, aunque el contador
  // siga corriendo hasta que se desmonta.
  await g.getByRole('button', { name: /^Siguiente/ }).click()
  await expect(g).toHaveURL(/\/garita$/)
  await g.waitForTimeout(1500)
  await expect(g).toHaveURL(/\/garita$/)
  await expect(g.getByText(/^Ya entraron/)).toBeVisible()
  await expect(g.getByText(nombre).first()).toBeVisible()

  await guardia.close()
})

test('el guardia da de alta una invitación exprés y el ingreso exige documento', async ({ page }) => {
  const nombre = `Exprés E2E ${Date.now()}`
  await entrar(page, 'guardia')
  await page.goto('/garita')

  await page.getByRole('button', { name: 'Autorizar sin invitación' }).click()

  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Lote').fill('900')
  // Acotado al sheet: la agenda de atrás puede tener su propia fila "invita
  // Vecina E2E" de otros tests, y el nombre quedaría ambiguo sin esto.
  await page.getByRole('dialog').getByText('Vecina E2E').click()
  await page.getByRole('button', { name: 'Autorizar ingreso' }).click()

  await expect(page).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()

  // Sin documento, el botón no deja avanzar.
  await expect(page.getByRole('button', { name: 'Registrar ingreso' })).toBeDisabled()

  await page.getByLabel('Documento').fill('30999888')
  await page.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(page.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
})
