import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('la garita marca a quien pasó su tiempo adentro y lo deja filtrar', async ({ page, browser }) => {
  // Los dos proyectos corren a la vez: el nombre del proyecto evita que choquen.
  const nombre = `Demorado E2E ${test.info().project.name} ${Date.now()}`

  // El admin prende la alerta de visitas en 1 h. Los dos proyectos lo hacen a la
  // vez, así que solo se prende si está apagada: un clic de más la apagaría.
  await entrar(page, 'admin')
  await page.goto('/admin/barrio')
  const interruptor = page.getByRole('switch', { name: 'Alertar por visitas' })
  if ((await interruptor.getAttribute('aria-checked')) !== 'true') await interruptor.click()
  await page.getByLabel('Horas para visitas').fill('1')
  await page.getByRole('button', { name: 'Guardar', exact: true }).press('Enter') // por teclado: en el celular el header sticky tapa el botón
  await expect(page.getByText('Guardado.')).toBeVisible()

  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use
  const guardia = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor })
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  try {
    // Alguien que entró hace 2 h y no salió, cargado por la API: la planilla
    // no deja elegir una hora relativa sin depender de la hora en que corre esto.
    const [lote] = await (await g.request.get(`${API}/gate/units?q=900`)).json()
    const carga = await g.request.post(`${API}/gate/manual`, { data: { items: [{
      guest: { name: nombre, unitId: lote.unitId }, guestDoc: '30999888',
      enteredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    }] } })
    expect(carga.ok()).toBe(true)

    await g.goto('/garita')
    // Puede haber otros excedidos de corridas anteriores: se busca a esta persona, no un número.
    await g.getByRole('button', { name: /^Filtros/ }).click()
    await g.getByRole('group', { name: 'Advertencia' }).getByRole('button', { name: /Tiempo excedido/ }).click()
    await g.keyboard.press('Escape')
    await expect(g.getByText('Tiempo excedido').first()).toBeVisible()
    await expect(g.getByRole('button', { name: new RegExp(nombre) })).toContainText(/Hace .+ adentro/)
  } finally {
    await guardia.close()
  }
})

test('una frecuente que viene a trabajar se marca como frecuente y como proveedor en la garita', async ({ page, browser }) => {
  const nombre = `Jardinero E2E ${test.info().project.name} ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByRole('group', { name: 'Tipo de invitación' }).getByRole('button', { name: 'Frecuente' }).click()
  await page.getByRole('group', { name: 'Viene de visita o a trabajar' }).getByRole('button', { name: 'Proveedor' }).click()
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use
  const guardia = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor })
  const g = await guardia.newPage()
  try {
    await entrar(g, 'guardia')
    await g.goto('/garita')
    const fila = g.getByRole('button', { name: new RegExp(nombre) })
    await expect(fila).toContainText('Frecuente')
    await expect(fila).toContainText('Proveedor')
  } finally {
    await guardia.close()
  }
})
