import { and, desc, eq, gte, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, units, people } from '../db/schema.js'
import { canEnter, type EntryCheck } from '../authz.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'
import { audit } from '../lib/audit.js'

/** db o una transacción: las queries de lectura sirven para las dos. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/*
 * PENDIENTE: no filtra por barrio, así que checkById, checkByToken y
 * registerEntry aceptan invitaciones de cualquier barrio de la base. Un guardia
 * ajeno puede registrar un ingreso que no le corresponde. Con un solo barrio el
 * impacto es cero; ver tests/aislamiento-barrios.test.ts.
 */
async function loadForCheck(where: SQL) {
  const [row] = await db.select({
    id: invitations.id,
    kind: invitations.kind,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    revokedAt: invitations.revokedAt,
    unitId: invitations.unitId,
    unitLabel: units.label,
  }).from(invitations).innerJoin(units, eq(units.id, invitations.unitId)).where(where).limit(1)
  return row ?? null
}

type LoadedInvitation = NonNullable<Awaited<ReturnType<typeof loadForCheck>>>

async function buildCheck(invitation: LoadedInvitation) {
  const { usedCount, lastEntryAt } = await usage(invitation.id)
  const check: EntryCheck = canEnter(invitation, new Date(), usedCount)
  const abierta = await openEntry(invitation.id)

  return {
    invitation,
    check,
    usedCount,
    lastEntryAt,
    /*
     * Si viene, el próximo movimiento es un egreso y `check` no aplica: un
     * egreso no se valida. El cliente decide a qué endpoint pegar con esto, y
     * el servidor valida igual por si el dato quedó viejo.
     */
    adentro: abierta ? { entryId: abierta.id, enteredAt: abierta.enteredAt } : null,
  }
}

