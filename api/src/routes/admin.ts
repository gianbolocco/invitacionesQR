import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createUnit, listUnits } from '../services/units.js'
import {
  createPerson, listPeople, disablePerson, resendInvite, setGuardPassword,
} from '../services/people.js'
import { getNeighborhood, updateNeighborhood } from '../services/neighborhoods.js'

export const adminRoutes = Router()
adminRoutes.use(requireAuth, requireRole('admin'))

adminRoutes.get('/units', async (req, res) => {
  res.json(await listUnits(req.person!.neighborhoodId))
})

adminRoutes.post('/units', async (req, res) => {
  const { label } = z.object({ label: z.string().min(1) }).parse(req.body)
  res.status(201).json(await createUnit(req.person!.neighborhoodId, label, req.person!.id))
})

adminRoutes.get('/people', async (req, res) => {
  res.json(await listPeople(req.person!.neighborhoodId))
})

adminRoutes.post('/people', async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(['resident', 'guard', 'admin']),
    unitIds: z.array(z.string().uuid()).default([]),
  }).parse(req.body)

  const { person } = await createPerson({
    ...body,
    neighborhoodId: req.person!.neighborhoodId,
    actorId: req.person!.id,
  })
  res.status(201).json({ id: person.id, email: person.email, status: person.status })
})

adminRoutes.post('/people/:id/disable', async (req, res) => {
  await disablePerson(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/resend', async (req, res) => {
  await resendInvite(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/password', async (req, res) => {
  const { password } = z.object({ password: z.string().min(10) }).parse(req.body)
  await setGuardPassword(req.params.id, password, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.get('/neighborhood', async (req, res) => {
  res.json(await getNeighborhood(req.person!.neighborhoodId))
})

adminRoutes.patch('/neighborhood', async (req, res) => {
  const body = z.object({
    name: z.string().min(1).optional(),
    address: z.string().max(200).optional(),
    // Un link, no una API de mapas. Se valida que sea http(s) y nada más.
    mapUrl: z.union([z.string().url().startsWith('http'), z.literal('')]).optional(),
  }).parse(req.body)

  res.json(await updateNeighborhood(req.person!.neighborhoodId, req.person!.id, body))
})
