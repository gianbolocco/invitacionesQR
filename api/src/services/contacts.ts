import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { contacts, neighborhoods, providers, trades, units } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { docSql } from '../lib/padron.js'
import { claveSeguro, pideSeguro, type ClaveSeguro } from '../lib/seguro.js'
import { assertMemberOfUnit } from './invitations.js'

export type Contacto = {
  id: string
  unitId: string
  kind: 'visita' | 'proveedor'
  name: string
  doc: string | null
  tradeId: string | null
  tradeName: string | null
  insuranceState: ClaveSeguro
  insuranceExpiresOn: string | null
}

/**
 * Los contactos de las UF del vecino. El seguro se cruza con el padrón por el
 * DNI normalizado: el vecino ve el estado y el vencimiento, nunca compañía ni
 * póliza (son datos que cargó otro).
 */
export async function listContacts(unitIds: string[], soloId?: string): Promise<Contacto[]> {
  if (!unitIds.length) return []
  const filas = await db.select({
    c: contacts,
    tradeName: trades.name,
    requiresInsurance: trades.requiresInsurance,
    warnDays: neighborhoods.insuranceWarnDays,
    company: providers.insuranceCompany,
    policy: providers.insurancePolicy,
    expiresOn: providers.insuranceExpiresOn,
  }).from(contacts)
    .innerJoin(units, eq(units.id, contacts.unitId))
    .innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
    .leftJoin(trades, eq(trades.id, contacts.tradeId))
    .leftJoin(providers, and(eq(providers.neighborhoodId, units.neighborhoodId), eq(providers.doc, docSql(contacts.doc))))
    .where(and(inArray(contacts.unitId, unitIds), soloId ? eq(contacts.id, soloId) : undefined))
    .orderBy(asc(contacts.name))

  return filas.map(({ c, tradeName, requiresInsurance, warnDays, company, policy, expiresOn }) => {
    const s = company && policy && expiresOn ? { company, policy, expiresOn } : null
    return {
      id: c.id, unitId: c.unitId, kind: c.kind as Contacto['kind'], name: c.name, doc: c.doc,
      tradeId: c.tradeId, tradeName,
      insuranceState: claveSeguro(pideSeguro(c.kind, null, requiresInsurance), s, warnDays),
      insuranceExpiresOn: s?.expiresOn ?? null,
    }
  })
}

async function assertRubroDelBarrio(tradeId: string, unitId: string) {
  const [t] = await db.select({ id: trades.id }).from(trades)
    .innerJoin(units, eq(units.neighborhoodId, trades.neighborhoodId))
    .where(and(eq(trades.id, tradeId), eq(units.id, unitId), isNull(trades.archivedAt))).limit(1)
  if (!t) throw new AppError(400, 'rubro_invalido')
}

/** El contacto, si es de alguna UF del vecino. Si no, 404: no se cuenta que existe. */
async function propio(id: string, unitIds: string[]) {
  if (!unitIds.length) throw new AppError(404, 'contact_not_found')
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), inArray(contacts.unitId, unitIds))).limit(1)
  if (!c) throw new AppError(404, 'contact_not_found')
  return c
}

export async function createContact(personId: string, unitIds: string[], data: {
  unitId?: string; kind: 'visita' | 'proveedor'; name: string; doc?: string | null; tradeId?: string | null
}): Promise<Contacto> {
  const unitId = data.unitId ?? unitIds[0]
  if (!unitId) throw new AppError(403, 'not_your_unit')
  await assertMemberOfUnit(personId, unitId)
  if (data.tradeId) await assertRubroDelBarrio(data.tradeId, unitId)
  const [c] = await db.insert(contacts).values({
    unitId, kind: data.kind, name: data.name.trim(), doc: data.doc?.trim() || null,
    tradeId: data.kind === 'proveedor' ? data.tradeId ?? null : null, createdBy: personId,
  }).returning()
  return (await listContacts([unitId], c.id))[0]
}

export async function editContact(id: string, unitIds: string[], data: {
  name?: string; doc?: string | null; tradeId?: string | null
}): Promise<Contacto> {
  const c = await propio(id, unitIds)
  if (data.tradeId) {
    if (c.kind !== 'proveedor') throw new AppError(400, 'rubro_invalido')
    await assertRubroDelBarrio(data.tradeId, c.unitId)
  }
  await db.update(contacts).set({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.doc !== undefined ? { doc: data.doc?.trim() || null } : {}),
    ...(data.tradeId !== undefined ? { tradeId: data.tradeId } : {}),
  }).where(eq(contacts.id, id))
  return (await listContacts([c.unitId], id))[0]
}

/** Borrado real: es la agenda del vecino, no un registro de nada. */
export async function deleteContact(id: string, unitIds: string[]): Promise<void> {
  await propio(id, unitIds)
  await db.delete(contacts).where(eq(contacts.id, id))
}
