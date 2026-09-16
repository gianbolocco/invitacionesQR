import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { units, unitMembers, people } from '../db/schema.js'
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

/**
 * Formato canónico de la etiqueta de una unidad.
 *
 * El lote se carga SIEMPRE como número, tanto desde el admin como desde el
 * vecino al entrar. Derivar la etiqueta de un número es lo que evita terminar
 * con "lote 142", "Lote 142" y "L142" como tres unidades distintas, con los
 * vecinos de la misma casa sin verse las invitaciones entre ellos.
 */
export function labelForLot(lot: number): string {
  return `Lote ${lot}`
}

/**
 * Busca la unidad de ese lote o la crea. El vecino la elige una sola vez, al
 * entrar; corregirla después es cosa del admin.
 */
export async function findOrCreateLot(neighborhoodId: string, lot: number) {
  const label = labelForLot(lot)

  const [existente] = await db.select().from(units)
    .where(and(eq(units.neighborhoodId, neighborhoodId), eq(units.label, label)))
    .limit(1)
  if (existente) return existente

  const [nueva] = await db.insert(units).values({ neighborhoodId, label }).returning()
  return nueva
}

/** Asigna la unidad a la persona. Idempotente: repetirlo no duplica la fila. */
export async function joinUnit(unitId: string, personId: string): Promise<void> {
  await db.insert(unitMembers).values({ unitId, personId }).onConflictDoNothing()
}

/** El admin corrige el lote de alguien: saca los anteriores y pone este. */
export async function setPersonLot(
  neighborhoodId: string,
  personId: string,
  lot: number,
  actorId: string,
) {
  const unidad = await findOrCreateLot(neighborhoodId, lot)
  await db.delete(unitMembers).where(eq(unitMembers.personId, personId))
  await joinUnit(unidad.id, personId)
  await audit(actorId, neighborhoodId, 'person.lot_changed', 'person', personId, { lot })
  return unidad
}

/** Un vecino sin unidad asignada tiene que declarar su lote al entrar. */
export async function personNeedsLot(personId: string): Promise<boolean> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
  if (!person || person.role !== 'resident') return false
  return (await unitsOfPerson(personId)).length === 0
}
