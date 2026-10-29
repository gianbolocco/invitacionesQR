import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { packages, people, pushSubscriptions, unitMembers, units } from '../db/schema.js'
import { avisarGaritas } from '../lib/avisos.js'
import { emitir } from '../lib/eventos.js'
import { enviarPush } from '../lib/push.js'

/**
 * Avisa a los vecinos activos de la unidad. La fila se marca avisada dentro de
 * la transacción (FOR UPDATE: dos llamadas no avisan dos veces) y la red se
 * toca recién después del commit, para no tener el lock tomado durante el envío.
 */
export async function avisarPaquete(id: string): Promise<void> {
  const marcado = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(packages).where(eq(packages.id, id)).for('update')
    if (!p || p.canceledAt || p.notifiedAt) return null
    const notifiedAt = new Date()
    await tx.update(packages).set({ notifiedAt }).where(eq(packages.id, id))
    const [u] = await tx.select({ label: units.label }).from(units).where(eq(units.id, p.unitId))
    return { note: p.note, unitId: p.unitId, unitLabel: u.label, notifiedAt }
  })
  if (!marcado) return
  // Las otras pantallas de garita ven el paquete como avisado al instante.
  avisarGaritas()

  const { unitLabel, note, notifiedAt } = marcado
  const vecinos = await db.select({ id: unitMembers.personId }).from(unitMembers)
    .innerJoin(people, eq(people.id, unitMembers.personId))
    .where(and(eq(unitMembers.unitId, marcado.unitId), eq(people.status, 'active')))
  const ids = vecinos.map((v) => v.id)
  if (!ids.length) return

  for (const personId of ids) emitir(personId, 'package', { id, unitLabel, note, notifiedAt })

  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.personId, ids))
  const payload = { titulo: 'Llegó un paquete', cuerpo: [unitLabel, note].filter(Boolean).join(' · '), url: '/' }
  const resultados = await Promise.allSettled(subs.map((s) => enviarPush(s, payload)))
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') console.error('No se pudo enviar el push', subs[i].id, r.reason)
  })
  const vencidas = subs.filter((_, i) => {
    const r = resultados[i]
    return r.status === 'fulfilled' && r.value === 'vencida'
  }).map((s) => s.id)
  if (vencidas.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, vencidas))
}

/** Al arrancar: los que vencieron mientras la API estaba caída. Devuelve cuántos avisó. */
export async function avisarPendientes(): Promise<number> {
  const pendientes = await db.select({ id: packages.id }).from(packages)
    .where(and(isNull(packages.notifiedAt), isNull(packages.canceledAt), lte(packages.notifyAt, sql`now()`)))
  for (const { id } of pendientes) {
    await avisarPaquete(id).catch((e) => console.error('No se pudo avisar el paquete', id, e))
  }
  return pendientes.length
}
