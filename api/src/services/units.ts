import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { units, unitMembers } from '../db/schema.js'

export async function unitsOfPerson(personId: string) {
  return db.select({ id: units.id, label: units.label })
    .from(unitMembers)
    .innerJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(unitMembers.personId, personId))
    .orderBy(units.label)
}
