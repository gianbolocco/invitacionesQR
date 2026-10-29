import { entrar, expect, test } from './sesion'

test('el guardia pasa la planilla del corte y la auditoría la muestra completa', async ({ page, browser }) => {
  // Lo crea el vecino, para tener una invitación fresca.
  // Los dos proyectos corren a la vez: el nombre del proyecto evita que choquen.
  const sufijo = `${test.info().project.name} ${Date.now()}`
  const nombre = `Manual E2E ${sufijo}`
  const sinInvitacion = `Juan Sinvite ${sufijo}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Mismo dispositivo que el proyecto (celular o escritorio), para ejercitar tabla y tarjetas.
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use
  const guardia = await browser.newContext({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor })
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  try {
    await g.getByRole('link', { name: /Cargar movimientos/ }).click()
    await expect(g).toHaveURL(/\/garita\/cargar$/)

    const campo = (c: string, fila: number) => g.getByLabel(`${c}, fila ${fila}`, { exact: true })

    // Las 00:00 de hoy: siempre pasaron, a cualquier hora del día en que corra la prueba.
    await campo('Ingreso', 1).fill('0000')
    await campo('Persona', 1).fill(nombre)
    await g.getByRole('option', { name: /Invitado ese día/ }).click()
    await campo('DNI', 1).fill('30111222')
    await campo('Patente', 1).fill('ab123cd')

    await g.getByRole('button', { name: 'Agregar fila' }).click()
    await campo('Ingreso', 2).fill('0000')
    await campo('Persona', 2).fill(sinInvitacion)
    await g.getByRole('option', { name: /sin invitación/ }).click()
    await campo('DNI', 2).fill('30333444')
    await campo('Lote', 2).fill('Lote 900')
    await g.getByRole('option', { name: /Lote 900/ }).first().click()

    // El borrador sobrevive a una recarga.
    await g.reload()
    await expect(campo('Persona', 1)).toHaveValue(nombre)
    await expect(campo('Persona', 2)).toHaveValue(sinInvitacion)
    await expect(campo('Ingreso', 1)).toHaveValue('00:00')

    await g.getByRole('button', { name: 'Guardar 2 movimientos' }).click()
    await expect(g.getByText('Se cargaron 2 movimientos.')).toBeVisible()

    await g.goto('/auditoria')
    const buscar = g.getByLabel('Buscar en la auditoría')
    const fila = (n: string) => g.getByRole('button', { name: `Ver detalle de ${n}` })

    // Esperar a que la lista ya sea la filtrada: antes se ven las filas de la búsqueda anterior.
    await buscar.fill(nombre)
    await expect(fila(nombre)).toHaveCount(1)
    await expect(g.getByText('Carga manual').first()).toBeVisible()
    await fila(nombre).click()
    const panel = g.getByRole('dialog')
    await expect(panel.getByText(/AB123CD/)).toBeVisible()
    await expect(panel.getByText(/Cargado a mano por/)).toBeVisible()
    await g.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(fila(nombre)).toBeFocused()

    await buscar.fill(sinInvitacion)
    await expect(fila(sinInvitacion)).toHaveCount(1)
    await expect(g.getByText('Carga manual').first()).toBeVisible()
    await expect(g.getByText('Autorizado por portería').first()).toBeVisible()

  } finally {
    await guardia.close()
  }
})
