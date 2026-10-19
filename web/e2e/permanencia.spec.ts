import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('la garita avisa quién pasó su tiempo adentro y el guardia lo marca visto', async ({ page, browser }) => {
  // Los dos proyectos corren a la vez: el nombre del proyecto evita que choquen.
  const nombre = `Demorado E2E ${test.info().project.name} ${Date.now()}`

  // El admin prende la alerta de visitas en 1 h. Los dos proyectos lo hacen a la
  // vez, así que solo se prende si está apagada: un clic de más la apagaría.
  await entrar(page, 'admin')
  await page.goto('/admin/barrio')
  const interruptor = page.getByRole('switch', { name: 'Alertar por visitas' })
  if ((await interruptor.getAttribute('aria-checked')) !== 'true') await interruptor.click()
  await page.getByLabel('Horas para visitas').fill('1')
  await page.getByRole('button', { name: 'Guardar' }).click()
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
    await g.getByRole('button', { name: /pasaron? su tiempo adentro/ }).click()
    const panel = g.getByRole('dialog', { name: 'Pasaron su tiempo' })
    const fila = panel.getByRole('listitem').filter({ hasText: nombre })
    await expect(fila.getByText(/Hace .+ adentro/)).toBeVisible()

    await fila.getByRole('button', { name: 'Ya lo vi' }).click()
    // Pasa a "Ya vistas": sigue en la lista, sin el botón.
    await expect(fila.getByRole('button', { name: 'Ya lo vi' })).toHaveCount(0)
    await expect(fila.getByRole('link', { name: 'Ver' })).toBeVisible()
    await g.keyboard.press('Escape')

    // En la agenda sigue marcado, y el chip deja ver solo a los excedidos.
    await g.getByRole('button', { name: /^Pasaron su tiempo/ }).click()
    await expect(g.getByRole('button', { name: new RegExp(nombre) })).toContainText(/Hace .+ adentro/)
  } finally {
    await guardia.close()
  }
})
