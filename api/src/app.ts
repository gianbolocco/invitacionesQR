import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { ZodError } from 'zod'
import { pool } from './db/index.js'
import { errorHandler } from './lib/errors.js'
import { authRoutes } from './routes/auth.js'
import { googleRoutes } from './routes/google.js'
import { adminRoutes } from './routes/admin.js'
import { invitationRoutes } from './routes/invitations.js'
import { contactRoutes } from './routes/contacts.js'
import { gateRoutes } from './routes/gate.js'
import { insuranceRoutes } from './routes/seguros.js'
import { brandingRoutes } from './routes/branding.js'
import { reportRoutes } from './routes/reports.js'
import { avisarAlEscribir } from './lib/avisos.js'
import { eventRoutes } from './routes/events.js'
import { pushRoutes } from './routes/push.js'

export function buildApp() {
  const app = express()
  /*
   * La API vive detrás de Caddy (y en Coolify, además, detrás de su proxy), así
   * que la IP del socket es la de un proxy. Se confía en los saltos de redes
   * privadas y req.ip queda en la primera IP pública desde la derecha del
   * X-Forwarded-For: la del cliente. Lo que el cliente escriba a la izquierda
   * de esa no se mira. Sin esto, el rate limit veía a todo el barrio como uno.
   */
  app.set('trust proxy', 'loopback, linklocal, uniquelocal')
  app.disable('x-powered-by')
  app.use(express.json())
  app.use(cookieParser())
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }))

  app.get('/health', async (_req, res) => {
    await pool.query('select 1')
    res.json({ ok: true, db: true })
  })

  app.use('/auth', authRoutes)
  app.use('/auth', googleRoutes)
  // Lo que se escribe acá puede cambiar lo que muestra la garita: altas,
  // ediciones, anulaciones, ingresos, egresos, bajas de vecinos.
  app.use(['/admin', '/invitations', '/gate'], avisarAlEscribir)
  app.use('/admin', adminRoutes)
  app.use('/invitations', invitationRoutes)
  app.use('/contacts', contactRoutes)
  app.use('/gate', gateRoutes)
  app.use('/insurance', insuranceRoutes)
  app.use('/branding', brandingRoutes)
  app.use('/reports', reportRoutes)
  app.use('/events', eventRoutes)
  app.use('/push', pushRoutes)

  // Los errores de zod se traducen a 400 antes del handler genérico.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'validation', issues: err.issues })
      return
    }
    next(err)
  })
  app.use(errorHandler)

  return app
}
