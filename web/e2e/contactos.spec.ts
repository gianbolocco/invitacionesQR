import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'
const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('el vecino guarda un contacto al invitar y la próxima vez lo invita desde la hoja', async ({ page }) => {
  // Único por proyecto y por corrida: celular y escritorio comparten la base.
  const nombre = `Contacto E2E ${test.info().project.name} ${Date.now()}`
  const exacto = new RegExp(escaparRegex(nombre))
  await entrar(page, 'vecino')

  try {
    await page.goto('/invitaciones/nueva')
    await page.getByLabel('Nombre del invitado').fill(nombre)
    await page.getByLabel('Guardar en contactos').check()
    await page.getByRole('button', { name: 'Crear invitación' }).click()
    await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

    await page.goto('/')
    // Hay dos botones (escritorio y flotante del celular): uno siempre está oculto.
    await page.getByRole('button', { name: 'Nueva invitación' }).locator('visible=true').first().click()
    await page.getByLabel('Buscar en tus contactos').fill(nombre)
    await page.getByRole('link', { name: exacto }).click()
    await expect(page.getByRole('heading', { name: /Invitás a/ })).toBeVisible()
    await page.getByRole('button', { name: 'Crear invitación' }).click()
    await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

    await page.goto('/contactos')
    await page.getByLabel('Buscar contacto').fill(nombre)
    await page.getByRole('button', { name: exacto }).click()
    await page.getByRole('button', { name: 'Borrar contacto' }).click()
    await page.getByRole('button', { name: 'Borrar', exact: true }).click()

    // Recargar para comprobar contra el servidor y no contra la caché.
    await page.reload()
    await page.getByLabel('Buscar contacto').fill(nombre)
    await expect(page.getByText(/Nadie coincide/)).toBeVisible()
  } finally {
    // La base de desarrollo no se limpia sola: si el test falló a mitad, se borra igual.
    const lista: { id: string; name: string }[] = await (await page.request.get(`${API}/contacts`)).json()
    for (const c of lista.filter((c) => c.name === nombre)) await page.request.delete(`${API}/contacts/${c.id}`)
  }
})
