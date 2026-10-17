import ExcelJS from 'exceljs'
import { TZ } from './dates.js'

export type Columna = {
  header: string
  key: string
  width?: number
  /** Una fecha de verdad en la celda: Excel la ordena y la filtra como fecha. */
  formato?: 'fecha' | 'fechaHora'
}

export type Hoja = { nombre: string; columnas: Columna[]; filas: Record<string, unknown>[] }

/** La portada: título y bloques de "etiqueta: valor" (filtros, totales). */
export type Resumen = {
  titulo: string
  subtitulo: string
  bloques: { titulo: string; filas: [string, string | number][] }[]
  notas?: string[]
}

const GRIS_LINEA = 'FFD9D9D9'
const GRIS_ZEBRA = 'FFF6F6F4'
const GRIS_TEXTO = 'FF6B6B6B'

/**
 * Un instante como fecha de Excel, en hora de Buenos Aires. Excel no tiene
 * husos: guarda la hora que se ve. exceljs escribe la hora UTC del Date, así
 * que se arma un Date cuya hora UTC ES la de acá.
 */
export function fechaExcel(instante: Date | string): Date {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instante)).map((p) => [p.type, p.value]))
  return new Date(Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute))
}

/** 'YYYY-MM-DD' (un día, sin hora) como fecha de Excel. */
export function diaExcel(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

const FORMATO = { fecha: 'dd/mm/yyyy', fechaHora: 'dd/mm/yyyy hh:mm' } as const

function portada(ws: ExcelJS.Worksheet, r: Resumen, color: string): void {
  ws.columns = [{ width: 24 }, { width: 46 }]
  ws.views = [{ showGridLines: false }]

  const titulo = ws.addRow([r.titulo])
  titulo.font = { bold: true, size: 18, color: { argb: color } }
  titulo.height = 28
  ws.addRow([r.subtitulo]).font = { size: 12, color: { argb: GRIS_TEXTO } }

  for (const bloque of r.bloques) {
    ws.addRow([])
    const cab = ws.addRow([bloque.titulo.toUpperCase()])
    cab.font = { bold: true, size: 10, color: { argb: color } }
    cab.getCell(1).border = { bottom: { style: 'thin', color: { argb: color } } }
    cab.getCell(2).border = { bottom: { style: 'thin', color: { argb: color } } }
    for (const [etiqueta, valor] of bloque.filas) {
      const fila = ws.addRow([etiqueta, valor])
      fila.getCell(1).font = { color: { argb: GRIS_TEXTO } }
      fila.getCell(2).font = { bold: true }
      fila.getCell(2).alignment = { horizontal: 'left' }
    }
  }

  if (r.notas?.length) {
    ws.addRow([])
    for (const nota of r.notas) {
      const fila = ws.addRow([nota])
      fila.font = { italic: true, size: 9, color: { argb: GRIS_TEXTO } }
      ws.mergeCells(fila.number, 1, fila.number, 2)
      fila.getCell(1).alignment = { wrapText: true, vertical: 'top' }
      fila.height = 26
    }
  }
}

function tabla(ws: ExcelJS.Worksheet, hoja: Hoja, color: string): void {
  ws.columns = hoja.columnas.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(12, c.header.length + 4),
    style: c.formato ? { numFmt: FORMATO[c.formato] } : undefined,
  }))

  // El encabezado congelado y con filtros: estas tablas se leen scrolleando
  // cientos de filas, y a la mitad ya no sabés qué columna es.
  const cab = ws.getRow(1)
  cab.height = 22
  cab.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    celda.alignment = { vertical: 'middle' }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.addRows(hoja.filas)
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } }

  // Filas alternadas y una línea fina abajo: se sigue la fila con la vista
  // sin una grilla de bordes en cada celda.
  for (let i = 2; i <= ws.rowCount; i++) {
    const fila = ws.getRow(i)
    for (let c = 1; c <= hoja.columnas.length; c++) {
      const celda = fila.getCell(c)
      celda.border = { bottom: { style: 'thin', color: { argb: GRIS_LINEA } } }
      if (i % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_ZEBRA } }
    }
  }
}

/**
 * Un .xlsx de verdad, no un CSV con otro nombre: Excel lo abre sin preguntar
 * nada sobre codificación ni separadores, y los acentos nunca se rompen.
 *
 * La primera hoja es una portada con qué es el archivo y con qué filtros se
 * sacó: un Excel reenviado por mail pierde el contexto de la pantalla.
 * El color es el del barrio (hex de la paleta).
 */
export async function buildWorkbook(opts: {
  autor: string
  color: string
  resumen: Resumen
  hojas: Hoja[]
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // El autor es el barrio, no el producto: el archivo es de ellos.
  wb.creator = opts.autor
  wb.created = new Date()
  const argb = `FF${opts.color.replace('#', '').toUpperCase()}`

  portada(wb.addWorksheet('Resumen'), opts.resumen, argb)
  for (const hoja of opts.hojas) tabla(wb.addWorksheet(hoja.nombre), hoja, argb)

  // exceljs devuelve su propio tipo de buffer; Express quiere un Buffer de Node.
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
