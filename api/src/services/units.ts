import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { units, unitMembers } from '../db/schema.js'
import { audit } from '../lib/audit.js'

export async function createUnit(neighborhoodId: string, label: string, actorId: string) {
  const [unit] = await db.insert(units).values({ neighborhoodId, label: label.trim() }).returning()
  await audit(actorId, neighborhoodId, 'unit.created', 'unit', unit.id, { label: unit.label })
  return unit
}

export async function listUnits(neighborhoodId: string) {
  return db.select().from(units).where(eq(units.neighborhoodId, neighborhoodId)).orderBy(units.label)
}

export async function unitsOfPerson(personId: string) {
  return db.select({ id: units.id, label: units.label })
    .from(unitMembers)
    .innerJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(unitMembers.personId, personId))
    .orderBy(units.label)
}
