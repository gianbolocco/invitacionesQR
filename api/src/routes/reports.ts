import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  dashboardKpis, entriesByDay, entriesByHour, invitationsByPerson, activityByGuard, entriesLog,
} from '../services/reports.js'
import { TZ } from '../lib/dates.js'

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

/** Escapa un valor para CSV: comillas dobles duplicadas y campo entre comillas. */
function csv(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

reportRoutes.get('/entries.csv', async (req, res) => {
  const rows = await entriesLog(req.person!.neighborhoodId, filterSchema.parse(req.query))
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const lines = ['fecha,hora,invitado,documento,patente,unidad,guardia']
  for (const r of rows) {
    const [fecha, hora] = fmt.format(new Date(r.enteredAt)).split(', ')
    lines.push([fecha, hora, r.guestName, r.guestDoc, r.plate, r.unitLabel, r.guardName].map(csv).join(','))
  }

  res.type('text/csv').attachment('ingresos.csv').send(lines.join('\n'))
})
