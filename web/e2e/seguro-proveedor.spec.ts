import { elegirVence } from './elegir-fecha'
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('un proveedor sin seguro no pasa, y el guardia lo carga y lo registra', async ({ page, browser }) => {
  const rubro = `Gasista E2E ${test.info().project.name} ${Date.now()}`
  const nombre = `Gasista invitado E2E ${Date.now()}`
  let rubroId: string | undefined

  await entrar(page, 'admin')
  try {
    const creado = await page.request.post(`${API}/admin/trades`, { data: { name: rubro } })
    expect(creado.ok()).toBe(true)
    rubroId = (await creado.json()).id as string
    const pide = await page.request.patch(`${API}/admin/trades/${rubroId}`, { data: { requiresInsurance: true } })
    expect(pide.ok()).toBe(true)

    // El vecino crea el proveedor sin cargar el seguro (es opcional).
    const vecino = await browser.newContext()
    const v = await vecino.newPage()
    await entrar(v, 'vecino')
    await v.goto('/invitaciones/nueva')
    await v.getByRole('group', { name: 'Tipo de invitación' }).getByRole('button', { name: 'Proveedor' }).click()
    await v.getByLabel('Nombre del invitado').fill(nombre)
    await v.getByLabel('Rubro').click()
    await v.getByRole('option', { name: rubro }).click()
    await v.getByRole('button', { name: 'Crear invitación' }).click()
    await expect(v).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
    await vecino.close()

    const guardia = await browser.newContext()
    const g = await guardia.newPage()
    await entrar(g, 'guardia')
    await g.getByLabel('Buscar invitado').fill(nombre)
    await g.getByRole('option', { name: new RegExp(nombre) }).click()
    await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
    await expect(g.getByText('Sin seguro')).toBeVisible()

    // Único por corrida: con el padrón, un DNI de una corrida anterior ya tiene seguro.
    const dni = String(Date.now()).slice(-8)
    await g.getByLabel('Documento').fill(dni)
    await expect(g.getByText('Falta el seguro')).toBeVisible()
    const prov = g.getByRole('region', { name: 'Proveedor' })
    await prov.getByLabel('Compañía').fill('Seguros E2E')
    await prov.getByLabel('Número de póliza').fill('POL-123')
    await elegirVence(g, prov)
    await g.getByRole('button', { name: 'Guardar seguro y registrar ingreso' }).click()
    await expect(g.getByRole('status').filter({ hasText: 'Registrado' })).toBeVisible()
    await guardia.close()
  } finally {
    if (rubroId) await page.request.patch(`${API}/admin/trades/${rubroId}`, { data: { archived: true } })
  }
})
