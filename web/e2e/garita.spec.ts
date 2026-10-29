import { entrar, expect, test } from './sesion'

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
  // Por rol: la agenda también lo nombra, y en el celular queda tapada por la búsqueda.
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
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
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
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
  // Estas pruebas leen las secciones de la lista; el tablero es la vista por defecto en escritorio.
  await guardia.addInitScript(() => localStorage.setItem('visitpass.garita.vista', 'lista'))
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  // Ingreso.
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()

  // Siguiente vuelve a la garita, de donde vino, y busca al mismo invitado:
  // ahora tiene que ofrecer el egreso. .first(): la agenda, debajo del
  // buscador, ya lo muestra en "Adentro" desde el ingreso, así que el
  // nombre aparece dos veces en la página; el resultado del buscador es el
  // primero en el DOM.
  await g.getByRole('button', { name: /^Siguiente/ }).click()
  await expect(g).toHaveURL(/\/garita$/)

  // El filtro "Adentro" lo muestra y esconde las secciones de la agenda.
  // El estado queda a la vista, fuera del panel de "Filtros".
  await g.getByRole('button', { name: /^Adentro/ }).click()
  await expect(g.getByRole('heading', { name: /^Se fueron/ })).toBeHidden()
  await expect(g.getByText(nombre).first()).toBeVisible()

  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
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
  // "Se fueron" arranca plegado: se abre para encontrarlo.
  // expanded: el chip del filtro de estado también se llama "Se fueron".
  await g.getByRole('button', { name: /^Se fueron/, expanded: false }).click()
  await expect(g.getByRole('button', { name: /^Se fueron/, expanded: true })).toBeVisible()
  await expect(g.getByText(nombre).first()).toBeVisible()

  await guardia.close()
})

