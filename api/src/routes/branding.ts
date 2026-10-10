import { Router } from 'express'
import { getBranding } from '../services/branding.js'

export const brandingRoutes = Router()

/* Público a propósito: lo consumen el layout de Next antes de que exista una
   sesión y la página del invitado, que nunca la tiene. */
brandingRoutes.get('/', async (_req, res) => {
  res.json(await getBranding())
})
