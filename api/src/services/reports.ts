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
  insideNow: number
  staleInside: number
  entriesSameDayLastWeek: number
  invitedNeverLoggedIn: number
  /** Autos y proveedores del padrón con el seguro vencido que entraron en el último mes. */
  segurosVencidos: number
  /** Seguros que vencen en los días de aviso del barrio (15 si no fijó ninguno). */
  segurosPorVencer: number
  /** Ingresos de los últimos 7 días por un alta exprés con algún seguro faltante. */
  autorizadosSinSeguro: number
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
        as "unitsWithoutResidents",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id
        where u.neighborhood_id = ${neighborhoodId} and e.exited_at is null)::int as "insideNow",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id
        where u.neighborhood_id = ${neighborhoodId} and e.exited_at is null
          and e.entered_at < now() - interval '12 hours')::int as "staleInside",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date = local.today - 7)::int as "entriesSameDayLastWeek",
      (select count(*) from person p, local
        where p.neighborhood_id = ${neighborhoodId} and p.role = 'resident' and p.status = 'invited'
          and not exists (
            select 1 from auth_token t
            where t.person_id = p.id and t.purpose = 'invite' and t.used_at is null and t.expires_at > now()
          ))::int as "invitedNeverLoggedIn",
      -- Vencidos que siguen entrando: un auto o un proveedor con el seguro vencido y un ingreso en el mes.
      ((select count(*) from vehicle v, local
         where v.neighborhood_id = ${neighborhoodId} and v.insurance_expires_on < local.today
           and exists (select 1 from entry_log e join unit u on u.id = e.unit_id
             where u.neighborhood_id = v.neighborhood_id and e.entered_at > now() - interval '30 days'
               and upper(regexp_replace(coalesce(e.plate, ''), '[^0-9A-Za-z]', '', 'g')) = v.plate))
       + (select count(*) from provider p, local
         where p.neighborhood_id = ${neighborhoodId} and p.insurance_expires_on < local.today
           and exists (select 1 from entry_log e join unit u on u.id = e.unit_id
             where u.neighborhood_id = p.neighborhood_id and e.entered_at > now() - interval '30 days'
               and upper(regexp_replace(coalesce(e.guest_doc, ''), '[^0-9A-Za-z]', '', 'g')) = p.doc)))::int
        as "segurosVencidos",
      ((select count(*) from vehicle v, local, neighborhood n
         where v.neighborhood_id = ${neighborhoodId} and n.id = v.neighborhood_id
           and v.insurance_expires_on between local.today and local.today + coalesce(n.insurance_warn_days, 15))
       + (select count(*) from provider p, local, neighborhood n
         where p.neighborhood_id = ${neighborhoodId} and n.id = p.neighborhood_id
           and p.insurance_expires_on between local.today and local.today + coalesce(n.insurance_warn_days, 15)))::int
        as "segurosPorVencer",
      (select count(*) from entry_log e
         join unit u on u.id = e.unit_id
         join invitation i on i.id = e.invitation_id
         join person pi on pi.id = i.created_by
        where u.neighborhood_id = ${neighborhoodId} and e.entered_at > now() - interval '7 days'
          and pi.role = 'guard'
          and (e.provider_insurance in ('sin_cargar','vencido') or e.vehicle_insurance in ('sin_cargar','vencido')))::int
        as "autorizadosSinSeguro"
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
  manual: boolean
  note: string | null
  invitationNote: string | null
  tradeName: string | null
  loadedAt: string | null
  loaderName: string | null
}

export async function entriesLog(neighborhoodId: string, f: EntryFilters): Promise<EntryRow[]> {
  const res = await db.execute(sql`
    select e.id, e.entered_at as "enteredAt", e.exited_at as "exitedAt",
           e.guest_name as "guestName",
           e.guest_doc as "guestDoc", e.plate, u.label as "unitLabel",
           g.name as "guardName", gs.name as "exitGuardName",
           (e.source = 'manual') as manual,
           e.note, i.note as "invitationNote", t.name as "tradeName",
           e.loaded_at as "loadedAt", lp.name as "loaderName"
    from entry_log e
    join unit u on u.id = e.unit_id
    join invitation i on i.id = e.invitation_id
    left join trade t on t.id = i.trade_id
    left join person g on g.id = e.guard_id
    left join person gs on gs.id = e.exit_guard_id
    left join person lp on lp.id = e.loaded_by
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