test('el guardia da de alta una invitación exprés y el documento llega al ingreso', async ({ page }) => {
  const nombre = `Exprés E2E ${Date.now()}`
  await entrar(page, 'guardia')
  await page.goto('/garita')

  await page.getByRole('button', { name: 'Autorizar sin invitación' }).click()

  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Lote').fill('900')
  // Acotado al sheet: la agenda de atrás puede tener su propia fila "invita
  // Vecina E2E" de otros tests, y el nombre quedaría ambiguo sin esto.
  await page.getByRole('dialog').getByText('Vecina E2E').click()
  await page.getByRole('dialog').getByLabel('Documento').fill('30999888')
  await page.getByRole('button', { name: 'Autorizar ingreso' }).click()

  await expect(page).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()

  // El alta exprés ya exige el documento: llega cargado al veredicto.
  await expect(page.getByLabel('Documento')).toHaveValue('30999888')
  await page.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(page.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
})

test('una invitación nueva aparece en la garita sin recargar', async ({ page, browser }) => {
  // El guardia ya tiene la garita abierta.
  const guardia = await browser.newContext()
  // Estas pruebas leen las secciones de la lista; el tablero es la vista por defecto en escritorio.
  await guardia.addInitScript(() => localStorage.setItem('visitpass.garita.vista', 'lista'))
  const g = await guardia.newPage()
  await entrar(g, 'guardia')
  await expect(g.getByRole('heading', { name: /^Por llegar/ }).or(g.getByText('Nadie tiene autorización'))).toBeVisible()

  const nombre = `En vivo E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Sin reload y enseguida: llega por el aviso en vivo. El refresco de
  // respaldo es cada 60 s, así que con 3 s esto solo pasa si el aviso anda.
  await expect(g.getByText(nombre).first()).toBeVisible({ timeout: 3_000 })
  await g.screenshot({ path: 'test-results/garita-en-vivo.png' })

  await guardia.close()
})

/** Una lectora: ráfaga de 5 ms por tecla y Enter, sin campo enfocado. */
async function leerConLectora(page: import('@playwright/test').Page, texto: string) {
  // Que la garita haya terminado de cargar: con una agenda larga, las teclas que
  // llegan antes de que la lectora escuche se pierden (en la garita real nadie
  // escanea en el primer segundo).
  // Con un sheet abierto lo de atrás queda oculto para la accesibilidad: ahí ya cargó.
  if (new URL(page.url()).pathname === '/garita' && await page.getByRole('dialog').count() === 0) {
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.type(texto, { delay: 5 })
  await page.keyboard.press('Enter')
}
/**
 * Un DNI de prueba que no choca: celular y escritorio corren a la vez, y con
 * solo el reloj los dos podían sacar el mismo número en el mismo milisegundo
 * (dos coincidencias → lista, no veredicto).
 */
const docUnico = () => `${test.info().project.name === 'celular' ? 1 : 2}${String(Date.now()).slice(-7)}`
const dni = (doc: string, apellido: string) => `00700000001@${apellido}@JUAN@M@${doc}@A@01/01/1990@01/01/2020@123`

test('leer el DNI con la lectora abre la invitación con el documento cargado', async ({ page, browser }) => {
  const doc = docUnico()
  const nombre = `Lectora E2E ${doc}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Documento').fill(`${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5)}`)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  await g.goto('/garita')
  await leerConLectora(g, dni(doc, 'LECTORA'))
  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(g.getByLabel('Documento')).toHaveValue(doc)
  // El Enter de la lectora no registró nada: decide el guardia.
  await expect(g.getByRole('button', { name: 'Registrar ingreso' })).toBeFocused()
})

test('un DNI sin invitación abre el alta exprés con nombre y documento', async ({ page }) => {
  const doc = docUnico()
  await entrar(page, 'guardia')
  await page.goto('/garita')
  await leerConLectora(page, dni(doc, `ZZSINVIT${doc}`))
  await expect(page.getByRole('heading', { name: 'Autorizar sin invitación' })).toBeVisible()
  await expect(page.getByLabel('Nombre del invitado')).toHaveValue(`Juan Zzsinvit${doc}`)
  await expect(page.getByLabel(/^Documento/)).toHaveValue(doc)
})

test('el Enter de la lectora nunca registra: ni doble (CR+LF) ni tardío', async ({ page, browser }) => {
  const doc = docUnico()
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(`Enter E2E ${doc}`)
  await page.getByLabel('Documento').fill(doc)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  await g.goto('/garita')
  await leerConLectora(g, dni(doc, 'ENTER'))
  await expect(g.getByRole('button', { name: 'Registrar ingreso' })).toBeFocused()

  const sinRegistrar = async () => {
    await g.waitForTimeout(800)
    await expect(g.getByRole('button', { name: 'Registrar ingreso' })).toBeVisible()
    await expect(g.getByRole('button', { name: /^Siguiente|^Deshacer/ })).toHaveCount(0)
  }
  // Con el botón enfocado (sin blur): ráfaga + CR+LF.
  await g.keyboard.type(dni(doc, 'ENTER'), { delay: 5 })
  await g.keyboard.press('Enter')
  await g.keyboard.press('Enter')
  await sinRegistrar()
  // Terminador lento: llega 400 ms después de la última tecla.
  await g.keyboard.type(dni(doc, 'ENTER'), { delay: 5 })
  await g.waitForTimeout(400)
  await g.keyboard.press('Enter')
  await sinRegistrar()
})

test('el recuadro de la lectora confirma que leyó', async ({ page, isMobile }) => {
  test.skip(isMobile, 'el recuadro vive en la columna de escritorio')
  await entrar(page, 'guardia')
  await page.goto('/garita')
  const recuadro = page.getByRole('region', { name: 'Lectora' })
  await expect(recuadro).toContainText('Escaneá un QR o un DNI con la lectora')
  // Mouse: el botón de la cámara no está; la cámara es el link del recuadro.
  // Scopeado al aside: el link de la barra inferior (mobile) también existe en el DOM.
  const escanear = page.locator('aside').getByRole('link', { name: 'Escanear QR', includeHidden: true })
  await expect(escanear).toHaveCount(1)
  await expect(escanear).toBeHidden()
  await expect(recuadro.getByRole('link', { name: 'Usar la cámara' })).toBeVisible()

  await leerConLectora(page, 'ESTONOESUNCODIGO123')
  await expect(recuadro).toContainText('Lectora funcionando')
  await expect(recuadro).toContainText('No reconocido')
})

/** Deja una visita con el cupo agotado y abre su veredicto NO PASA. */
async function abrirNoPasaPorCupo(page: import('@playwright/test').Page, browser: import('@playwright/test').Browser, prefijo: string) {
  const nombre = `${prefijo} ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  // Ingreso y egreso: la visita agota su cupo de 1.
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await g.getByRole('button', { name: /^Siguiente/ }).click()
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await g.getByRole('button', { name: 'Registrar egreso' }).click()
  await g.getByRole('button', { name: /^Siguiente/ }).click()

  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByText('Cupo agotado')).toBeVisible()
  return { g, nombre }
}

test('un NO PASA por cupo se puede autorizar igual, con todo precargado', async ({ page, browser }) => {
  const { g, nombre } = await abrirNoPasaPorCupo(page, browser, 'Autorizar E2E')
  await g.getByRole('button', { name: 'Autorizar igual…' }).click()

  await expect(g.getByLabel('Nombre del invitado')).toHaveValue(nombre)
  await expect(g.getByLabel(/^Documento/)).toHaveValue('30111222')
  await expect(g.getByRole('button', { name: 'Cambiar' })).toBeVisible() // el lote ya está elegido
  await g.getByRole('button', { name: 'Autorizar ingreso' }).click()

  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
})

test('una invitación anulada no se puede autorizar igual', async ({ page, browser }) => {
  const nombre = `Anulada E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByRole('button', { name: 'Autorizar igual…' })).toHaveCount(0)
})

