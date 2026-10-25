import { Router, type Request } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { listarProveedores, listarVehiculos } from '../services/seguros.js'
import { getNeighborhood } from '../services/neighborhoods.js'
import { buildWorkbook, diaExcel, fechaExcel, XLSX_MIME, type Hoja } from '../lib/excel.js'
import { COLOR_DEFAULT } from '../lib/marca.js'
import { slug } from '../lib/slug.js'

/** Los seguros del padrón: los ven la garita y el admin; corregirlos es de la garita (/gate). */
export const insuranceRoutes = Router()
insuranceRoutes.use(requireAuth, requireRole('guard', 'admin'))

const filtros = z.object({
  estado: z.enum(['vencido', 'por_vencer', 'vigente', 'sin_cargar']).optional(),
  q: z.string().trim().max(80).optional(),
})

const ESTADO_EXCEL = { vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente', sin_cargar: 'Sin cargar' } as const
type Ultimo = { at: string; guestName?: string; unitLabel: string; sinSeguro: boolean } | null

insuranceRoutes.get('/vehicles', async (req, res) => {
  res.json(await listarVehiculos(req.person!.neighborhoodId, filtros.parse(req.query)))
})

insuranceRoutes.get('/providers', async (req, res) => {
  res.json(await listarProveedores(req.person!.neighborhoodId, filtros.parse(req.query)))
})

/** Una portada y una hoja: el listado tal como se ve, con los mismos filtros. */
async function libro(req: Request, titulo: string, hoja: Hoja) {
  const barrio = await getNeighborhood(req.person!.neighborhoodId)
  const buffer = await buildWorkbook({
    autor: barrio.name,
    color: barrio.brandColor ?? COLOR_DEFAULT,
    resumen: {
      titulo, subtitulo: barrio.name,
      bloques: [{ titulo: 'Generado', filas: [['Por', req.person!.name], ['Filas', hoja.filas.length]] }],
      notas: ['Ordenado por vencimiento. "Por vencer" usa los días de aviso del barrio. Horas de Buenos Aires.'],
    },
    hojas: [hoja],
  })
  return { barrio, buffer }
}

insuranceRoutes.get('/vehicles.xlsx', async (req, res) => {
  const { rows } = await listarVehiculos(req.person!.neighborhoodId, filtros.parse(req.query))
  const { barrio, buffer } = await libro(req, 'Seguros de autos', {
    nombre: 'Autos',
    columnas: [
      { header: 'Patente', key: 'patente' }, { header: 'Compañía', key: 'compania', width: 22 },
      { header: 'Póliza', key: 'poliza', width: 16 }, { header: 'Vence', key: 'vence', formato: 'fecha' },
      { header: 'Estado', key: 'estado' }, { header: 'Cargado por', key: 'cargadoPor', width: 20 },
      { header: 'Cargado el', key: 'cargadoEl', width: 18, formato: 'fechaHora' },
      { header: 'Último ingreso', key: 'ultimo', width: 18, formato: 'fechaHora' },
      { header: 'Con', key: 'con', width: 24 }, { header: 'Lote', key: 'lote' },
      { header: 'Autorizado sin seguro', key: 'sinSeguro', width: 20 },
    ],
    filas: (rows as unknown as (Record<string, string> & { ultimoIngreso: Ultimo })[]).map((r) => ({
      patente: r.plate, compania: r.company, poliza: r.policy, vence: diaExcel(r.expiresOn),
      estado: ESTADO_EXCEL[r.estado as keyof typeof ESTADO_EXCEL], cargadoPor: r.updatedByName ?? '',
      cargadoEl: fechaExcel(r.updatedAt),
      ultimo: r.ultimoIngreso ? fechaExcel(r.ultimoIngreso.at) : '',
      con: r.ultimoIngreso?.guestName ?? '', lote: r.ultimoIngreso?.unitLabel ?? '',
      sinSeguro: r.ultimoIngreso?.sinSeguro ? 'Sí' : '',
    })),
  })
  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-seguros-autos.xlsx`).send(buffer)
})

insuranceRoutes.get('/providers.xlsx', async (req, res) => {
  const { rows } = await listarProveedores(req.person!.neighborhoodId, filtros.parse(req.query))
  const { barrio, buffer } = await libro(req, 'Seguros de proveedores', {
    nombre: 'Proveedores',
    columnas: [
      { header: 'Proveedor', key: 'nombre', width: 26 }, { header: 'DNI', key: 'dni' }, { header: 'Rubro', key: 'rubro' },
      { header: 'Compañía', key: 'compania', width: 22 }, { header: 'Póliza', key: 'poliza', width: 16 },
      { header: 'Vence', key: 'vence', formato: 'fecha' }, { header: 'Estado', key: 'estado' },
      { header: 'Lo cargó', key: 'cargo', width: 20 }, { header: 'Trabaja en', key: 'lotes', width: 24 },
      { header: 'Último ingreso', key: 'ultimo', width: 18, formato: 'fechaHora' },
      { header: 'Autorizado sin seguro', key: 'sinSeguro', width: 20 },
    ],
    filas: (rows as unknown as (Record<string, string | null> & { lotes: string[]; ultimoIngreso: Ultimo })[]).map((r) => ({
      nombre: r.name, dni: r.doc, rubro: r.tradeName ?? '', compania: r.company ?? '', poliza: r.policy ?? '',
      vence: r.expiresOn ? diaExcel(r.expiresOn) : '', estado: ESTADO_EXCEL[r.estado as keyof typeof ESTADO_EXCEL],
      cargo: r.source === 'link' ? 'Él, desde su link' : r.updatedByName ?? '',
      lotes: r.lotes.join(', '),
      ultimo: r.ultimoIngreso ? fechaExcel(r.ultimoIngreso.at) : '',
      sinSeguro: r.ultimoIngreso?.sinSeguro ? 'Sí' : '',
    })),
  })
  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-seguros-proveedores.xlsx`).send(buffer)
})
