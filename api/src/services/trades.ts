import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { trades } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'

const esDuplicado = (e: unknown) =>
  (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505'

export async function listTrades(nid: string, { incluirArchivados = false } = {}) {
  return db.select().from(trades)
    .where(and(eq(trades.neighborhoodId, nid), incluirArchivados ? undefined : isNull(trades.archivedAt)))
    .orderBy(asc(sql`lower(${trades.name})`))
}

export async function createTrade(nid: string, actorId: string, name: string, requiresInsurance = false) {
  try {
    const [t] = await db.insert(trades).values({ neighborhoodId: nid, name, requiresInsurance }).returning()
    await audit(actorId, nid, 'trade.created', 'trade', t.id, { name, requiresInsurance })
    return t
  } catch (e) {
    // El índice único (barrio, lower(nombre)) es la fuente de verdad; no se pre-chequea.
    if (esDuplicado(e)) throw new AppError(400, 'rubro_duplicado')
    throw e
  }
}

export async function updateTrade(
  nid: string, actorId: string, id: string, data: { name?: string; archived?: boolean; requiresInsurance?: boolean },
) {
  try {
    const [t] = await db.update(trades).set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.requiresInsurance !== undefined ? { requiresInsurance: data.requiresInsurance } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    }).where(and(eq(trades.id, id), eq(trades.neighborhoodId, nid))).returning()
    if (!t) throw new AppError(404, 'not_found')
    await audit(actorId, nid, 'trade.updated', 'trade', id, data)
    return t
  } catch (e) {
    if (esDuplicado(e)) throw new AppError(400, 'rubro_duplicado')
    throw e
  }
}
