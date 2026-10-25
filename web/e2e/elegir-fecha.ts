import type { Locator, Page } from '@playwright/test'

/** Elige en el CampoFecha de `seccion` el día 15 del mes que viene (siempre futuro). */
export async function elegirVence(page: Page, seccion: Locator) {
  await seccion.getByLabel('Vence').click()
  await page.getByRole('button', { name: /siguiente/i }).click()
  await page.getByRole('gridcell').getByRole('button', { name: /\b15 de\b/ }).first().click()
}
