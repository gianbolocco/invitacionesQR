import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Response } from 'express'
import { db } from '../db/index.js'
import { sessions, people } from '../db/schema.js'
import { randomToken, sha256 } from '../lib/crypto.js'

const SESSION_DAYS = 180

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
      email: people.email, role: people.role, status: people.status, sessionId: sessions.id,
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

  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId))

  return {
    id: row.id, neighborhoodId: row.neighborhoodId, name: row.name,
    email: row.email, role: row.role as AuthedPerson['role'],
  }
}

export async function revokeSession(token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
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
