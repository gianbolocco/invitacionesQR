import { elegirVence } from './elegir-fecha'
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('un auto sin seguro no pasa; el guardia lo carga y la segunda vez pasa sin pedirlo', async ({ page, browser }) => {
  // Los dos proyectos corren en paralelo: si ambos tocaran el switch, uno lo apagaría en medio del otro.
  test.skip(test.info().project.name === 'celular', 'cambia un switch global del barrio')
  const sufijo = String(Date.now()).slice(-6)
  // Patente única por corrida: un auto de una corrida anterior ya tendría seguro.
  const patente = `E2E${sufijo}`
  const nombre = `Visita en auto E2E ${sufijo}`

  await entrar(page, 'admin')
  const antes = await page.request.get(`${API}/admin/neighborhood`)
  expect(antes.ok()).toBe(true)
  const { vehicleInsuranceRequired: estaba } = await antes.json()
  const prender = await page.request.patch(`${API}/admin/neighborhood`, { data: { vehicleInsuranceRequired: true } })
  expect(prender.ok()).toBe(true)
  try {
    const vecino = await browser.newContext()
    const v = await vecino.newPage()
    await entrar(v, 'vecino')
    for (const n of [1, 2]) {
      await v.goto('/invitaciones/nueva')
      await v.getByLabel('Nombre del invitado').fill(`${nombre} ${n}`)
      await v.getByLabel('Patente').fill(patente)
      await v.getByRole('button', { name: 'Crear invitación' }).click()
      await expect(v).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
    }
    await vecino.close()

    const guardia = await browser.newContext()
    const g = await guardia.newPage()
    await entrar(g, 'guardia')

    await g.getByLabel('Buscar invitado').fill(`${nombre} 1`)
    await g.getByRole('option', { name: new RegExp(`${nombre} 1`) }).click()
    await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
    await expect(g.getByText('Sin seguro del auto')).toBeVisible()

    await g.getByLabel('Documento').fill(String(Date.now()).slice(-8))
    const auto = g.getByRole('region', { name: 'Vehículo' })
    await auto.getByLabel('Compañía').fill('Seguros E2E')
    await auto.getByLabel('Número de póliza').fill('AUTO-1')
    await elegirVence(g, auto)
    await g.getByRole('button', { name: 'Guardar seguro y registrar ingreso' }).click()
    await expect(g.getByRole('status').filter({ hasText: 'Registrado' })).toBeVisible()

    await g.goto('/garita')
    await g.getByLabel('Buscar invitado').fill(`${nombre} 2`)
    await g.getByRole('option', { name: new RegExp(`${nombre} 2`) }).click()
    await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
    await expect(g.getByRole('region', { name: 'Vehículo' }).getByText('Seguro vigente')).toBeVisible()
    await guardia.close()
  } finally {
    // La conexión del admin quedó ociosa todo el test: la API puede haberla cerrado (ECONNRESET). Un reintento alcanza.
    const restaurar = () => page.request.patch(`${API}/admin/neighborhood`, { data: { vehicleInsuranceRequired: estaba } })
    await restaurar().catch(restaurar)
  }
})
