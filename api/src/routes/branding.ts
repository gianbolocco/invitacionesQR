import { Router } from 'express'
import { getBranding, leerLogo } from '../services/branding.js'

export const brandingRoutes = Router()

/* Público a propósito: lo consumen el layout de Next antes de que exista una
   sesión y la página del invitado, que nunca la tiene. */
brandingRoutes.get('/', async (_req, res) => {
  res.json(await getBranding())
})

brandingRoutes.get('/logo', async (_req, res) => {
  const logo = await leerLogo()
  if (!logo) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  // Un logo cambia una vez por año: una hora de caché no molesta a nadie y le
  // saca una request a cada carga de página.
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.type(logo.mime).send(logo.bytes)
})
