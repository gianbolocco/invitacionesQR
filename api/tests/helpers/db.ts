import { pool, db } from '../../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../../src/db/schema.js'

export async function resetDb() {
  await pool.query(`truncate table
    contact, entry_log, provider, vehicle, invitation, trade, unit_member, audit_log, auth_token, session, package, push_subscription, person, unit, neighborhood
    restart identity cascade`)
}

/** Crea un barrio, una UF y un vecino activo. Devuelve sus ids. */
export async function seedBasics() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  return { neighborhoodId: n.id, unitId: u.id, personId: p.id }
}
