import type { Browser, Page } from '@playwright/test'
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

/** Un guardia con la garita abierta; el vecino mira en otra ventana. */
async function nuevaGarita(browser: Browser) {
  const ctx = await browser.newContext()
  const g = await ctx.newPage()
  await entrar(g, 'guardia')
  await g.goto('/garita')
  return { ctx, g }
}

async function avisar(g: Page, nota: string) {
  await g.getByRole('button', { name: 'Llegó un paquete' }).click()
  await g.getByLabel('Lote').fill('900')
  await g.getByRole('dialog').getByText('Vecina E2E').click()
  await g.getByLabel('Nota (opcional)').fill(nota)
  await g.getByRole('button', { name: 'Avisar al Lote 900' }).click()
}

test('el aviso del guardia le llega al vecino en vivo, sin recargar', async ({ page, browser, isMobile }) => {
  const nota = `Caja E2E ${test.info().project.name} ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()

  const { ctx, g } = await nuevaGarita(browser)
  try {
    await avisar(g, nota)
    await expect(g.getByText(/Avisando al Lote 900 en \d s/)).toBeVisible()
    // El servidor retiene el aviso 5 s para poder deshacer; después llega por SSE.
    await expect(page.locator('[data-sonner-toast]').getByText(new RegExp(nota))).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('Te llegó un paquete')).toBeVisible()
    await expect(page.getByRole('link', { name: /Ver paquetes \(\d+\)/ })).toBeVisible()
    // Y en "Últimos movimientos" de la garita, con su etiqueta (en el celular esa columna no se muestra).
    if (!isMobile) await expect(g.getByText('Paquete', { exact: true }).first()).toBeVisible({ timeout: 8_000 })
  } finally {
    await ctx.close()
  }
})

test('un aviso deshecho a tiempo no le llega al vecino', async ({ page, browser }) => {
  const nota = `Cancelado E2E ${test.info().project.name} ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/')

  const { ctx, g } = await nuevaGarita(browser)
  try {
    await avisar(g, nota)
    await g.getByRole('button', { name: 'Deshacer' }).click()
    await expect(g.getByText('Aviso cancelado.')).toBeVisible()
    await g.waitForTimeout(7_000)
    await expect(page.getByText(nota)).toHaveCount(0)
    await page.goto('/paquetes')
    await expect(page.getByRole('heading', { name: 'Paquetes' })).toBeVisible()
    await expect(page.getByText(nota)).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('con los paquetes apagados la garita no ofrece el botón', async ({ page, browser }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/barrio?tab=garita')
  const interruptor = page.getByRole('switch', { name: 'Paquetes' })
  const { ctx, g } = await nuevaGarita(browser)
  try {
    await expect(g.getByRole('button', { name: 'Llegó un paquete' })).toBeVisible()
    if ((await interruptor.getAttribute('aria-checked')) === 'true') await interruptor.click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Guardado.', { exact: true })).toBeVisible()

    await g.reload()
    await expect(g.getByRole('button', { name: 'Autorizar sin invitación' })).toBeVisible()
    await expect(g.getByRole('button', { name: 'Llegó un paquete' })).toHaveCount(0)
  } finally {
    // La base de desarrollo no se limpia: la feature vuelve a quedar prendida.
    await page.request.patch(`${API}/admin/neighborhood`, { data: { packagesEnabled: true } })
    await ctx.close()
  }
})
