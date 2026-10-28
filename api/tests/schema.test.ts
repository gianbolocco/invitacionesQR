import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { invitations, units, entryLogs, neighborhoods, people, packages, pushSubscriptions } from '../src/db/schema.js'
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

  it('rechaza un delivery sin expires_at', async () => {
    const { unitId, personId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'delivery', guestName: 'Rappi', deliveryApp: 'rappi',
      validFrom: '2026-09-10', validTo: '2026-09-10', token: 'del1',
    }))
    expect(constraint).toBe('invitation_delivery_ck')
  })

  it('rechaza una visita con delivery_app', async () => {
    const { unitId, personId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan', deliveryApp: 'rappi',
      validFrom: '2026-09-10', validTo: '2026-09-10', token: 'del2',
    }))
    expect(constraint).toBe('invitation_delivery_ck')
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

describe('un mail es una sola cuenta, en todo el sistema', () => {
  beforeEach(resetDb)

  /*
   * El único era (neighborhood_id, email), y eso PERMITÍA el mismo mail en dos
   * barrios. El login busca solo por mail con limit(1), así que ese estado
   * dejaba a la persona entrando a un barrio arbitrario. Se arregla impidiendo
   * el estado, no adivinando cuál eligió.
   */
  it('el mismo mail no se puede repetir en otro barrio', async () => {
    const { neighborhoodId } = await seedBasics()
    const [otro] = await db.insert(neighborhoods).values({ name: 'Vista Linda' }).returning()

    const constraint = await violatedConstraint(db.insert(people).values({
      neighborhoodId: otro.id, email: 'martin@example.com', name: 'Homónimo',
      role: 'resident', status: 'active',
    }))
    expect(constraint).toBe('person_email_uq')
    void neighborhoodId
  })

  it('tampoco repetido dentro del mismo barrio', async () => {
    const { neighborhoodId } = await seedBasics()
    const constraint = await violatedConstraint(db.insert(people).values({
      neighborhoodId, email: 'martin@example.com', name: 'Otro Martín',
      role: 'guard', status: 'active',
    }))
    expect(constraint).toBe('person_email_uq')
  })

  describe('paquetes y suscripciones push', () => {
    const base = () => new Date(Date.now() + 30_000)

    it('rechaza una nota de 81 caracteres', async () => {
      const { unitId, personId } = await seedBasics()
      const constraint = await violatedConstraint(db.insert(packages).values({
        unitId, createdBy: personId, note: 'x'.repeat(81), notifyAt: base(),
      }))
      expect(constraint).toBe('package_note_ck')
    })

    it('rechaza una nota vacía', async () => {
      const { unitId, personId } = await seedBasics()
      const constraint = await violatedConstraint(db.insert(packages).values({
        unitId, createdBy: personId, note: '', notifyAt: base(),
      }))
      expect(constraint).toBe('package_note_ck')
    })

    it('rechaza un paquete avisado y cancelado a la vez', async () => {
      const { unitId, personId } = await seedBasics()
      const constraint = await violatedConstraint(db.insert(packages).values({
        unitId, createdBy: personId, notifyAt: base(), notifiedAt: new Date(), canceledAt: new Date(),
      }))
      expect(constraint).toBe('package_estado_ck')
    })

    it('rechaza dos suscripciones con el mismo endpoint', async () => {
      const { personId } = await seedBasics()
      const fila = { personId, endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }
      await db.insert(pushSubscriptions).values(fila)
      const constraint = await violatedConstraint(db.insert(pushSubscriptions).values(fila))
      expect(constraint).toBe('push_subscription_endpoint_uq')
    })
  })
})
