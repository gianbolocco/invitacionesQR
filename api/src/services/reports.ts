import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { TZ } from '../lib/dates.js'

/**
 * Todos los cortes por día usan `at time zone` de Postgres con la zona de
 * Buenos Aires. Nunca el reloj del proceso: el contenedor corre en UTC y "hoy"
 * empezaría a las 21 del día anterior.
 *
 * Nota de driver: con node-postgres, `db.execute` devuelve el Result de pg
 * (hay que leer `.rows`), no un array.
 */
export type Kpis = {
  entriesToday: number
  entriesWeek: number
  entriesMonth: number
  activeInvitations: number
  enabledResidents: number
  activeResidents30d: number
  unitsWithoutResidents: number
}

export async function dashboardKpis(neighborhoodId: string): Promise<Kpis> {
  const { rows } = await db.execute(sql`
    with local as (select (now() at time zone ${TZ})::date as today)
    select
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date = local.today)::int as "entriesToday",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date > local.today - 7)::int as "entriesWeek",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date > local.today - 30)::int as "entriesMonth",
      (select count(*) from invitation i join unit u on u.id = i.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and i.revoked_at is null and i.valid_to >= local.today)::int as "activeInvitations",
      (select count(*) from person
        where neighborhood_id = ${neighborhoodId} and role = 'resident' and status = 'active')::int
        as "enabledResidents",
      (select count(distinct p.id) from person p, local
        where p.neighborhood_id = ${neighborhoodId} and p.role = 'resident'
          and (p.last_login_at at time zone ${TZ})::date > local.today - 30)::int as "activeResidents30d",
      (select count(*) from unit u
        where u.neighborhood_id = ${neighborhoodId}
          and not exists (select 1 from unit_member m where m.unit_id = u.id))::int
        as "unitsWithoutResidents"
  `)
  return rows[0] as unknown as Kpis
}

export async function entriesByDay(neighborhoodId: string, days = 30) {
  const res = await db.execute(sql`
    select (e.entered_at at time zone ${TZ})::date as day, count(*)::int as total
    from entry_log e join unit u on u.id = e.unit_id
    where u.neighborhood_id = ${neighborhoodId}
      and e.entered_at > now() - (${days} || ' days')::interval
    group by day order by day
  `)
  return res.rows
}

export async function entriesByHour(neighborhoodId: string) {
  const res = await db.execute(sql`
    select extract(hour from e.entered_at at time zone ${TZ})::int as hour, count(*)::int as total
    from entry_log e join unit u on u.id = e.unit_id
    where u.neighborhood_id = ${neighborhoodId}
    group by hour order by hour
  `)
  return res.rows
}

export async function invitationsByPerson(neighborhoodId: string) {
  const res = await db.execute(sql`
    select p.id, p.name, u.label as "unitLabel", count(i.id)::int as total
    from invitation i
    join person p on p.id = i.created_by
    join unit u on u.id = i.unit_id
    where u.neighborhood_id = ${neighborhoodId}
    group by p.id, p.name, u.label
    order by total desc, p.name
  `)
  return res.rows
}

export async function activityByGuard(neighborhoodId: string) {
  const res = await db.execute(sql`
    select g.id, g.name, count(e.id)::int as total, max(e.entered_at) as "lastAt"
    from entry_log e
    join unit u on u.id = e.unit_id
    left join person g on g.id = e.guard_id
    where u.neighborhood_id = ${neighborhoodId}
    group by g.id, g.name
    order by total desc
  `)
  return res.rows
}

export type EntryFilters = {
  from?: string; to?: string; unitId?: string; guardId?: string; invitationId?: string
}

export type EntryRow = {
  id: string
  enteredAt: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  unitLabel: string
  guardName: string | null
  exitedAt: string | null
  exitGuardName: string | null
}

export async function entriesLog(neighborhoodId: string, f: EntryFilters): Promise<EntryRow[]> {
  const res = await db.execute(sql`
    select e.id, e.entered_at as "enteredAt", e.exited_at as "exitedAt",
           e.guest_name as "guestName",
           e.guest_doc as "guestDoc", e.plate, u.label as "unitLabel",
           g.name as "guardName", gs.name as "exitGuardName"
    from entry_log e
    join unit u on u.id = e.unit_id
    left join person g on g.id = e.guard_id
    left join person gs on gs.id = e.exit_guard_id
    where u.neighborhood_id = ${neighborhoodId}
      and (${f.from ?? null}::date is null or (e.entered_at at time zone ${TZ})::date >= ${f.from ?? null}::date)
      and (${f.to ?? null}::date is null or (e.entered_at at time zone ${TZ})::date <= ${f.to ?? null}::date)
      and (${f.unitId ?? null}::uuid is null or e.unit_id = ${f.unitId ?? null}::uuid)
      and (${f.guardId ?? null}::uuid is null or e.guard_id = ${f.guardId ?? null}::uuid)
      and (${f.invitationId ?? null}::uuid is null or e.invitation_id = ${f.invitationId ?? null}::uuid)
    order by e.entered_at desc
    limit 1000
  `)
  return res.rows as unknown as EntryRow[]
}
