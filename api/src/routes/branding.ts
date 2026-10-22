import { Router } from 'express'
import { getBranding, leerLogo, leerPlano } from '../services/branding.js'
import { COLOR_DEFAULT, resaltarLote } from '../lib/marca.js'

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

brandingRoutes.get('/plano', async (req, res) => {
  const plano = await leerPlano()
  if (!plano) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  // El SVG no se sanea: el front solo lo muestra con <img>, donde no corre
  // nada. Esta CSP cubre a quien lo abra directo por la URL.
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'public, max-age=3600')

  const lote = req.query.lote
  if (plano.mime === 'image/svg+xml' && typeof lote === 'string' && /^\d{1,6}$/.test(lote)) {
    const { color } = await getBranding()
    // La paleta ya se valida al guardar; el regex es el cinturón para el CSS.
    const seguro = /^#[0-9a-f]{6}$/i.test(color) ? color : COLOR_DEFAULT
    res.type(plano.mime).send(resaltarLote(plano.bytes.toString('utf8'), lote, seguro))
    return
  }
  res.type(plano.mime).send(plano.bytes)
})
