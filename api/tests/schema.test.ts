import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import { invitations, units } from '../src/db/schema.js'
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
      unitId, createdBy: personId, kind: 'evento', guestName: 'Cumple',
      validFrom: '2026-09-10', validTo: '2026-09-10', token: 'abc3', capacity: 0,
    }))
    expect(constraint).toBe('invitation_capacity_ck')
  })

  it('el mismo documento no se puede anotar dos veces al mismo evento', async () => {
    const { unitId, personId } = await seedBasics()
    const [evento] = await db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'evento', guestName: 'Cumple',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 30, token: 'ev1',
    }).returning()

    const hija = {
      unitId, createdBy: personId, parentId: evento.id, kind: 'evento' as const,
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    }
    await db.insert(invitations).values({ ...hija, guestName: 'Martina', guestDoc: '30111222', token: 'h1' })

    const constraint = await violatedConstraint(
      db.insert(invitations).values({ ...hija, guestName: 'Otro nombre', guestDoc: '30111222', token: 'h2' })
    )
    expect(constraint).toBe('invitation_event_doc_uq')
  })

  it('dos anotados sin documento sí pueden convivir', async () => {
    const { unitId, personId } = await seedBasics()
    const [evento] = await db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'evento', guestName: 'Cumple',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 30, token: 'ev2',
    }).returning()

    const hija = {
      unitId, createdBy: personId, parentId: evento.id, kind: 'evento' as const,
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    }
    await db.insert(invitations).values({ ...hija, guestName: 'Uno', token: 'h3' })
    const constraint = await violatedConstraint(
      db.insert(invitations).values({ ...hija, guestName: 'Dos', token: 'h4' })
    )
    expect(constraint).toBeNull()
  })

  it('rechaza dos UF con la misma etiqueta en el mismo barrio', async () => {
    const { neighborhoodId } = await seedBasics()
    const constraint = await violatedConstraint(
      db.insert(units).values({ neighborhoodId, label: 'Lote 142' })
    )
    expect(constraint).toBe('unit_label_uq')
  })
})
