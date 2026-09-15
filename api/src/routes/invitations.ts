import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { createInvitation, listForUnits, revokeInvitation, findPublicByToken } from '../services/invitations.js'
import { unitsOfPerson } from '../services/units.js'
import { AppError } from '../lib/errors.js'

export const invitationRoutes = Router()

// Pública: sin requireAuth, y va ANTES del router protegido.
invitationRoutes.get('/public/:token', async (req, res) => {
  const row = await findPublicByToken(req.params.token)
  if (!row) throw new AppError(404, 'not_found')
  res.json(row)
})

invitationRoutes.use(requireAuth)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')

const createSchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(['visita', 'frecuente', 'evento', 'proveedor']),
  guestName: z.string().min(1),
  guestDoc: z.string().optional(),
  plate: z.string().optional(),
  validFrom: isoDate,
  validTo: isoDate,
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  capacity: z.number().int().min(1),
}).refine((v) => v.validTo >= v.validFrom, { message: 'La ventana está invertida', path: ['validTo'] })

invitationRoutes.post('/', async (req, res) => {
  const body = createSchema.parse(req.body)
  res.status(201).json(await createInvitation({ ...body, createdBy: req.person!.id }))
})

invitationRoutes.get('/', async (req, res) => {
  const units = await unitsOfPerson(req.person!.id)
  res.json(await listForUnits(units.map((u) => u.id)))
})

invitationRoutes.post('/:id/revoke', async (req, res) => {
  await revokeInvitation(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})
