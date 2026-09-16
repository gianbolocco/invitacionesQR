import type { Request, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/**
 * Cuántos baldes se toleran antes de barrer los vencidos. La clave es un mail o
 * un token, o sea que el Map crecía para siempre: cada mail que alguien probó
 * una vez quedaba ocupando memoria hasta reiniciar.
 *
 * Se barre al insertar y no con un setInterval: sin timer que limpiar, los
 * tests y el apagado del proceso no tienen nada de qué acordarse.
 */
const TOPE_BALDES = 5_000

function barrerVencidos(now: number): void {
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
}

// ponytail: contador en memoria, se pierde al reiniciar y no se comparte entre
// réplicas. Si algún día corre más de una instancia, mover a Postgres o Redis.
export function rateLimit(opts: { max: number; windowMs: number; key: (req: Request) => string }): RequestHandler {
  return (req, _res, next) => {
    const now = Date.now()
    const k = opts.key(req)
    const bucket = buckets.get(k)

    if (!bucket || bucket.resetAt < now) {
      if (buckets.size >= TOPE_BALDES) barrerVencidos(now)
      buckets.set(k, { count: 1, resetAt: now + opts.windowMs })
      return next()
    }
    if (bucket.count >= opts.max) return next(new AppError(429, 'too_many_requests'))

    bucket.count++
    next()
  }
}

export function resetRateLimits(): void {
  buckets.clear()
}
