import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  dashboardKpis, entriesByDay, entriesByHour, invitationsByPerson, activityByGuard, entriesLog,
} from '../services/reports.js'
import { TZ } from '../lib/dates.js'
import { toExcelCsv } from '../lib/csv.js'

export const reportRoutes = Router()
reportRoutes.use(requireAuth, requireRole('admin'))

const filterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitId: z.string().uuid().optional(),
  guardId: z.string().uuid().optional(),
})

reportRoutes.get('/kpis', async (req, res) => res.json(await dashboardKpis(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-day', async (req, res) => res.json(await entriesByDay(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-hour', async (req, res) => res.json(await entriesByHour(req.person!.neighborhoodId)))
reportRoutes.get('/invitations-by-person', async (req, res) =>
  res.json(await invitationsByPerson(req.person!.neighborhoodId)))
reportRoutes.get('/activity-by-guard', async (req, res) =>
  res.json(await activityByGuard(req.person!.neighborhoodId)))

reportRoutes.get('/entries', async (req, res) => {
  res.json(await entriesLog(req.person!.neighborhoodId, filterSchema.parse(req.query)))
})

reportRoutes.get('/entries.csv', async (req, res) => {
  const rows = await entriesLog(req.person!.neighborhoodId, filterSchema.parse(req.query))
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const csv = toExcelCsv(
    ['Fecha', 'Hora', 'Invitado', 'Documento', 'Patente', 'Unidad', 'Guardia'],
    rows.map((r) => {
      const [fecha, hora] = fmt.format(new Date(r.enteredAt)).split(', ')
      return [fecha, hora, r.guestName, r.guestDoc, r.plate, r.unitLabel, r.guardName]
    }),
  )

  res.type('text/csv; charset=utf-8').attachment('ingresos.csv').send(csv)
})
