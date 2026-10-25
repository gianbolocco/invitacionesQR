import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { TZ } from '../lib/dates.js'
import { normalizarPatente } from '../lib/padron.js'

export type EstadoListado = 'vencido' | 'por_vencer' | 'vigente' | 'sin_cargar'
export type FiltroSeguros = { estado?: EstadoListado; q?: string }

/**
 * El estado en SQL, con la misma regla que claveSeguro: vale hasta el día que
 * vence inclusive, y "por vencer" solo si el barrio fija con cuántos días avisar.
 * `col` es siempre una columna fija de este archivo, nunca algo que mande el cliente.
 */
const ESTADO = (col: string) => sql.raw(`case
  when ${col} is null then 'sin_cargar'
  when ${col} < hoy.d then 'vencido'
  when n.insurance_warn_days is not null and ${col} <= hoy.d + n.insurance_warn_days then 'por_vencer'
  else 'vigente' end`)

const HOY = sql`(select (now() at time zone ${TZ})::date as d) hoy`

/** "Autorizó sin seguro": un alta exprés (la creó un guardia) con algún seguro faltante en la foto. */
const SIN_SEGURO = sql.raw(`(p_inv.role = 'guard' and (e.provider_insurance in ('sin_cargar','vencido')
  or e.vehicle_insurance in ('sin_cargar','vencido')))`)

// ponytail: filtro de estado en memoria; con miles de autos, pasarlo al WHERE y contar con un count(*) filter aparte.
export async function listarVehiculos(neighborhoodId: string, f: FiltroSeguros) {
  const q = f.q?.trim() ? `%${normalizarPatente(f.q)}%` : null
  const qTexto = f.q?.trim() ? `%${f.q.trim()}%` : null
  const { rows } = await db.execute(sql`
    select v.id, v.plate, v.insurance_company as company, v.insurance_policy as policy,
           v.insurance_expires_on::text as "expiresOn", ${ESTADO('v.insurance_expires_on')} as estado,
           g.name as "updatedByName", v.insurance_updated_at as "updatedAt",
           ult.ingreso as "ultimoIngreso"
    from vehicle v
    join neighborhood n on n.id = v.neighborhood_id
    cross join ${HOY}
    left join person g on g.id = v.insurance_updated_by
    left join lateral (
      select json_build_object('at', e.entered_at, 'guestName', e.guest_name, 'unitLabel', u.label,
                               'sinSeguro', ${SIN_SEGURO}) as ingreso
      from entry_log e
      join unit u on u.id = e.unit_id
      join invitation i on i.id = e.invitation_id
      join person p_inv on p_inv.id = i.created_by
      where u.neighborhood_id = v.neighborhood_id
        and upper(regexp_replace(coalesce(e.plate, ''), '[^0-9A-Za-z]', '', 'g')) = v.plate
      order by e.entered_at desc limit 1
    ) ult on true
    where v.neighborhood_id = ${neighborhoodId}
      and (${q}::text is null or v.plate like ${q}::text
        or v.insurance_company ilike ${qTexto}::text or v.insurance_policy ilike ${qTexto}::text)
    order by v.insurance_expires_on asc, v.plate
  `)
  const todas = rows as unknown as { estado: EstadoListado }[]
  const counts = { vencido: 0, por_vencer: 0, vigente: 0 }
  for (const r of todas) if (r.estado in counts) counts[r.estado as keyof typeof counts]++
  return { rows: f.estado ? todas.filter((r) => r.estado === f.estado) : todas, counts }
}

export async function listarProveedores(neighborhoodId: string, f: FiltroSeguros) {
  const qTexto = f.q?.trim() ? `%${f.q.trim()}%` : null
  const digitos = f.q?.replace(/\D/g, '') ?? ''
  const qDoc = digitos ? `%${digitos}%` : null
  const { rows } = await db.execute(sql`
    select pr.id, pr.doc, pr.name, t.name as "tradeName",
           pr.insurance_company as company, pr.insurance_policy as policy,
           pr.insurance_expires_on::text as "expiresOn", ${ESTADO('pr.insurance_expires_on')} as estado,
           pr.insurance_source as source, g.name as "updatedByName", pr.insurance_updated_at as "updatedAt",
           coalesce((
             select array_agg(distinct u.label order by u.label)
             from invitation i join unit u on u.id = i.unit_id
             where u.neighborhood_id = pr.neighborhood_id and i.revoked_at is null and i.valid_to >= hoy.d
               and upper(regexp_replace(coalesce(i.guest_doc, ''), '[^0-9A-Za-z]', '', 'g')) = pr.doc
           ), '{}') as lotes,
           ult.ingreso as "ultimoIngreso"
    from provider pr
    join neighborhood n on n.id = pr.neighborhood_id
    cross join ${HOY}
    left join trade t on t.id = pr.trade_id
    left join person g on g.id = pr.insurance_updated_by
    left join lateral (
      select json_build_object('at', e.entered_at, 'unitLabel', u.label, 'sinSeguro', ${SIN_SEGURO}) as ingreso
      from entry_log e
      join unit u on u.id = e.unit_id
      join invitation i on i.id = e.invitation_id
      join person p_inv on p_inv.id = i.created_by
      where u.neighborhood_id = pr.neighborhood_id
        and upper(regexp_replace(coalesce(e.guest_doc, ''), '[^0-9A-Za-z]', '', 'g')) = pr.doc
      order by e.entered_at desc limit 1
    ) ult on true
    where pr.neighborhood_id = ${neighborhoodId}
      -- A un proveedor de un rubro que no pide seguro no se le lista "sin cargar".
      and (pr.insurance_expires_on is not null or t.requires_insurance)
      and (${qTexto}::text is null or pr.name ilike ${qTexto}::text
        or pr.insurance_company ilike ${qTexto}::text or pr.insurance_policy ilike ${qTexto}::text
        or (${qDoc}::text is not null and pr.doc like ${qDoc}::text))
    order by pr.insurance_expires_on asc nulls last, lower(pr.name)
  `)
  const todas = rows as unknown as { estado: EstadoListado }[]
  const counts = { vencido: 0, por_vencer: 0, vigente: 0, sin_cargar: 0 }
  for (const r of todas) counts[r.estado]++
  return { rows: f.estado ? todas.filter((r) => r.estado === f.estado) : todas, counts }
}
