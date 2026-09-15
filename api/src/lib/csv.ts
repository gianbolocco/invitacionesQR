/**
 * CSV que Excel abre bien de doble clic, sin pasar por el asistente de importación.
 *
 * Tres detalles que son la diferencia entre "anda" y que "Martín Pérez"
 * aparezca como "MartÃ­n PÃ©rez":
 *  - BOM UTF-8 al principio: sin eso Excel asume la codificación local.
 *  - `sep=;` en la primera línea: Excel en español espera punto y coma.
 *  - Punto y coma como separador, coherente con lo anterior.
 */
const SEP = ';'

function campo(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /["\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toExcelCsv(headers: string[], rows: unknown[][]): string {
  const cuerpo = [
    headers.join(SEP),
    ...rows.map((r) => r.map(campo).join(SEP)),
  ].join('\r\n')

  return `﻿sep=${SEP}\r\n${cuerpo}`
}
