import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { contacts, neighborhoods, people, trades, units, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
  const crear = async (email: string, role: 'admin' | 'resident') => (await db.insert(people).values({
    neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning())[0]
  const admin = await crear('admin@example.com', 'admin')
  const ana = await crear('ana@example.com', 'resident')
  const beto = await crear('beto@example.com', 'resident')
  const carla = await crear('carla@example.com', 'resident')
  const [l1] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [l2] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 2' }).returning()
  // Ana y Beto viven juntos en el Lote 1; Carla en el 2.
  await db.insert(unitMembers).values([{ unitId: l1.id, personId: ana.id }, { unitId: l1.id, personId: beto.id }, { unitId: l2.id, personId: carla.id }])
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  return { n, l1, l2, ana, admin: await entrar('admin@example.com'), sAna: await entrar('ana@example.com'), sBeto: await entrar('beto@example.com'), sCarla: await entrar('carla@example.com') }
}

describe('contactos: tabla', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('una visita no lleva rubro', async () => {
    const { n, l1, ana } = await escenario()
    const [t] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Jardinero' }).returning()
    expect(await violatedConstraint(db.insert(contacts).values({
      unitId: l1.id, kind: 'visita', name: 'Rosa', tradeId: t.id, createdBy: ana.id,
    }))).toBe('contact_trade_ck')
  })
})
