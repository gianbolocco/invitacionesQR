import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { marcarVistos, paquetesDe } from '../services/packages.js'

export const packageRoutes = Router()
packageRoutes.use(requireAuth)

packageRoutes.get('/', async (req, res) => {
  res.json(await paquetesDe(req.person!.id))
})

packageRoutes.post('/seen', async (req, res) => {
  await marcarVistos(req.person!.id)
  res.json({ ok: true })
})
