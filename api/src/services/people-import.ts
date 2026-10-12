import { parse } from 'csv-parse/sync'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { createPerson } from './people.js'

const MAX_ROWS = 1000
const MAX_ROWS_PER_BATCH = 20

export type ImportRowPreview = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'ready' | 'invalid' | 'duplicate_file' | 'existing'
  errors: string[]
}

export type ImportPreview = {
  rows: ImportRowPreview[]
  summary: { total: number; ready: number; duplicates: number; invalid: number }
}

export type ImportRowInput = { line: number; name: string; email: string; lot: number | null }
export type ImportRowResult = ImportRowInput & {
  status: 'created' | 'mail_failed' | 'existing' | 'failed'
}

const rowSchema = z.object({
  line: z.number().int().min(2),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  lot: z.number().int().min(1).max(99999).nullable(),
})

function detectDelimiter(csv: string): ',' | ';' {
  const header = csv.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/, 1)[0] ?? ''
  let quoted = false
  let commas = 0
  let semicolons = 0

  for (let i = 0; i < header.length; i++) {
    const char = header[i]
    if (char === '"') {
      if (quoted && header[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted && char === ',') commas++
    else if (!quoted && char === ';') semicolons++
  }

  return semicolons > commas ? ';' : ','
}

function normalizarEncabezado(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function indiceDe(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(normalizarEncabezado(header)))
}

export async function previewPeopleCsv(csv: string, neighborhoodId: string): Promise<ImportPreview> {
  if (!csv.trim()) throw new AppError(400, 'csv_vacio')

  let records: string[][]
  try {
    records = parse(csv, {
      bom: true,
      delimiter: detectDelimiter(csv),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: 10_000,
    }) as string[][]
  } catch {
    throw new AppError(400, 'csv_invalido')
  }

  if (records.length < 2) throw new AppError(400, 'csv_sin_filas')
  if (records.length - 1 > MAX_ROWS) throw new AppError(400, 'csv_demasiadas_filas')

  const headers = records[0]
  const nameIndex = indiceDe(headers, ['nombre', 'nombre completo', 'name'])
  const emailIndex = indiceDe(headers, ['email', 'e-mail', 'mail', 'correo', 'correo electronico'])
  const lotIndex = indiceDe(headers, ['lote', 'numero de lote', 'lot'])
  if (nameIndex < 0 || emailIndex < 0) throw new AppError(400, 'csv_columnas_requeridas')

  const rows: ImportRowPreview[] = records.slice(1).map((record, index) => {
    const name = (record[nameIndex] ?? '').trim()
    const email = (record[emailIndex] ?? '').trim().toLowerCase()
    const rawLot = lotIndex < 0 ? '' : (record[lotIndex] ?? '').trim()
    const errors: string[] = []

    if (!name) errors.push('Falta el nombre')
    if (!z.string().email().safeParse(email).success) errors.push('El correo no es válido')

    let lot: number | null = null
    if (rawLot) {
      const parsedLot = Number(rawLot)
      if (!/^\d+$/.test(rawLot) || !Number.isInteger(parsedLot) || parsedLot < 1 || parsedLot > 99999) {
        errors.push('El lote debe ser un número entre 1 y 99999')
      } else {
        lot = parsedLot
      }
    }

    return {
      line: index + 2,
      name,
      email,
      lot,
      status: errors.length ? 'invalid' : 'ready',
      errors,
    }
  })

  const seen = new Set<string>()
  for (const row of rows) {
    if (row.status !== 'ready') continue
    if (seen.has(row.email)) {
      row.status = 'duplicate_file'
      row.errors.push('Este correo aparece más de una vez en el archivo')
    } else {
      seen.add(row.email)
    }
  }

  const candidates = [...new Set(rows.filter((row) => row.status === 'ready').map((row) => row.email))]
  const existing = candidates.length
    ? await db.select({ email: people.email }).from(people).where(inArray(people.email, candidates))
    : []
  const existingEmails = new Set(existing.map((person) => person.email))

  for (const row of rows) {
    if (row.status === 'ready' && existingEmails.has(row.email)) {
      row.status = 'existing'
      row.errors.push('Este correo ya está en el padrón')
    }
  }

  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter((row) => row.status === 'ready').length,
      duplicates: rows.filter((row) => row.status === 'duplicate_file' || row.status === 'existing').length,
      invalid: rows.filter((row) => row.status === 'invalid').length,
    },
  }
}

export async function importPeopleRows(
  rows: ImportRowInput[],
  neighborhoodId: string,
  actorId: string,
): Promise<ImportRowResult[]> {
  if (!rows.length || rows.length > MAX_ROWS_PER_BATCH) throw new AppError(400, 'lote_importacion_invalido')
  const parsedRows = z.array(rowSchema).min(1).max(MAX_ROWS_PER_BATCH).parse(rows)
  const seen = new Set<string>()
  const results: ImportRowResult[] = []

  for (const row of parsedRows) {
    const email = row.email.toLowerCase().trim()
    if (seen.has(email)) {
      results.push({ ...row, email, status: 'existing' })
      continue
    }
    seen.add(email)

    try {
      const { person, mailEnviado } = await createPerson({
        email,
        name: row.name,
        role: 'resident',
        unitIds: [],
        lot: row.lot ?? undefined,
        neighborhoodId,
        actorId,
      })
      results.push({
        ...row,
        email: person.email ?? email,
        name: person.name,
        status: mailEnviado ? 'created' : 'mail_failed',
      })
    } catch (error) {
      if (error instanceof AppError && error.code === 'mail_repetido') {
        results.push({ ...row, email, status: 'existing' })
      } else {
        console.error(`Falló la importación de ${email}:`, error)
        results.push({ ...row, email, status: 'failed' })
      }
    }
  }

  return results
}
