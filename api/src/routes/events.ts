import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { suscribir } from '../lib/eventos.js'

export const eventRoutes = Router()

eventRoutes.get('/', requireAuth, (req, res) => suscribir(req.person!.id, res))