test('el Esc que cierra el sheet de Autorizar igual no saca del veredicto', async ({ page, browser }) => {
  const { g } = await abrirNoPasaPorCupo(page, browser, 'Esc E2E')
  const url = g.url()
  await g.getByRole('button', { name: 'Autorizar igual…' }).click()
  await expect(g.getByRole('dialog')).toBeVisible()
  await g.keyboard.press('Escape')
  await expect(g.getByRole('dialog')).toBeHidden()
  await g.waitForTimeout(500)
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  expect(g.url()).toBe(url)
})

test('un DNI leído con el sheet precargado abierto reemplaza el nombre de la invitación', async ({ page, browser }) => {
  const { g, nombre } = await abrirNoPasaPorCupo(page, browser, 'Mezcla E2E')
  await g.getByRole('button', { name: 'Autorizar igual…' }).click()
  await expect(g.getByLabel('Nombre del invitado')).toHaveValue(nombre)
  await g.getByRole('button', { name: 'Cambiar' }).focus()
  const doc = docUnico()
  await leerConLectora(g, dni(doc, 'MEZCLA'))
  await expect(g.getByLabel('Nombre del invitado')).toHaveValue('Juan Mezcla')
  await expect(g.getByLabel(/^Documento/)).toHaveValue(doc)
})

test('dos DNI seguidos en el alta exprés no mezclan nombre y documento', async ({ page }) => {
  const t = String(Date.now())
  const docA = t.slice(-8), docB = String(Number(docA) + 1).padStart(8, '0')
  await entrar(page, 'guardia')
  await page.goto('/garita')
  await page.getByRole('button', { name: 'Autorizar sin invitación' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // El sheet autofocusea Nombre; leerConLectora hace blur para que la lectura caiga en el hook de ventana.
  await leerConLectora(page, dni(docA, `ZZAAA${docA}`))
  await expect(page.getByLabel(/^Documento/)).toHaveValue(docA)
  await leerConLectora(page, dni(docB, `ZZBBB${docB}`))
  await expect(page.getByLabel(/^Documento/)).toHaveValue(docB)
  await expect(page.getByLabel('Nombre del invitado')).toHaveValue(`Juan Zzbbb${docB}`)
})

test('la garita autoriza un proveedor sin invitación aunque su rubro esté fuera de horario', async ({ page, browser }) => {
  const API = process.env.E2E_API_URL ?? 'http://localhost:8080'
  const rubro = `Gasista E2E ${test.info().project.name} ${Date.now()}`
  const nombre = `Proveedor exprés E2E ${Date.now()}`
  let rubroId: string | undefined
  let originales: unknown

  await entrar(page, 'admin')
  try {
    originales = (await (await page.request.get(`${API}/admin/neighborhood`)).json()).providerWindows
    const creado = await page.request.post(`${API}/admin/trades`, { data: { name: rubro } })
    rubroId = (await creado.json()).id as string
    // Cerrado todo el día salvo un minuto a medianoche: la portería lo autoriza igual.
    const franja = await page.request.patch(`${API}/admin/neighborhood`, { data: { providerWindows: [
      ...(originales as unknown[]),
      { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:01', season: null, trades: [rubroId] },
    ] } })
    expect(franja.ok()).toBe(true)

    const guardia = await browser.newContext()
    const g = await guardia.newPage()
    await entrar(g, 'guardia')
    await g.goto('/garita')
    await g.getByRole('button', { name: 'Autorizar sin invitación' }).click()
    await g.getByRole('button', { name: 'Proveedor', exact: true }).click()
    await g.getByLabel('Nombre del invitado').fill(nombre)
    await g.getByLabel('Lote').fill('900')
    await g.getByRole('dialog').getByText('Vecina E2E').click()
    await g.getByLabel('Rubro').click()
    await g.getByRole('option', { name: rubro }).click()
    await g.getByRole('dialog').getByLabel('Documento').fill('30777666')
    await g.getByRole('button', { name: 'Autorizar ingreso' }).click()

    await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
    await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
    await expect(g.getByText(`Proveedor · ${rubro}`)).toBeVisible()
    await g.getByLabel('Documento').fill('30777666')
    await g.getByRole('button', { name: 'Registrar ingreso' }).click()
    await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
    await guardia.close()
  } finally {
    // La base de desarrollo no se limpia: se devuelve lo que había y se archiva el rubro.
    if (originales) await page.request.patch(`${API}/admin/neighborhood`, { data: { providerWindows: originales } })
    if (rubroId) await page.request.patch(`${API}/admin/trades/${rubroId}`, { data: { archived: true } })
  }
})
