import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  checkByToken, checkById, registerEntry, registerExit, undoMovement, searchGuests, agendaForDay,
  auditInvitations, auditAll,
} from '../services/entries.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { buildWorkbook, XLSX_MIME } from '../lib/excel.js'
import { entriesLog } from '../services/reports.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))
validarUuid(gateRoutes)

gateRoutes.get('/check/:token', async (req, res) => {
  res.json(await checkByToken(req.params.token))
})

gateRoutes.get('/invitation/:id', async (req, res) => {
  res.json(await checkById(req.params.id))
})

gateRoutes.get('/search', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchGuests(req.person!.neighborhoodId, q))
})

gateRoutes.post('/entries', async (req, res) => {
  const body = z.object({
    invitationId: z.string().uuid(),
    guestName: z.string().min(1),
    guestDoc: z.string().optional(),
    plate: z.string().optional(),
    note: z.string().optional(),
  }).parse(req.body)

  // El guardia sale de la sesión, no del body: un dato de auditoría no puede
  // depender de lo que mande el cliente ni de que alguien elija bien.
  res.status(201).json(await registerEntry(body.invitationId, req.person!.id, body))
})

/** La salida. El guardia sale de la sesión, igual que en el ingreso. */
gateRoutes.post('/exits', async (req, res) => {
  const body = z.object({ invitationId: z.string().uuid() }).parse(req.body)
  res.status(201).json(await registerExit(body.invitationId, req.person!.id))
})

/** Deshacer el último movimiento, para el escaneo doble. */
gateRoutes.post('/entries/:id/undo', async (req, res) => {
  res.json(await undoMovement(req.params.id, req.person!.id, req.person!.neighborhoodId))
})

/** La agenda del día: quién está habilitado a entrar. */
gateRoutes.get('/agenda', async (req, res) => {
  const { date } = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(req.query)

  res.json(await agendaForDay(req.person!.neighborhoodId, date ?? todayInBuenosAires()))
})

const auditFilters = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitId: z.string().uuid().optional(),
  status: z.enum(['entro', 'esperando', 'vencida', 'anulada']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
})

/** Auditoría: una fila por invitación, entró o no entró. Paginada. */
gateRoutes.get('/audit', async (req, res) => {
  res.json(await auditInvitations(req.person!.neighborhoodId, auditFilters.parse(req.query)))
})

const ESTADO_EXCEL: Record<string, string> = {
  entro: 'Entró',
  esperando: 'Esperando',
  vencida: 'No entró',
  anulada: 'Anulada',
}

const KIND_EXCEL: Record<string, string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  proveedor: 'Proveedor',
}

/**
 * El Excel trae DOS hojas: las invitaciones y los ingresos del mismo rango.
 * En pantalla los ingresos se ven desplegando una fila; en un archivo que alguien
 * va a filtrar y sumar, conviene tenerlos planos y aparte.
 *
 * Exporta TODO lo que matchea el filtro, no la página que se está viendo: nadie
 * espera que un export respete el scroll.
 */
gateRoutes.get('/audit.xlsx', async (req, res) => {
  const f = auditFilters.parse(req.query)
  const fecha = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const [auditoria, ingresos] = await Promise.all([
    auditAll(req.person!.neighborhoodId, f),
    entriesLog(req.person!.neighborhoodId, { from: f.from, to: f.to, unitId: f.unitId }),
  ])

  const buffer = await buildWorkbook([
    {
      nombre: 'Invitaciones',
      columnas: [
        { header: 'Invitado', key: 'invitado', width: 26 },
        { header: 'Documento', key: 'documento' },
        { header: 'Patente', key: 'patente' },
        { header: 'Tipo', key: 'tipo' },
        { header: 'Unidad', key: 'unidad' },
        { header: 'Invitó', key: 'invito', width: 20 },
        { header: 'Desde', key: 'desde' },
        { header: 'Hasta', key: 'hasta' },
        { header: 'Estado', key: 'estado' },
        { header: 'Último ingreso', key: 'ingreso', width: 18 },
        { header: 'Ingresos', key: 'ingresos' },
        { header: 'Guardia', key: 'guardia', width: 20 },
      ],
      filas: auditoria.map((r) => ({
        invitado: r.guestName,
        documento: r.guestDoc ?? '',
        patente: r.plate ?? '',
        tipo: KIND_EXCEL[r.kind] ?? r.kind,
        unidad: r.unitLabel,
        invito: r.inviterName,
        desde: r.validFrom,
        hasta: r.validTo,
        estado: ESTADO_EXCEL[r.status] ?? r.status,
        ingreso: r.enteredAt ? fecha.format(new Date(r.enteredAt)) : '',
        ingresos: r.enteredCount,
        guardia: r.guardName ?? '',
      })),
    },
    {
      nombre: 'Ingresos',
      columnas: [
        { header: 'Fecha y hora', key: 'cuando', width: 18 },
        { header: 'Invitado', key: 'invitado', width: 26 },
        { header: 'Documento', key: 'documento' },
        { header: 'Patente', key: 'patente' },
        { header: 'Unidad', key: 'unidad' },
        { header: 'Guardia', key: 'guardia', width: 20 },
      ],
      filas: ingresos.map((e) => ({
        cuando: fecha.format(new Date(e.enteredAt)),
        invitado: e.guestName,
        documento: e.guestDoc ?? '',
        patente: e.plate ?? '',
        unidad: e.unitLabel,
        guardia: e.guardName ?? '',
      })),
    },
  ])

  res.type(XLSX_MIME).attachment('alamo-alto-auditoria.xlsx').send(buffer)
})

/**
 * Los ingresos de UNA invitación: es lo que se despliega al tocar una fila de
 * la auditoría. La auditoría dice "×3"; acá están los tres, con hora y guardia.
 */
gateRoutes.get('/audit/:id/entries', async (req, res) => {
  res.json(await entriesLog(req.person!.neighborhoodId, { invitationId: req.params.id }))
})
