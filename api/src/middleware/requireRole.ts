import type { RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import type { AuthedPerson } from '../services/sessions.js'

export function requireRole(...roles: AuthedPerson['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.person) return next(new AppError(401, 'no_session'))
    if (!roles.includes(req.person.role)) return next(new AppError(403, 'forbidden'))
    next()
  }
}
