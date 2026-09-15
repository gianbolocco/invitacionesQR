import type { RequestHandler } from 'express'
import { resolveSession, type AuthedPerson } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

declare global {
  namespace Express {
    interface Request { person?: AuthedPerson }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.sid
  if (!token) return next(new AppError(401, 'no_session'))
  const person = await resolveSession(token)
  if (!person) return next(new AppError(401, 'invalid_session'))
  req.person = person
  next()
}