/** Cuántas veces se usó una invitación y cuándo fue la última. */
async function usage(invitationId: string, tx: Executor = db) {
  const [row] = await tx.select({
    used: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${entryLogs.enteredAt})`,
  }).from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return { usedCount: row?.used ?? 0, lastEntryAt: row?.last ?? null }
}

/**
 * La fila abierta de una invitación: alguien entró y no se registró su salida.
 *
 * Si hay más de una —una frecuente donde el guardia olvidó cerrar una— vale la
 * más reciente. Las anteriores quedan abiertas y la auditoría las muestra sin
 * salida, que es la verdad: no sabemos a qué hora se fue.
 */
async function openEntry(invitationId: string, tx: Executor = db) {
  const [row] = await tx.select({ id: entryLogs.id, enteredAt: entryLogs.enteredAt })
    .from(entryLogs)
    .where(and(eq(entryLogs.invitationId, invitationId), isNull(entryLogs.exitedAt)))
    .orderBy(desc(entryLogs.enteredAt))
    .limit(1)
  return row ?? null
}

export async function checkByToken(token: string) {
  const invitation = await loadForCheck(eq(invitations.token, token))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

export async function checkById(id: string) {
  const invitation = await loadForCheck(eq(invitations.id, id))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

/**
 * Registra el ingreso revalidando el cupo DENTRO de la transacción.
 *
 * El FOR UPDATE sobre la invitación es lo que serializa el cupo: sin él, dos
 * escaneos simultáneos del mismo QR leen el mismo contador y los dos entran.
 */
export async function registerEntry(
  invitationId: string,
  guardId: string | null,
  data: { guestName: string; guestDoc?: string; plate?: string; note?: string },
) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(invitations)
      .where(eq(invitations.id, invitationId)).for('update').limit(1)
    if (!target) throw new AppError(404, 'not_found')

    const { usedCount } = await usage(invitationId, tx)

    const check = canEnter(target, new Date(), usedCount)
    if (!check.ok) throw new AppError(409, check.reason)

    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: target.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: data.guestDoc?.trim() || null,
      plate: data.plate?.trim().toUpperCase() || null,
      note: data.note?.trim() || null,
    }).returning()

    return entry
  })
}

/**
 * Registra la salida: cierra la fila abierta más reciente de esa invitación.
 *
 * No valida NADA. Ni fechas, ni cupo, ni anulación: el que está adentro tiene
 * que poder salir, y si le anularon la invitación mientras estaba adentro eso
 * es justamente lo que se quiere registrado.
 *
 * El `isNull(exitedAt)` del WHERE no es redundante con la lectura de arriba: es
 * lo que hace que dos egresos simultáneos no escriban los dos. El que pierde
 * actualiza cero filas y se va con 409.
 */
export async function registerExit(invitationId: string, guardId: string | null) {
  const abierta = await openEntry(invitationId)
  if (!abierta) throw new AppError(409, 'no_esta_adentro')

  const [salida] = await db.update(entryLogs)
    .set({ exitedAt: new Date(), exitGuardId: guardId })
    .where(and(eq(entryLogs.id, abierta.id), isNull(entryLogs.exitedAt)))
    .returning()

  if (!salida) throw new AppError(409, 'no_esta_adentro')
  return salida
}

/**
 * Cuántos minutos se puede deshacer un movimiento.
 *
 * Es lo que separa "corregir un escaneo doble" de "borrar evidencia": sin
 * límite, un guardia podría borrar un ingreso de hace tres semanas.
 */
const VENTANA_DESHACER_MIN = 5

/**
 * Deshace el último movimiento de una fila de la bitácora.
 *
 * Si tiene salida, la borra (deshace el egreso). Si no, borra la fila entera
 * (deshace el ingreso) y con eso libera el cupo que había consumido.
 *
 * El ingreso borrado se guarda en el meta del audit_log: la fila desaparece,
 * pero que desapareció y qué decía, no.
 */
export async function undoMovement(
  entryId: string,
  personId: string,
  neighborhoodId: string,
): Promise<{ deshecho: 'ingreso' | 'egreso' }> {
  const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.id, entryId)).limit(1)
  if (!fila) throw new AppError(404, 'not_found')

  // El plazo se cuenta desde el movimiento que se está deshaciendo: alguien que
  // entró hace dos horas y salió hace un minuto puede deshacer esa salida.
  const momento = fila.exitedAt ?? fila.enteredAt
  if (Date.now() - momento.getTime() > VENTANA_DESHACER_MIN * 60_000) {
    throw new AppError(409, 'fuera_de_plazo')
  }

  if (fila.exitedAt) {
    await db.update(entryLogs).set({ exitedAt: null, exitGuardId: null })
      .where(eq(entryLogs.id, entryId))
    await audit(personId, neighborhoodId, 'entry.undone', 'entry', entryId, {
      movimiento: 'egreso', exitedAt: fila.exitedAt,
    })
    return { deshecho: 'egreso' }
  }

  await db.delete(entryLogs).where(eq(entryLogs.id, entryId))
  await audit(personId, neighborhoodId, 'entry.undone', 'entry', entryId, {
    movimiento: 'ingreso',
    guestName: fila.guestName,
    guestDoc: fila.guestDoc,
    plate: fila.plate,
    enteredAt: fila.enteredAt,
    guardId: fila.guardId,
  })
  return { deshecho: 'ingreso' }
}

/**
 * Invitaciones todavía vigentes que matchean nombre, documento, etiqueta de UF
 * o patente.
 *
 * La comparación del nombre y la UF pasa por `unaccent`: con un auto esperando
 * en la barrera nadie escribe "Pérez" con tilde, y el vecino sí la escribió al
 * cargar la invitación.
 *
 * ponytail: unaccent() no es IMMUTABLE, así que esto no usa índice y hace scan.
 * Con las invitaciones vigentes de un barrio son decenas de filas. Si alguna vez
 * duele: wrapper IMMUTABLE + índice GIN con pg_trgm.
 */
export async function searchGuests(neighborhoodId: string, query: string) {
  const q = `%${query.trim()}%`
  const hoy = todayInBuenosAires()

  return db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    kind: invitations.kind,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    unitLabel: units.label,
    // Para que el guardia sepa qué va a pasar antes de tocar el resultado.
    adentro: sql<boolean>`exists (
      select 1 from entry_log e
      where e.invitation_id = ${invitations.id} and e.exited_at is null
    )`,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      gte(invitations.validTo, hoy),
      or(
        sql`unaccent(${invitations.guestName}) ilike unaccent(${q})`,
        sql`unaccent(${units.label}) ilike unaccent(${q})`,
        ilike(invitations.plate, q),
        // Sin unaccent: un documento no lleva tildes, y pasarlo por unaccent
        // sería gasto sin efecto.
        ilike(invitations.guestDoc, q),
      ),
    ))
    .orderBy(desc(invitations.createdAt))
    .limit(20)
}


export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  enteredCount: number
  lastEntryAt: Date | null
  /** Última salida registrada ESE día. */
  lastExitAt: Date | null
  /**
   * Hay una fila abierta, de cualquier día. No se filtra por día a propósito:
   * si entró anteayer y nadie registró su salida, sigue adentro hoy.
   */
  adentro: boolean
}

/**
 * Quiénes están habilitados a entrar un día dado.
 *
 * Aplica las mismas reglas que canEnter salvo el cupo: una invitación con el
 * cupo agotado igual aparece, marcada como "ya entró". El guardia necesita ver
 * quién vino, no solo quién falta.
 *
 */
export async function agendaForDay(neighborhoodId: string, day: string): Promise<AgendaRow[]> {
  // 0 = domingo, igual que weekdayInBuenosAires y que la columna weekdays.
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()

  /*
   * Los ingresos se cuentan del día que se está mirando, no de toda la vida de
   * la invitación. Sin esto, una frecuente que entró el lunes figuraba "adentro"
   * el martes y el miércoles, y la agenda de ayer mostraba el ingreso de hoy.
   *
   * El corte del día va en hora de Buenos Aires y no en UTC: entre las 21 y la
   * medianoche acá ya es el día siguiente en UTC, que es justo el horario en
   * que más gente entra al barrio.
   */
  const eseDia = sql`(e.entered_at at time zone ${TZ})::date = ${day}::date`

  const res = await db.execute(sql`
    select
      i.id,
      i.guest_name        as "guestName",
      i.guest_doc         as "guestDoc",
      i.plate,
      i.kind,
      u.label             as "unitLabel",
      p.name              as "inviterName",
      i.capacity,
      (select count(*) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)::int as "enteredCount",
      (select max(e.entered_at) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)      as "lastEntryAt",
      (select max(e.exited_at) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)      as "lastExitAt",
      exists (select 1 from entry_log e
        where e.invitation_id = i.id and e.exited_at is null) as "adentro"
    from invitation i
    join unit u on u.id = i.unit_id
    join person p on p.id = i.created_by
    where u.neighborhood_id = ${neighborhoodId}
      and i.revoked_at is null
      and ${day}::date between i.valid_from and i.valid_to
      and (i.weekdays is null or ${dow} = any(i.weekdays))
    order by lower(i.guest_name)
  `)

  return res.rows as unknown as AgendaRow[]
}

export type AuditRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  validFrom: string
  validTo: string
  createdAt: Date
  status: 'entro' | 'esperando' | 'vencida' | 'anulada'
  enteredAt: Date | null
  enteredCount: number
  guardName: string | null
}

export type AuditStatus = AuditRow['status']

export type AuditFilters = {
  from?: string
  to?: string
  unitId?: string
  status?: AuditStatus
  page?: number
  pageSize?: number
}

export type AuditPage = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<AuditStatus, number>
}

/**
 * Auditoría a nivel invitación: quién entró y quién NO.
 *
 * Cada fila es una invitación, incluidas las que nadie usó. "No vino nadie" es
 * justamente el dato que un listado de ingresos no puede mostrar; los ingresos
 * de cada una se piden aparte al desplegar la fila.
 *
 * El filtro por estado y los contadores van del lado del servidor: con
 * paginación, filtrar la página que llegó daría números que mienten.
 */
export async function auditInvitations(
  neighborhoodId: string,
  f: AuditFilters,
): Promise<AuditPage> {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50))
  const [rows, counts] = await Promise.all([
    auditRows(neighborhoodId, f, pageSize, (page - 1) * pageSize),
    auditCounts(neighborhoodId, f),
  ])

  const total = f.status
    ? counts[f.status]
    : counts.entro + counts.esperando + counts.vencida + counts.anulada

  return { rows, total, page, pageSize, counts }
}

/**
 * Todas las filas que matchean el filtro, sin paginar. Para exportar.
 * El tope de 5000 es una red, no una página: nadie espera que un export
 * respete el scroll, pero tampoco que tire la base abajo.
 */
export function auditAll(neighborhoodId: string, f: AuditFilters): Promise<AuditRow[]> {
  return auditRows(neighborhoodId, f, 5000, 0)
}

async function auditCounts(
  neighborhoodId: string,
  f: AuditFilters,
): Promise<Record<AuditStatus, number>> {
  const hoy = todayInBuenosAires()
  const { rows } = await db.execute(sql`
    with uso as (
      select e.invitation_id, count(*)::int as veces
      from entry_log e group by e.invitation_id
    ),
    clasificadas as (
      select case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.veces, 0) > 0 then 'entro'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end as status
      from invitation i
      join unit u on u.id = i.unit_id
      left join uso on uso.invitation_id = i.id
      where u.neighborhood_id = ${neighborhoodId}
        and (${f.from ?? null}::date is null or i.valid_to >= ${f.from ?? null}::date)
        and (${f.to ?? null}::date is null or i.valid_from <= ${f.to ?? null}::date)
        and (${f.unitId ?? null}::uuid is null or i.unit_id = ${f.unitId ?? null}::uuid)
    )
    select
      count(*) filter (where status = 'entro')::int      as entro,
      count(*) filter (where status = 'esperando')::int  as esperando,
      count(*) filter (where status = 'vencida')::int    as vencida,
      count(*) filter (where status = 'anulada')::int    as anulada
    from clasificadas
  `)
  return rows[0] as unknown as Record<AuditStatus, number>
}

async function auditRows(
  neighborhoodId: string,
  f: AuditFilters,
  limit: number,
  offset: number,
): Promise<AuditRow[]> {
  const hoy = todayInBuenosAires()

  const res = await db.execute(sql`
    with uso as (
      select e.invitation_id,
             count(*)::int as veces,
             max(e.entered_at) as ultima,
             max(g.name) as guardia
      from entry_log e
      left join person g on g.id = e.guard_id
      group by e.invitation_id
    )
    select
      i.id,
      i.guest_name                as "guestName",
      i.guest_doc                 as "guestDoc",
      i.plate,
      i.kind,
      u.label                     as "unitLabel",
      p.name                      as "inviterName",
      i.valid_from                as "validFrom",
      i.valid_to                  as "validTo",
      i.created_at                as "createdAt",
      case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.veces, 0) > 0 then 'entro'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end                         as status,
      uso.ultima                  as "enteredAt",
      coalesce(uso.veces, 0)      as "enteredCount",
      uso.guardia                 as "guardName"
    from invitation i
    join unit u on u.id = i.unit_id
    join person p on p.id = i.created_by
    left join uso on uso.invitation_id = i.id
    where u.neighborhood_id = ${neighborhoodId}
      and (${f.from ?? null}::date is null or i.valid_to >= ${f.from ?? null}::date)
      and (${f.to ?? null}::date is null or i.valid_from <= ${f.to ?? null}::date)
      and (${f.unitId ?? null}::uuid is null or i.unit_id = ${f.unitId ?? null}::uuid)
      and (${f.status ?? null}::text is null or ${f.status ?? null}::text = case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.veces, 0) > 0 then 'entro'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end)
    order by i.valid_from desc, lower(i.guest_name)
    limit ${limit} offset ${offset}
  `)

  return res.rows as unknown as AuditRow[]
}
