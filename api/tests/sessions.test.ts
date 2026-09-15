import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { sessions, people } from '../src/db/schema.js'
import { createSession, resolveSession, revokeSession } from '../src/services/sessions.js'
import { sha256 } from '../src/lib/crypto.js'
import { resetDb, seedBasics } from './helpers/db.js'

describe('sesiones', () => {
  beforeEach(resetDb)

  it('crea una sesión y la resuelve', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId, 'vitest')
    const person = await resolveSession(token)
    expect(person?.id).toBe(personId)
    expect(person?.role).toBe('resident')
  })

  it('nunca guarda el token en claro', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    const [row] = await db.select().from(sessions).where(eq(sessions.personId, personId))
    expect(row.tokenHash).toBe(sha256(token))
    expect(row.tokenHash).not.toBe(token)
  })

  it('permite varias sesiones simultáneas del mismo usuario', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId, 'celular')
    const b = await createSession(personId, 'compu')
    expect(await resolveSession(a)).not.toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('revocar una sesión no afecta a la otra', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId)
    const b = await createSession(personId)
    await revokeSession(a)
    expect(await resolveSession(a)).toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('no resuelve la sesión de una persona deshabilitada', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
    expect(await resolveSession(token)).toBeNull()
  })

  it('un token inventado no resuelve nada', async () => {
    await seedBasics()
    expect(await resolveSession('no-existe')).toBeNull()
  })
})
