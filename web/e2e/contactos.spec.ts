import { entrar, expect, test } from './sesion'

test('el vecino guarda un contacto al invitar y la próxima vez lo invita desde la hoja', async ({ page }) => {
  // Único por proyecto y por corrida: celular y escritorio comparten la base.
  const nombre = `Contacto E2E ${test.info().project.name} ${Date.now()}`
  await entrar(page, 'vecino')

  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Guardar en contactos').check()
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  await page.goto('/')
  // Hay dos botones (escritorio y flotante del celular): uno siempre está oculto.
  await page.getByRole('button', { name: 'Nueva invitación' }).locator('visible=true').first().click()
  await page.getByLabel('Buscar en tus contactos').fill(nombre)
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await expect(page.getByRole('heading', { name: /Invitás a/ })).toBeVisible()
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Se borra al final: la base de desarrollo no se limpia sola.
  await page.goto('/contactos')
  await page.getByLabel('Buscar contacto').fill(nombre)
  await page.getByRole('button', { name: new RegExp(nombre) }).click()
  await page.getByRole('button', { name: 'Borrar contacto' }).click()
  await page.getByRole('button', { name: 'Borrar', exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(nombre) })).toHaveCount(0)
})
