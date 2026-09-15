import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'

export async function audit(
  actorId: string | null,
  neighborhoodId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: unknown,
): Promise<void> {
  await db.insert(auditLogs).values({
    actorId, neighborhoodId, action, entity, entityId,
    meta: meta === undefined ? null : meta,
  })
}
