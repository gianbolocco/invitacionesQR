import ExcelJS from 'exceljs'

export type Columna = { header: string; key: string; width?: number }

/**
 * Un .xlsx de verdad, no un CSV con otro nombre: Excel lo abre sin preguntar
 * nada sobre codificación ni separadores, y los acentos nunca se rompen.
 *
 * El encabezado va en negrita y congelado porque estas tablas se leen
 * scrolleando cientos de filas, y sin eso a la mitad ya no sabés qué columna es.
 */
export async function buildWorkbook(
  hojas: { nombre: string; columnas: Columna[]; filas: Record<string, unknown>[] }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Álamo Alto'
  wb.created = new Date()

  for (const hoja of hojas) {
    const ws = wb.addWorksheet(hoja.nombre)
    ws.columns = hoja.columnas.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 4),
    }))

    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.addRows(hoja.filas)
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: hoja.columnas.length },
    }
  }

  // exceljs devuelve su propio tipo de buffer; Express quiere un Buffer de Node.
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
