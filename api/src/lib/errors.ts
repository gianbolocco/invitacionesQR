import type { ErrorRequestHandler } from 'express'

export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal' })
}
