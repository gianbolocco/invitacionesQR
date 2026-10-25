import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('fuera del horario del rubro, la garita rechaza al proveedor y deja autorizar igual', async ({ page, browser }) => {
  const rubro = `Plomero E2E ${test.info().project.name} ${Date.now()}`
  const nombre = `Plomero invitado E2E ${Date.now()}`
  let rubroId: string | undefined

  await entrar(page, 'admin')
  try {
    // El panel: el rubro nuevo aparece en la lista.
    await page.goto('/admin/barrio?tab=garita')
    await page.getByLabel('Nuevo rubro').fill(rubro)
    await page.getByLabel('Nuevo rubro').press('Enter') // Enter: en el celular el clic en "Agregar" no llega (se queda esperando)
    await expect(page.getByText(rubro, { exact: true })).toBeVisible()

    const rubros: { id: string; name: string }[] = await (await page.request.get(`${API}/admin/trades`)).json()
    rubroId = rubros.find((r) => r.name === rubro)!.id

    // La franja va por la API: los inputs de hora son frágiles y no dependen del reloj.
    // Cerrada todos los días salvo un minuto a medianoche: a cualquier otra hora, fuera de horario.
    // ponytail: pisa las franjas del barrio; con celular y escritorio en paralelo se pisan entre sí.
    const franja = await page.request.patch(`${API}/admin/neighborhood`, { data: { providerWindows: [
      { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:01', season: null, trades: [rubroId] },
    ] } })
    expect(franja.ok()).toBe(true)

    // El vecino elige el rubro y ve el horario.
    const vecino = await browser.newContext()
    const v = await vecino.newPage()
    await entrar(v, 'vecino')
    await v.goto('/invitaciones/nueva')
    await v.getByRole('group', { name: 'Tipo de invitación' }).getByRole('button', { name: 'Proveedor' }).click()
    await v.getByLabel('Nombre del invitado').fill(nombre)
    await v.getByLabel('Rubro').click()
    await v.getByRole('option', { name: rubro }).click()
    await expect(v.getByText('Puede entrar')).toBeVisible()
    await v.getByRole('button', { name: 'Crear invitación' }).click()
    await expect(v).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
    await vecino.close()

    // La garita: NO PASA por horario, con el link para autorizar igual.
    const guardia = await browser.newContext()
    const g = await guardia.newPage()
    await entrar(g, 'guardia')
    await g.getByLabel('Buscar invitado').fill(nombre)
    await g.getByRole('option', { name: new RegExp(nombre) }).click()
    await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
    await expect(g.getByText('Fuera de horario')).toBeVisible()
    await g.getByRole('button', { name: 'Autorizar igual…' }).click()
    await expect(g.getByLabel('Nombre del invitado')).toHaveValue(nombre)
    await guardia.close()
  } finally {
    // La base de desarrollo no se limpia: sin esto el resto de los specs toparía con la restricción.
    await page.request.patch(`${API}/admin/neighborhood`, { data: { providerWindows: [] } })
    if (rubroId) await page.request.patch(`${API}/admin/trades/${rubroId}`, { data: { archived: true } })
  }
})
