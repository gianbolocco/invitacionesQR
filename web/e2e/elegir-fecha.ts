import type { Locator, Page } from '@playwright/test'

/**
 * Elige en el CampoFecha de `seccion` el día 15 del mes que viene (siempre futuro).
 * Supone el campo vacío: con una fecha vencida precargada el calendario abriría en ese mes.
 */
export async function elegirVence(page: Page, seccion: Locator) {
  await seccion.getByLabel('Vence').click()
  const calendario = page.getByRole('dialog')
  await calendario.getByRole('button', { name: /siguiente/i }).click()
  await calendario.getByRole('gridcell').getByRole('button', { name: /\b15 de\b/ }).first().click()
}
