import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { pool } from './db/index.js'

export function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }))

  app.get('/health', async (_req, res) => {
    await pool.query('select 1')
    res.json({ ok: true, db: true })
  })

  return app
}
