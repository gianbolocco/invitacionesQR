import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, neighborhoods, trades, units } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { seguroVigente } from '../lib/seguro.js'

const esDuplicado = (e: unknown) =>
  (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505'

export async function listTrades(nid: string, { incluirArchivados = false } = {}) {
  return db.select().from(trades)
    .where(and(eq(trades.neighborhoodId, nid), incluirArchivados ? undefined : isNull(trades.archivedAt)))
    .orderBy(asc(sql`lower(${trades.name})`))
}

export async function createTrade(nid: string, actorId: string, name: string) {
  try {
    const [t] = await db.insert(trades).values({ neighborhoodId: nid, name }).returning()
    await audit(actorId, nid, 'trade.created', 'trade', t.id, { name })
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

const DIA_MS = 86_400_000

/**
 * Invitaciones vigentes de rubros que piden seguro y que hoy no están al día:
 * vencidas, por vencer (dentro de insuranceWarnDays; sin ese dato no hay aviso)
 * o sin cargar. Orden: vencidas (la más vieja primero), por vencer (la más
 * cercana primero) y sin cargar (por nombre).
 */
export async function vencimientosDeSeguro(nid: string) {
  const hoy = todayInBuenosAires()
  const [barrio] = await db.select({ dias: neighborhoods.insuranceWarnDays }).from(neighborhoods).where(eq(neighborhoods.id, nid))
  const filas = await db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    tradeName: trades.name,
    unitLabel: units.label,
    company: invitations.insuranceCompany,
    policy: invitations.insurancePolicy,
    expiresOn: invitations.insuranceExpiresOn,
  }).from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .innerJoin(trades, eq(trades.id, invitations.tradeId))
    .where(and(
      eq(units.neighborhoodId, nid),
      eq(trades.requiresInsurance, true),
      isNull(invitations.revokedAt),
      gte(invitations.validTo, hoy),
      or(eq(invitations.kind, 'proveedor'), and(eq(invitations.kind, 'frecuente'), eq(invitations.frequentAs, 'proveedor'))),
    ))

  const ahora = new Date()
  const orden = { vencido: 0, por_vencer: 1, sin_cargar: 2 }
  return filas.flatMap((f) => {
    let estado: keyof typeof orden
    if (!f.expiresOn) estado = 'sin_cargar'
    else if (!seguroVigente(f.expiresOn, ahora)) estado = 'vencido'
    else if (barrio?.dias && (Date.parse(f.expiresOn) - Date.parse(hoy)) / DIA_MS <= barrio.dias) estado = 'por_vencer'
    else return []
    return [{ ...f, estado }]
  }).sort((a, b) =>
    orden[a.estado] - orden[b.estado]
    || (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '')
    || a.guestName.localeCompare(b.guestName))
}
