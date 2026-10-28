import { and, desc, eq, gte, isNotNull, isNull, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { packages, people, units } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { getNeighborhood } from './neighborhoods.js'
import { assertUnitInNeighborhood } from './invitations.js'
import { unitsOfPerson } from './units.js'
import { avisarPaquete } from './avisos.js'

export const DESHACER_SEGUNDOS = 5
const DIAS_LISTA = 30

export async function crearPaquete(input: { unitId: string; note?: string; guardId: string; neighborhoodId: string }) {
  if (!(await getNeighborhood(input.neighborhoodId)).packagesEnabled) throw new AppError(403, 'paquetes_apagados')
  await assertUnitInNeighborhood(input.unitId, input.neighborhoodId)
  const notifyAt = new Date(Date.now() + DESHACER_SEGUNDOS * 1000)
  const [pkg] = await db.insert(packages)
    .values({ unitId: input.unitId, note: input.note || null, createdBy: input.guardId, notifyAt })
    .returning({ id: packages.id, notifyAt: packages.notifyAt })
  // ponytail: timer en memoria; si la API se reinicia en esos segundos, avisarPendientes() lo recupera al arrancar.
  setTimeout(() => { avisarPaquete(pkg.id).catch((e) => console.error('No se pudo avisar el paquete', pkg.id, e)) }, DESHACER_SEGUNDOS * 1000).unref()
  return pkg
}

/** Deshacer es idempotente si ya estaba deshecho; si ya se avisó, no hay vuelta atrás. */
export async function deshacerPaquete(id: string, neighborhoodId: string) {
  const deUnidadDelBarrio = inArray(packages.unitId,
    db.select({ id: units.id }).from(units).where(eq(units.neighborhoodId, neighborhoodId)))
  const hecho = await db.update(packages).set({ canceledAt: sql`now()` })
    .where(and(eq(packages.id, id), isNull(packages.notifiedAt), isNull(packages.canceledAt), deUnidadDelBarrio))
    .returning({ id: packages.id })
  if (hecho.length) return
  const [p] = await db.select({ notifiedAt: packages.notifiedAt }).from(packages)
    .where(and(eq(packages.id, id), deUnidadDelBarrio))
  if (!p) throw new AppError(404, 'not_found')
  if (p.notifiedAt) throw new AppError(409, 'ya_avisado')
}

/** Los paquetes avisados de las unidades del vecino en los últimos 30 días. */
export async function paquetesDe(personId: string) {
  const unidades = await unitsOfPerson(personId)
  if (!unidades.length) return []
  const [yo] = await db.select({ visto: people.packagesSeenAt }).from(people).where(eq(people.id, personId))
  const filas = await db.select({
    id: packages.id, unitLabel: units.label, note: packages.note, notifiedAt: packages.notifiedAt,
  }).from(packages).innerJoin(units, eq(units.id, packages.unitId))
    .where(and(
      inArray(packages.unitId, unidades.map((u) => u.id)),
      isNotNull(packages.notifiedAt),
      gte(packages.notifiedAt, sql`now() - ${DIAS_LISTA} * interval '1 day'`),
    ))
    .orderBy(desc(packages.notifiedAt))
  return filas.map((f) => ({ ...f, sinVer: !yo?.visto || f.notifiedAt! > yo.visto }))
}

export async function marcarVistos(personId: string) {
  await db.update(people).set({ packagesSeenAt: sql`now()` }).where(eq(people.id, personId))
}

/** Lo que la garita avisó hoy (hora de Buenos Aires). */
export async function paquetesDeHoy(neighborhoodId: string) {
  return db.select({
    id: packages.id, unitLabel: units.label, note: packages.note, notifiedAt: packages.notifiedAt,
  }).from(packages).innerJoin(units, eq(units.id, packages.unitId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      sql`(${packages.notifiedAt} at time zone ${TZ})::date = ${todayInBuenosAires()}::date`,
    ))
    .orderBy(desc(packages.notifiedAt))
}
