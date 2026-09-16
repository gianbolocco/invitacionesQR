import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  dashboardKpis, entriesByDay, entriesByHour, invitationsByPerson, activityByGuard,
} from '../services/reports.js'

export const reportRoutes = Router()
reportRoutes.use(requireAuth, requireRole('admin'))

// El listado de ingresos y su export se fueron a /gate/audit: una sola pantalla,
// con los movimientos desplegables y el Excel de dos hojas.
reportRoutes.get('/kpis', async (req, res) => res.json(await dashboardKpis(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-day', async (req, res) => res.json(await entriesByDay(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-hour', async (req, res) => res.json(await entriesByHour(req.person!.neighborhoodId)))
reportRoutes.get('/invitations-by-person', async (req, res) =>
  res.json(await invitationsByPerson(req.person!.neighborhoodId)))
reportRoutes.get('/activity-by-guard', async (req, res) =>
  res.json(await activityByGuard(req.person!.neighborhoodId)))
