import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { invitations, units, entryLogs } from '../src/db/schema.js'
import { randomToken } from '../src/lib/crypto.js'
import { resetDb, seedBasics } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'

describe('constraints del schema', () => {
  beforeEach(resetDb)

  it('rechaza una invitación con la ventana invertida', async () => {
    const { unitId, personId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-20', validTo: '2026-09-10', token: 'abc',
    }))
    expect(constraint).toBe('invitation_window_ck')
  })

  it('rechaza un kind desconocido', async () => {
    const { unitId, personId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'colado', guestName: 'Juan',
      validFrom: '2026-09-10', validTo: '2026-09-10', token: 'abc2',
    }))
    expect(constraint).toBe('invitation_kind_ck')
  })

  it('rechaza cupo menor a 1', async () => {
    const { unitId, personId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-10', validTo: '2026-09-10', token: 'abc3', capacity: 0,
    }))
    expect(constraint).toBe('invitation_capacity_ck')
  })



  it('rechaza dos UF con la misma etiqueta en el mismo barrio', async () => {
    const { neighborhoodId } = await seedBasics()
    const constraint = await violatedConstraint(
      db.insert(units).values({ neighborhoodId, label: 'Lote 142' })
    )
    expect(constraint).toBe('unit_label_uq')
  })
})

describe('egresos en la bitácora', () => {
  beforeEach(resetDb)

  it('un ingreso nace sin salida registrada', async () => {
    const { unitId, personId } = await seedBasics()
    const [inv] = await db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-01-01', validTo: '2030-01-01', capacity: 1, token: randomToken(16),
    }).returning()

    const [entrada] = await db.insert(entryLogs).values({
      invitationId: inv.id, unitId, guestName: 'Juan',
    }).returning()

    expect(entrada.enteredAt).toBeInstanceOf(Date)
    expect(entrada.exitedAt).toBeNull()
    expect(entrada.exitGuardId).toBeNull()
  })

  it('la salida se puede escribir con su propio guardia', async () => {
    const { unitId, personId } = await seedBasics()
    const [inv] = await db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-01-01', validTo: '2030-01-01', capacity: 1, token: randomToken(16),
    }).returning()
    const [entrada] = await db.insert(entryLogs).values({
      invitationId: inv.id, unitId, guestName: 'Juan',
    }).returning()

    const salida = new Date()
    const [cerrada] = await db.update(entryLogs)
      .set({ exitedAt: salida, exitGuardId: personId })
      .where(eq(entryLogs.id, entrada.id))
      .returning()

    expect(cerrada.exitedAt?.getTime()).toBe(salida.getTime())
    expect(cerrada.exitGuardId).toBe(personId)
  })
})
