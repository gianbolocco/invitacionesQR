import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Response } from 'express'
import { db } from '../db/index.js'
import { sessions, people } from '../db/schema.js'
import { randomToken, sha256 } from '../lib/crypto.js'

const SESSION_DAYS = 180

/**
 * Cada cuánto se refresca `lastSeenAt`. Antes se escribía en CADA request
 * autenticado: un UPDATE sobre la misma fila por cada pantalla que abre cada
 * vecino, para un dato que solo se usa para saber si una sesión quedó viva de
 * un turno anterior. Con cinco minutos ese dato sigue sirviendo igual.
 */
const LAST_SEEN_MINUTES = 5

export type AuthedPerson = {
  id: string
  neighborhoodId: string
  name: string
  email: string
  role: 'resident' | 'guard' | 'admin'
}

export async function createSession(personId: string, userAgent?: string): Promise<string> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.insert(sessions).values({ personId, tokenHash: sha256(token), userAgent, expiresAt })
  return token
}

export async function resolveSession(token: string): Promise<AuthedPerson | null> {
  const [row] = await db
    .select({
      id: people.id, neighborhoodId: people.neighborhoodId, name: people.name,
      email: people.email, role: people.role, status: people.status,
      sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(people, eq(people.id, sessions.personId))
    .where(and(
      eq(sessions.tokenHash, sha256(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ))
    .limit(1)

  if (!row || row.status !== 'active') return null

  const desdeElUltimo = Date.now() - row.lastSeenAt.getTime()
  if (desdeElUltimo > LAST_SEEN_MINUTES * 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId))
  }

  return {
    id: row.id, neighborhoodId: row.neighborhoodId, name: row.name,
    email: row.email, role: row.role as AuthedPerson['role'],
  }
}

export async function revokeSession(token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
}

/**
 * Cierra todas las sesiones abiertas de una persona. Lo llama el cambio de
 * contraseña: si no, resetear la clave del celular robado no echaba a nadie —
 * la sesión del ladrón dura 180 días y sigue viva.
 *
 * Devuelve cuántas cerró, para que quien llame pueda decirlo.
 */
export async function revokeAllSessions(personId: string): Promise<number> {
  const cerradas = await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.personId, personId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id })
  return cerradas.length
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie('sid', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86_400_000,
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('sid')
}
