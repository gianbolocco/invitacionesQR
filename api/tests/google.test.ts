import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { linkOrLoginWithGoogle } from '../src/services/google.js'
import { resetDb } from './helpers/db.js'

async function person(email: string, googleSub: string | null = null) {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const barrio = n ?? (await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning())[0]
  const [p] = await db.insert(people).values({
    neighborhoodId: barrio.id, email, name: 'Martín', role: 'resident', status: 'active', googleSub,
  }).returning()
  return p
}

describe('login con Google', () => {
  beforeEach(resetDb)

  it('vincula la cuenta por mail verificado la primera vez', async () => {
    const p = await person('martin@example.com')
    const id = await linkOrLoginWithGoogle({ sub: 'g-123', email: 'martin@example.com', emailVerified: true })
    expect(id).toBe(p.id)

    const [row] = await db.select().from(people).where(eq(people.id, p.id))
    expect(row.googleSub).toBe('g-123')
    expect(row.lastLoginAt).not.toBeNull()
  })

  it('en el segundo login entra por googleSub, no por mail', async () => {
    const p = await person('martin@example.com', 'g-123')
    const id = await linkOrLoginWithGoogle({ sub: 'g-123', email: 'otro@example.com', emailVerified: true })
    expect(id).toBe(p.id)
  })

  it('RECHAZA vincular con un mail no verificado (account takeover)', async () => {
    await person('martin@example.com')
    await expect(linkOrLoginWithGoogle({
      sub: 'g-atacante', email: 'martin@example.com', emailVerified: false,
    })).rejects.toThrow(/email_not_verified/)
  })

  it('el mail no verificado no deja rastro: no vincula nada', async () => {
    const p = await person('martin@example.com')
    await linkOrLoginWithGoogle({ sub: 'g-atacante', email: 'martin@example.com', emailVerified: false })
      .catch(() => {})
    const [row] = await db.select().from(people).where(eq(people.id, p.id))
    expect(row.googleSub).toBeNull()
  })

  it('rechaza un mail que no está en el padrón: no hay registro abierto', async () => {
    await expect(linkOrLoginWithGoogle({
      sub: 'g-999', email: 'desconocido@example.com', emailVerified: true,
    })).rejects.toThrow(/not_in_padron/)
  })

  it('rechaza a una persona deshabilitada', async () => {
    const p = await person('martin@example.com')
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, p.id))
    await expect(linkOrLoginWithGoogle({
      sub: 'g-123', email: 'martin@example.com', emailVerified: true,
    })).rejects.toThrow(/not_in_padron/)
  })

  it('una cuenta deshabilitada YA vinculada tampoco entra', async () => {
    const p = await person('martin@example.com', 'g-123')
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, p.id))
    await expect(linkOrLoginWithGoogle({
      sub: 'g-123', email: 'martin@example.com', emailVerified: true,
    })).rejects.toThrow(/not_in_padron/)
  })
})
