import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { invitations, people, unitMembers } from '../src/db/schema.js'
import { createInvitation } from '../src/services/invitations.js'
import { disablePerson } from '../src/services/people.js'
import { checkByToken } from '../src/services/entries.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { resetDb, seedBasics } from './helpers/db.js'

const hoy = todayInBuenosAires()
const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)

describe('dar de baja a un vecino', () => {
  beforeEach(resetDb)

  async function invitar(unitId: string, createdBy: string, validFrom: string, validTo: string) {
    return createInvitation({
      unitId, createdBy, kind: 'frecuente', guestName: 'Rosa', validFrom, validTo, capacity: 99,
    })
  }

  it('sus invitaciones vigentes dejan de abrir la barrera', async () => {
    const { personId, unitId, neighborhoodId } = await seedBasics()
    const frecuente = await invitar(unitId, personId, hoy, dentroDe(20))

    await disablePerson(personId, personId, neighborhoodId)

    const r = await checkByToken(frecuente.token)
    expect(r.check).toEqual({ ok: false, reason: 'revoked' })
  })

  it('no reescribe el pasado ni toca las de otro de la misma casa', async () => {
    const { personId, unitId, neighborhoodId } = await seedBasics()
    const [otra] = await db.insert(people).values({
      neighborhoodId, email: 'laura@example.com', name: 'Laura', role: 'resident', status: 'active',
    }).returning()
    await db.insert(unitMembers).values({ unitId, personId: otra.id })

    const vencida = await invitar(unitId, personId, dentroDe(-30), dentroDe(-20))
    const deLaura = await invitar(unitId, otra.id, hoy, dentroDe(30))

    await disablePerson(personId, personId, neighborhoodId)

    const [v] = await db.select().from(invitations).where(eq(invitations.id, vencida.id))
    const [l] = await db.select().from(invitations).where(eq(invitations.id, deLaura.id))
    expect(v.revokedAt).toBeNull()
    expect(l.revokedAt).toBeNull()
  })
})
