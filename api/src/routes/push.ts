import { Router } from 'express'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { AppError } from '../lib/errors.js'
import { clavePublica, endpointPermitido } from '../lib/push.js'

export const pushRoutes = Router()

pushRoutes.get('/public-key', (_req, res) => res.json({ key: clavePublica() }))

const suscripcion = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

// Upsert por endpoint: si el navegador cambió de cuenta, la suscripción pasa a
// la persona actual y no le llegan avisos de la anterior.
pushRoutes.post('/subscriptions', requireAuth, async (req, res) => {
  const { endpoint, keys } = suscripcion.parse(req.body)
  if (!endpointPermitido(endpoint)) throw new AppError(400, 'endpoint_invalido')
  const personId = req.person!.id
  await db.insert(pushSubscriptions)
    .values({ personId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { personId, p256dh: keys.p256dh, auth: keys.auth } })
  res.status(201).json({ ok: true })
})

pushRoutes.delete('/subscriptions', requireAuth, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body)
  // Solo las propias: si no, cualquiera podría desuscribir a otro conociendo su endpoint.
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.personId, req.person!.id)))
  res.json({ ok: true })
})
