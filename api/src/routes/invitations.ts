import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  createInvitation, listForUnits, revokeInvitation, findPublicByToken,
  fillGuestDetails, joinEvent, listEventGuests, editInvitation,
} from '../services/invitations.js'
import { unitsOfPerson } from '../services/units.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { AppError } from '../lib/errors.js'

export const invitationRoutes = Router()

/* ---------- Públicas: sin sesión. Van ANTES del router protegido. ---------- */

invitationRoutes.get('/public/:token', async (req, res) => {
  const row = await findPublicByToken(req.params.token)
  if (!row) throw new AppError(404, 'not_found')
  res.json(row)
})

// Limita por token, no por IP: varios invitados de un mismo evento comparten
// la conexión de una casa, y no queremos que se bloqueen entre sí.
const publicWriteLimit = rateLimit({
  max: 10,
  windowMs: 10 * 60_000,
  key: (req) => `public:${String(req.params.token)}`,
})

/** El invitado carga su documento y patente. Solo esos dos campos. */
invitationRoutes.patch('/public/:token', publicWriteLimit, async (req, res) => {
  const body = z.object({
    guestDoc: z.string().max(40).optional(),
    plate: z.string().max(20).optional(),
  }).parse(req.body)

  await fillGuestDetails(String(req.params.token), body)
  res.json({ ok: true })
})

/** El invitado se anota a un evento y se lleva su propio QR. */
invitationRoutes.post('/public/:token/join', publicWriteLimit, async (req, res) => {
  const body = z.object({
    guestName: z.string().min(1).max(80),
    guestDoc: z.string().max(40).optional(),
  }).parse(req.body)

  res.status(201).json(await joinEvent(String(req.params.token), body))
})

/* ---------- De acá para abajo, todo pide sesión. ---------- */
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

/** Los anotados a un evento, para que el vecino vea quién viene. */
invitationRoutes.get('/:id/guests', async (req, res) => {
  res.json(await listEventGuests(req.params.id))
})

const editSchema = z.object({
  guestName: z.string().min(1).optional(),
  guestDoc: z.string().nullable().optional(),
  plate: z.string().nullable().optional(),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  capacity: z.number().int().min(1).optional(),
})

invitationRoutes.patch('/:id', async (req, res) => {
  res.json(await editInvitation(req.params.id, req.person!.id, editSchema.parse(req.body)))
})
