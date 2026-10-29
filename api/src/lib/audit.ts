import { db } from '../db/index.js'

/** db o una transacción: con tx, la fila de auditoría se revierte junto con el resto. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
import { auditLogs } from '../db/schema.js'

export async function audit(
  actorId: string | null,
  neighborhoodId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: unknown,
  tx: Executor = db,
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId, neighborhoodId, action, entity, entityId,
    meta: meta === undefined ? null : meta,
  })
}
