import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { checkByToken, checkById, registerEntry, searchGuests, listGuards } from '../services/entries.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))

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

gateRoutes.get('/guards', async (req, res) => {
  res.json(await listGuards(req.person!.neighborhoodId))
})

gateRoutes.post('/entries', async (req, res) => {
  const body = z.object({
    invitationId: z.string().uuid(),
    guardId: z.string().uuid().nullable().optional(),
    guestName: z.string().min(1),
    guestDoc: z.string().optional(),
    plate: z.string().optional(),
    note: z.string().optional(),
  }).parse(req.body)

  res.status(201).json(await registerEntry(body.invitationId, body.guardId ?? null, body))
})
