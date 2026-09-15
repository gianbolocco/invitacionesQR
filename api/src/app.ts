import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { ZodError } from 'zod'
import { pool } from './db/index.js'
import { errorHandler } from './lib/errors.js'

export function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }))

  app.get('/health', async (_req, res) => {
    await pool.query('select 1')
    res.json({ ok: true, db: true })
  })

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
