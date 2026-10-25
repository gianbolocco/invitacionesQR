import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { entryLogs, people, providers, units, vehicles } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { docSql, normalizarDoc, normalizarPatente } from '../lib/padron.js'
import type { Seguro } from '../lib/seguro.js'

/** db o una transacción: con tx, lo que se escribe se revierte junto con el ingreso. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ProveedorPadron = {
  id: string
  name: string
  insurance: Seguro | null
  insuranceSource: 'garita' | 'link' | null
  updatedAt: Date | null
}

export type VehiculoPadron = {
  id: string
  plate: string
  insurance: Seguro
  /** El guardia que lo cargó: es lo que el veredicto muestra ("lo cargó Julio el 02/10"). */
  updatedByName: string | null
  updatedAt: Date
}

const seguroDe = (r: { insuranceCompany: string | null; insurancePolicy: string | null; insuranceExpiresOn: string | null }): Seguro | null =>
  r.insuranceCompany && r.insurancePolicy && r.insuranceExpiresOn
    ? { company: r.insuranceCompany, policy: r.insurancePolicy, expiresOn: r.insuranceExpiresOn }
    : null

export async function buscarProveedor(neighborhoodId: string, doc: string, tx: Executor = db): Promise<ProveedorPadron | null> {
  const clave = normalizarDoc(doc)
  if (!clave) return null
  const [r] = await tx.select().from(providers)
    .where(and(eq(providers.neighborhoodId, neighborhoodId), eq(providers.doc, clave))).limit(1)
  if (!r) return null
  return {
    id: r.id, name: r.name, insurance: seguroDe(r),
    insuranceSource: r.insuranceSource as ProveedorPadron['insuranceSource'], updatedAt: r.insuranceUpdatedAt,
  }
}

export async function buscarVehiculo(neighborhoodId: string, plate: string, tx: Executor = db): Promise<VehiculoPadron | null> {
  const clave = normalizarPatente(plate)
  if (!clave) return null
  const [r] = await tx.select({ v: vehicles, updatedByName: people.name }).from(vehicles)
    .leftJoin(people, eq(people.id, vehicles.insuranceUpdatedBy))
    .where(and(eq(vehicles.neighborhoodId, neighborhoodId), eq(vehicles.plate, clave))).limit(1)
  if (!r) return null
  return { id: r.v.id, plate: r.v.plate, insurance: seguroDe(r.v)!, updatedByName: r.updatedByName, updatedAt: r.v.insuranceUpdatedAt }
}

/**
 * La última patente con la que entró este DNI. Sale de entry_log y no de una
 * tabla persona↔auto: es una sugerencia para el guardia, no un vínculo.
 *
 * ponytail: regexp sobre guest_doc sin índice, scan de los ingresos del barrio.
 * Con decenas de miles de filas duele: índice de expresión sobre docSql(guest_doc).
 */
export async function ultimaPatente(neighborhoodId: string, doc: string): Promise<string | null> {
  const clave = normalizarDoc(doc)
  if (!clave) return null
  const [r] = await db.select({ plate: entryLogs.plate }).from(entryLogs)
    .innerJoin(units, eq(units.id, entryLogs.unitId))
    .where(and(eq(units.neighborhoodId, neighborhoodId), eq(docSql(entryLogs.guestDoc), clave), isNotNull(entryLogs.plate)))
    .orderBy(desc(entryLogs.enteredAt)).limit(1)
  return r?.plate ?? null
}

const columnasSeguro = (s: Seguro) => ({
  insuranceCompany: s.company.trim(),
  insurancePolicy: s.policy.trim(),
  insuranceExpiresOn: s.expiresOn,
})

/**
 * Alta o actualización de un proveedor. Sin `insurance` toca solo el nombre y
 * el rubro: un ingreso sin seguro nuevo no borra el que había.
 */
export async function guardarProveedor(tx: Executor, p: {
  neighborhoodId: string
  doc: string
  name: string
  tradeId?: string | null
  insurance?: Seguro
  source?: 'garita' | 'link'
  actorId: string | null
}): Promise<void> {
  const doc = normalizarDoc(p.doc)
  if (!doc) throw new AppError(400, 'doc_required')
  const antes = p.insurance ? await buscarProveedor(p.neighborhoodId, doc, tx) : null

  const seguro = p.insurance ? {
    ...columnasSeguro(p.insurance),
    insuranceSource: p.source ?? 'garita',
    insuranceUpdatedBy: p.actorId,
    insuranceUpdatedAt: new Date(),
  } : {}
  const rubro = p.tradeId !== undefined ? { tradeId: p.tradeId } : {}

  const [fila] = await tx.insert(providers)
    .values({ neighborhoodId: p.neighborhoodId, doc, name: p.name.trim(), ...rubro, ...seguro })
    .onConflictDoUpdate({ target: [providers.neighborhoodId, providers.doc], set: { name: p.name.trim(), ...rubro, ...seguro } })
    .returning({ id: providers.id })

  if (p.insurance) {
    await audit(p.actorId, p.neighborhoodId, 'provider.insurance_updated', 'provider', fila.id,
      { doc, antes: antes?.insurance ?? null, despues: p.insurance }, tx)
  }
}

/** Alta o actualización del seguro de un auto. Lo carga siempre la garita, con el certificado a la vista. */
export async function guardarVehiculo(tx: Executor, p: {
  neighborhoodId: string
  plate: string
  insurance: Seguro
  actorId: string | null
}): Promise<void> {
  const plate = normalizarPatente(p.plate)
  if (!plate) throw new AppError(400, 'patente_requerida')
  const antes = await buscarVehiculo(p.neighborhoodId, plate, tx)

  const valores = { ...columnasSeguro(p.insurance), insuranceUpdatedBy: p.actorId, insuranceUpdatedAt: new Date() }
  const [fila] = await tx.insert(vehicles)
    .values({ neighborhoodId: p.neighborhoodId, plate, ...valores })
    .onConflictDoUpdate({ target: [vehicles.neighborhoodId, vehicles.plate], set: valores })
    .returning({ id: vehicles.id })

  await audit(p.actorId, p.neighborhoodId, 'vehicle.insurance_updated', 'vehicle', fila.id,
    { plate, antes: antes?.insurance ?? null, despues: p.insurance }, tx)
}
