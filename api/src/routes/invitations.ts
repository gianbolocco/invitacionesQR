import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  createInvitation, listForUnits, revokeInvitation, findPublicByToken,
  fillGuestDetails, editInvitation, restoreInvitation, searchInvitations,
} from '../services/invitations.js'
import { unitsOfPerson } from '../services/units.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { AppError } from '../lib/errors.js'
import { validarUuid } from '../middleware/uuidParam.js'

export const invitationRoutes = Router()

/* ---------- Públicas: sin sesión. Van ANTES del router protegido. ---------- */

invitationRoutes.get('/public/:token', async (req, res) => {
  const row = await findPublicByToken(req.params.token)
  if (!row) throw new AppError(404, 'not_found')
  res.json(row)
})

// Limita por token, no por IP: varios invitados pueden compartir la conexión de
// una casa, y no queremos que se bloqueen entre sí.
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

/* ---------- De acá para abajo, todo pide sesión. ---------- */
invitationRoutes.use(requireAuth)
validarUuid(invitationRoutes)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')

const createSchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(['visita', 'frecuente', 'proveedor']),
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

const historySchema = z.object({
  q: z.string().trim().max(80).optional(),
  kind: z.enum(['visita', 'frecuente', 'proveedor']).optional(),
  estado: z.enum(['entro', 'no_entro', 'anulada']).optional(),
  // Llega como string desde la query. z.coerce.boolean() no sirve acá:
  // Boolean('false') es true.
  soloMias: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

/** Historial: buscable, filtrable y paginado. Va antes de /:id/... */
invitationRoutes.get('/historial', async (req, res) => {
  const { soloMias, ...f } = historySchema.parse(req.query)
  const units = await unitsOfPerson(req.person!.id)
  res.json(await searchInvitations(units.map((u) => u.id), {
    ...f,
    createdBy: soloMias ? req.person!.id : undefined,
  }))
})

invitationRoutes.post('/:id/revoke', async (req, res) => {
  await revokeInvitation(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
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

/** Deshacer una anulación. */
invitationRoutes.post('/:id/restore', async (req, res) => {
  await restoreInvitation(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})
