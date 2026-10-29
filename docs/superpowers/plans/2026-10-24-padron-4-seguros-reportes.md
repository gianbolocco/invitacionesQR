# Seguros y reportes — fase 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pantalla **Seguros** (admin y garita) con los seguros de autos y proveedores ordenados por vencimiento, con filtros y Excel. El tablero avisa vencidos, por vencer y autorizados sin seguro. La auditoría y su Excel muestran el seguro del auto y la foto de los dos seguros al ingresar.

**Architecture:** Un servicio `services/seguros.ts` con dos listados SQL sobre `vehicle` y `provider`. El estado se calcula en la base con la fecha de Buenos Aires y `insurance_warn_days`, y el último ingreso sale de `entry_log` con un `lateral`. "Autorizado sin seguro" no tiene columna: es un ingreso con invitación de portería y alguna foto `sin_cargar`/`vencido`. Rutas nuevas en `/insurance` (garita y admin). En la web, la página `/seguros` vive en el grupo `(garita)`, como la auditoría, y elige el marco según el rol.

**Tech Stack:** Express 5 + zod + Drizzle `db.execute(sql…)`, ExcelJS vía `lib/excel.ts`; Next.js 16 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-24-padron-seguros-contactos-design.md`
**Mockup:** `.superpowers/brainstorm/8-1792885331/content/seguros-admin.html`
**Depende de:** planes 1 y 2 (padrón, foto en `entry_log`, `useCorregirSeguro`).

## Global Constraints

- Hora de Buenos Aires: en SQL, `(now() at time zone ${TZ})::date`; en la web, `hoyISO()`.
- Un DNI nunca va en la URL: los filtros de texto de `/insurance` van por query (`q`), igual que la auditoría (que ya lo hace con `q`). Es texto libre que tipea el guardia, no un DNI leído.
- El admin solo **mira** los seguros: los `PUT` de corrección quedan solo para el guardia.
- Colores: tokens de `globals.css` (`text-alto`, `text-espera`, `text-verde`, `bg-alto-tint`, `bg-espera-tint`, `bg-verde-tint`). Garita y admin desktop-first.
- Textos en voseo. Código y comentarios en español.
- Verificar: `cd api && npm test && npx tsc --noEmit`; `cd web && npm run check && npm run lint && npx tsc --noEmit`; `cd web && npm run e2e -- --workers=1`.
- Commits: `feat:` + español en minúscula + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Archivos

| Archivo | Qué |
|---|---|
| `api/src/services/seguros.ts` (nuevo) | `listarVehiculos`, `listarProveedores`, conteos |
| `api/src/routes/seguros.ts` (nuevo) | `GET /insurance/vehicles`, `/providers` y sus `.xlsx` |
| `api/src/app.ts` | montar `/insurance` |
| `api/src/routes/gate.ts` | los `PUT` de corrección solo para `guard` |
| `api/src/services/reports.ts` | 3 KPIs; `entriesLog` con la foto |
| `api/src/services/entries.ts` | `auditRows` con el seguro del auto, `autorizadoSinSeguro` y el filtro `sinSeguro` |
| `api/src/routes/gate.ts` | Excel de auditoría con columnas nuevas, filtro `sinSeguro` |
| `api/tests/seguros.test.ts` (nuevo) | |
| `web/src/lib/seguros.ts` + `seguros.check.ts` (nuevos) | etiquetas y orden |
| `web/src/lib/queries/seguros.ts` (nuevo) | |
| `web/src/app/(garita)/seguros/page.tsx` (nuevo) | la pantalla |
| `web/src/components/garita/chrome.tsx`, `web/src/components/admin/chrome.tsx` | pestaña Seguros |
| `web/src/app/(admin)/admin/page.tsx`, `web/src/lib/queries/admin.ts` | avisos del tablero |
| `web/src/components/auditoria/*`, `web/src/lib/queries/auditoria.ts`, `web/src/app/(garita)/auditoria/page.tsx` | auto, foto y filtro |
| `web/e2e/seguros.spec.ts` (nuevo) | |

---

### Task 1: Listados de seguros

**Files:**
- Create: `api/src/services/seguros.ts`, `api/src/routes/seguros.ts`
- Modify: `api/src/app.ts`, `api/src/routes/gate.ts`
- Test: `api/tests/seguros.test.ts`

**Interfaces:**
- Consumes: `vehicles`, `providers` (plan 1), `TZ` (`api/src/lib/dates.ts`), `buildWorkbook`, `diaExcel`, `fechaExcel`, `XLSX_MIME` (`api/src/lib/excel.ts`).
- Produces:
  - `type EstadoListado = 'vencido' | 'por_vencer' | 'vigente' | 'sin_cargar'`
  - `GET /insurance/vehicles?estado=&q=` → `{ rows: FilaVehiculo[]; counts: Record<'vencido'|'por_vencer'|'vigente', number> }`
    ```ts
    type FilaVehiculo = {
      id: string; plate: string; company: string; policy: string; expiresOn: string
      estado: 'vencido' | 'por_vencer' | 'vigente'
      updatedByName: string | null; updatedAt: string
      ultimoIngreso: { at: string; guestName: string; unitLabel: string; sinSeguro: boolean } | null
    }
    ```
  - `GET /insurance/providers?estado=&q=` → `{ rows: FilaProveedor[]; counts: Record<EstadoListado, number> }`
    ```ts
    type FilaProveedor = {
      id: string; doc: string; name: string; tradeName: string | null
      company: string | null; policy: string | null; expiresOn: string | null
      estado: EstadoListado
      source: 'garita' | 'link' | null; updatedByName: string | null; updatedAt: string | null
      lotes: string[]   // lotes con una invitación vigente para este DNI
      ultimoIngreso: { at: string; unitLabel: string; sinSeguro: boolean } | null
    }
    ```
    Solo los proveedores con seguro cargado **o** cuyo rubro lo pide (a un plomero de un rubro que no lo pide no se le lista "Sin cargar").
  - Orden: por `expiresOn` ascendente, con "sin cargar" al final y después por nombre o patente.
  - `GET /insurance/vehicles.xlsx` y `/providers.xlsx`: los mismos filtros, una portada y una hoja.
  - Los dos `PUT` de `/gate/*/insurance` pasan a `requireRole('guard')`.

- [ ] **Step 1: Write the failing test**

`api/tests/seguros.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { entryLogs, invitations, neighborhoods, people, providers, trades, units, vehicles } from '../src/db/schema.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'B', insuranceWarnDays: 15 }).returning()
  const crear = async (email: string, role: 'admin' | 'guard' | 'resident') => (await db.insert(people).values({
    neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning())[0]
  const g = await crear('julio@example.com', 'guard')
  await crear('admin@example.com', 'admin')
  const v = await crear('vecino@example.com', 'resident')
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 48' }).returning()
  const auto = (plate: string, expiresOn: string) => db.insert(vehicles).values({
    neighborhoodId: n.id, plate, insuranceCompany: 'La Caja', insurancePolicy: plate, insuranceExpiresOn: expiresOn, insuranceUpdatedBy: g.id,
  })
  return { n, g, v, u, auto, admin: await entrar('admin@example.com'), guardia: await entrar('julio@example.com'), vecino: await entrar('vecino@example.com') }
}

describe('seguros: listado de autos', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('ordena por vencimiento, calcula el estado y cuenta', async () => {
    const { admin, auto } = await escenario()
    await auto('AAA111', sumarDias(hoy, 200))
    await auto('BBB222', sumarDias(hoy, -1))
    await auto('CCC333', sumarDias(hoy, 5))
    const r = await request(app).get('/insurance/vehicles').set('Cookie', admin).expect(200)
    expect(r.body.rows.map((x: { plate: string; estado: string }) => [x.plate, x.estado]))
      .toEqual([['BBB222', 'vencido'], ['CCC333', 'por_vencer'], ['AAA111', 'vigente']])
    expect(r.body.counts).toEqual({ vencido: 1, por_vencer: 1, vigente: 1 })
    expect(r.body.rows[0]).toMatchObject({ company: 'La Caja', updatedByName: 'julio' })
    const f = await request(app).get('/insurance/vehicles?estado=vencido').set('Cookie', admin).expect(200)
    expect(f.body.rows).toHaveLength(1)
    expect(f.body.counts.vigente).toBe(1) // los conteos no miran el filtro de estado
    const b = await request(app).get('/insurance/vehicles?q=ccc 333').set('Cookie', admin).expect(200)
    expect(b.body.rows.map((x: { plate: string }) => x.plate)).toEqual(['CCC333'])
  })

  it('trae el último ingreso y marca si entró autorizado sin seguro', async () => {
    const { u, g, auto, guardia } = await escenario()
    await auto('AE482KL', sumarDias(hoy, -14))
    const [inv] = await db.insert(invitations).values({
      unitId: u.id, createdBy: g.id, kind: 'visita', guestName: 'Hugo Ríos', validFrom: hoy, validTo: hoy, token: 't1',
    }).returning()
    await db.insert(entryLogs).values({ invitationId: inv.id, unitId: u.id, guardId: g.id, guestName: 'Hugo Ríos', plate: 'AE 482 KL', vehicleInsurance: 'vencido' })
    const r = await request(app).get('/insurance/vehicles').set('Cookie', guardia).expect(200)
    expect(r.body.rows[0].ultimoIngreso).toMatchObject({ guestName: 'Hugo Ríos', unitLabel: 'Lote 48', sinSeguro: true })
  })

  it('el vecino no lo ve', async () => {
    const { vecino } = await escenario()
    await request(app).get('/insurance/vehicles').set('Cookie', vecino).expect(403)
  })

  it('el admin no puede corregir, el guardia sí', async () => {
    const { admin, guardia } = await escenario()
    const seguro = { company: 'X', policy: 'Y', expiresOn: '2999-01-01' }
    await request(app).put('/gate/vehicles/insurance').set('Cookie', admin).send({ plate: 'AB123CD', insurance: seguro }).expect(403)
    await request(app).put('/gate/vehicles/insurance').set('Cookie', guardia).send({ plate: 'AB123CD', insurance: seguro }).expect(200)
  })

  it('exporta el Excel', async () => {
    const { admin, auto } = await escenario()
    await auto('AAA111', sumarDias(hoy, 200))
    const r = await request(app).get('/insurance/vehicles.xlsx').set('Cookie', admin).expect(200)
    expect(r.headers['content-type']).toMatch(/spreadsheetml/)
  })
})

describe('seguros: listado de proveedores', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('lista los que tienen seguro o cuyo rubro lo pide, con los lotes donde trabajan', async () => {
    const { n, u, v, admin } = await escenario()
    const [pide] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Gasista', requiresInsurance: true }).returning()
    const [noPide] = await db.insert(trades).values({ neighborhoodId: n.id, name: 'Plomero' }).returning()
    await db.insert(providers).values([
      { neighborhoodId: n.id, doc: '1', name: 'Con seguro', tradeId: pide.id, insuranceCompany: 'Sancor', insurancePolicy: 'P', insuranceExpiresOn: sumarDias(hoy, 3), insuranceSource: 'link' },
      { neighborhoodId: n.id, doc: '2', name: 'Sin cargar', tradeId: pide.id },
      { neighborhoodId: n.id, doc: '3', name: 'No aplica', tradeId: noPide.id },
    ])
    await db.insert(invitations).values({
      unitId: u.id, createdBy: v.id, kind: 'proveedor', tradeId: pide.id, guestName: 'Con seguro', guestDoc: '0.0.1',
      validFrom: hoy, validTo: sumarDias(hoy, 30), token: 't2',
    })
    const r = await request(app).get('/insurance/providers').set('Cookie', admin).expect(200)
    expect(r.body.rows.map((x: { name: string; estado: string }) => [x.name, x.estado]))
      .toEqual([['Con seguro', 'por_vencer'], ['Sin cargar', 'sin_cargar']])
    expect(r.body.rows[0]).toMatchObject({ tradeName: 'Gasista', lotes: ['Lote 48'], source: 'link' })
    expect(r.body.counts).toEqual({ vencido: 0, por_vencer: 1, vigente: 0, sin_cargar: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/seguros.test.ts`
Expected: FAIL con 404 en `/insurance/vehicles`

- [ ] **Step 3: Write minimal implementation**

`api/src/services/seguros.ts`:

```ts
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { TZ } from '../lib/dates.js'
import { normalizarPatente } from '../lib/padron.js'

export type EstadoListado = 'vencido' | 'por_vencer' | 'vigente' | 'sin_cargar'
export type FiltroSeguros = { estado?: EstadoListado; q?: string }

/**
 * El estado en SQL, con la misma regla que claveSeguro: vale hasta el día que
 * vence inclusive, y "por vencer" solo si el barrio fija con cuántos días avisar.
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

export async function listarVehiculos(neighborhoodId: string, f: FiltroSeguros) {
  const q = f.q?.trim() ? `%${normalizarPatente(f.q)}%` : null
  const qTexto = f.q?.trim() ? `%${f.q.trim()}%` : null
  const { rows } = await db.execute(sql`
    with base as (
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
    )
    select * from base
    order by "expiresOn" asc, plate
  `)
  const todas = rows as unknown as { estado: EstadoListado }[]
  const counts = { vencido: 0, por_vencer: 0, vigente: 0 }
  for (const r of todas) if (r.estado in counts) counts[r.estado as keyof typeof counts]++
  return { rows: f.estado ? todas.filter((r) => r.estado === f.estado) : todas, counts }
}

export async function listarProveedores(neighborhoodId: string, f: FiltroSeguros) {
  const qTexto = f.q?.trim() ? `%${f.q.trim()}%` : null
  const qDoc = f.q?.replace(/\D/g, '') ? `%${f.q.replace(/\D/g, '')}%` : null
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
```

Los conteos se hacen en JS sobre todas las filas que matchean el texto (no el estado): son decenas o cientos por barrio. `// ponytail: filtro de estado en memoria; con miles de autos, pasarlo al WHERE y contar con un count(*) filter aparte.` (Poner este comentario arriba de `listarVehiculos`.)

`api/src/routes/seguros.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { listarProveedores, listarVehiculos } from '../services/seguros.js'
import { getNeighborhood } from '../services/neighborhoods.js'
import { buildWorkbook, diaExcel, fechaExcel, XLSX_MIME } from '../lib/excel.js'
import { COLOR_DEFAULT } from '../lib/marca.js'
import { slug } from '../lib/slug.js'

export const insuranceRoutes = Router()
insuranceRoutes.use(requireAuth, requireRole('guard', 'admin'))

const filtros = z.object({
  estado: z.enum(['vencido', 'por_vencer', 'vigente', 'sin_cargar']).optional(),
  q: z.string().trim().max(80).optional(),
})

const ESTADO_EXCEL = { vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente', sin_cargar: 'Sin cargar' } as const
type Ultimo = { at: string; guestName?: string; unitLabel: string; sinSeguro: boolean } | null

insuranceRoutes.get('/vehicles', async (req, res) => {
  res.json(await listarVehiculos(req.person!.neighborhoodId, filtros.parse(req.query)))
})

insuranceRoutes.get('/providers', async (req, res) => {
  res.json(await listarProveedores(req.person!.neighborhoodId, filtros.parse(req.query)))
})

async function libro(req: Parameters<Parameters<typeof insuranceRoutes.get>[1]>[0], titulo: string, hoja: {
  nombre: string; columnas: { header: string; key: string; width?: number; formato?: 'fecha' | 'fechaHora' }[]; filas: Record<string, unknown>[]
}) {
  const barrio = await getNeighborhood(req.person!.neighborhoodId)
  return { barrio, buffer: await buildWorkbook({
    autor: barrio.name,
    color: barrio.brandColor ?? COLOR_DEFAULT,
    resumen: {
      titulo, subtitulo: barrio.name,
      bloques: [{ titulo: 'Generado', filas: [['Por', req.person!.name], ['Filas', hoja.filas.length]] }],
      notas: ['Ordenado por vencimiento. "Por vencer" usa los días de aviso del barrio. Horas de Buenos Aires.'],
    },
    hojas: [hoja],
  }) }
}

insuranceRoutes.get('/vehicles.xlsx', async (req, res) => {
  const { rows } = await listarVehiculos(req.person!.neighborhoodId, filtros.parse(req.query))
  const { barrio, buffer } = await libro(req, 'Seguros de autos', {
    nombre: 'Autos',
    columnas: [
      { header: 'Patente', key: 'patente' }, { header: 'Compañía', key: 'compania', width: 22 },
      { header: 'Póliza', key: 'poliza', width: 16 }, { header: 'Vence', key: 'vence', formato: 'fecha' },
      { header: 'Estado', key: 'estado' }, { header: 'Cargado por', key: 'cargadoPor', width: 20 },
      { header: 'Cargado el', key: 'cargadoEl', width: 18, formato: 'fechaHora' },
      { header: 'Último ingreso', key: 'ultimo', width: 18, formato: 'fechaHora' },
      { header: 'Con', key: 'con', width: 24 }, { header: 'Lote', key: 'lote' },
      { header: 'Autorizado sin seguro', key: 'sinSeguro', width: 20 },
    ],
    filas: (rows as unknown as (Record<string, string> & { ultimoIngreso: Ultimo })[]).map((r) => ({
      patente: r.plate, compania: r.company, poliza: r.policy, vence: diaExcel(r.expiresOn),
      estado: ESTADO_EXCEL[r.estado as keyof typeof ESTADO_EXCEL], cargadoPor: r.updatedByName ?? '',
      cargadoEl: fechaExcel(new Date(r.updatedAt)),
      ultimo: r.ultimoIngreso ? fechaExcel(new Date(r.ultimoIngreso.at)) : '',
      con: r.ultimoIngreso?.guestName ?? '', lote: r.ultimoIngreso?.unitLabel ?? '',
      sinSeguro: r.ultimoIngreso?.sinSeguro ? 'Sí' : '',
    })),
  })
  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-seguros-autos.xlsx`).send(buffer)
})

insuranceRoutes.get('/providers.xlsx', async (req, res) => {
  const { rows } = await listarProveedores(req.person!.neighborhoodId, filtros.parse(req.query))
  const { barrio, buffer } = await libro(req, 'Seguros de proveedores', {
    nombre: 'Proveedores',
    columnas: [
      { header: 'Proveedor', key: 'nombre', width: 26 }, { header: 'DNI', key: 'dni' }, { header: 'Rubro', key: 'rubro' },
      { header: 'Compañía', key: 'compania', width: 22 }, { header: 'Póliza', key: 'poliza', width: 16 },
      { header: 'Vence', key: 'vence', formato: 'fecha' }, { header: 'Estado', key: 'estado' },
      { header: 'Lo cargó', key: 'cargo', width: 20 }, { header: 'Trabaja en', key: 'lotes', width: 24 },
      { header: 'Último ingreso', key: 'ultimo', width: 18, formato: 'fechaHora' },
      { header: 'Autorizado sin seguro', key: 'sinSeguro', width: 20 },
    ],
    filas: (rows as unknown as (Record<string, string | null> & { lotes: string[]; ultimoIngreso: Ultimo })[]).map((r) => ({
      nombre: r.name, dni: r.doc, rubro: r.tradeName ?? '', compania: r.company ?? '', poliza: r.policy ?? '',
      vence: r.expiresOn ? diaExcel(r.expiresOn) : '', estado: ESTADO_EXCEL[r.estado as keyof typeof ESTADO_EXCEL],
      cargo: r.source === 'link' ? 'Él, desde su link' : r.updatedByName ?? '',
      lotes: r.lotes.join(', '),
      ultimo: r.ultimoIngreso ? fechaExcel(new Date(r.ultimoIngreso.at)) : '',
      sinSeguro: r.ultimoIngreso?.sinSeguro ? 'Sí' : '',
    })),
  })
  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-seguros-proveedores.xlsx`).send(buffer)
})
```

(`fechaExcel` acepta `Date | string`: el `new Date(...)` sobra pero no molesta. El tipo del `req` de `libro` puede ser `import type { Request } from 'express'`.)

`api/src/app.ts`: `import { insuranceRoutes } from './routes/seguros.js'` y `app.use('/insurance', insuranceRoutes)` después de `/gate`.

`api/src/routes/gate.ts`: en los dos `PUT` (`/providers/insurance` y `/vehicles/insurance`), sumar `requireRole('guard'),` como primer handler, con este comentario: `// El admin mira los seguros, no los carga: el que ve el certificado es el guardia.`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run tests/seguros.test.ts tests/padron-garita.test.ts && npx tsc --noEmit`
Expected: PASS. Si `padron-garita.test.ts` usaba la sesión de admin para un `PUT`, cambiarla por la del guardia.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/seguros.ts api/src/routes/seguros.ts api/src/app.ts api/src/routes/gate.ts api/tests/seguros.test.ts
git commit -m "feat: listados de seguros de autos y proveedores con excel"
```

---

### Task 2: Avisos del tablero

**Files:**
- Modify: `api/src/services/reports.ts`
- Test: `api/tests/seguros.test.ts`

**Interfaces:**
- Produces: `Kpis` suma `segurosVencidos` (autos y proveedores del padrón con seguro vencido y un ingreso en los últimos 30 días), `segurosPorVencer` (vencen entre hoy y hoy + `coalesce(insurance_warn_days, 15)`) y `autorizadosSinSeguro` (ingresos de los últimos 7 días con invitación de portería y alguna foto `sin_cargar`/`vencido`).

- [ ] **Step 1: Write the failing test**

```ts
describe('seguros: tablero', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('cuenta vencidos que entraron, por vencer y autorizados sin seguro', async () => {
    const { u, g, auto, admin } = await escenario()
    await auto('VENC1', sumarDias(hoy, -3))
    await auto('VENC2', sumarDias(hoy, -3)) // no entró en el mes: no cuenta
    await auto('PORV1', sumarDias(hoy, 10))
    const [inv] = await db.insert(invitations).values({
      unitId: u.id, createdBy: g.id, kind: 'visita', guestName: 'X', validFrom: hoy, validTo: hoy, token: 'k1',
    }).returning()
    await db.insert(entryLogs).values({ invitationId: inv.id, unitId: u.id, guardId: g.id, guestName: 'X', plate: 'VENC1', vehicleInsurance: 'vencido' })
    const r = await request(app).get('/reports/kpis').set('Cookie', admin).expect(200)
    expect(r.body).toMatchObject({ segurosVencidos: 1, segurosPorVencer: 1, autorizadosSinSeguro: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/seguros.test.ts -t tablero`
Expected: FAIL (`segurosVencidos` undefined)

- [ ] **Step 3: Write minimal implementation**

`api/src/services/reports.ts`: en `Kpis`, sumar `segurosVencidos: number; segurosPorVencer: number; autorizadosSinSeguro: number`. En el select de `dashboardKpis`, después de `"invitedNeverLoggedIn"`:

```sql
      ,
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
```

(La coma inicial va pegada a la última columna que ya existía.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run tests/seguros.test.ts tests/reports.test.ts && npx tsc --noEmit`
Expected: PASS. Si `reports.test.ts` compara el objeto entero de KPIs con `toEqual`, sumarle los tres campos en 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/reports.ts api/tests/seguros.test.ts api/tests/reports.test.ts
git commit -m "feat: el tablero avisa seguros vencidos, por vencer y autorizados sin seguro"
```

---

### Task 3: La auditoría con el auto y la foto

**Files:**
- Modify: `api/src/services/entries.ts` (`AuditRow`, `AuditFilters`, `filtrosAuditoria`, `auditRows`, `auditCounts`), `api/src/services/reports.ts` (`EntryRow`, `entriesLog`), `api/src/routes/gate.ts` (zod de filtros y Excel)
- Test: `api/tests/seguros.test.ts`

**Interfaces:**
- Produces:
  - `AuditRow` suma `vehicleCompany`, `vehiclePolicy`, `vehicleExpiresOn` (`string | null`, el seguro **actual** del auto por la patente de la invitación) y `autorizadoSinSeguro: boolean`.
  - `AuditFilters.sinSeguro?: boolean`; en la query, `?sinSeguro=true`.
  - `EntryRow` suma `providerInsurance`, `vehicleInsurance` (`ClaveSeguro | null`) y `autorizadoSinSeguro: boolean`.
  - Excel "Invitaciones": columnas `Seguro auto`, `Vence seguro auto`, `Autorizó sin seguro`. Excel "Ingresos": `Seguro proveedor (al ingresar)`, `Seguro auto (al ingresar)`, `Autorizó sin seguro`.

- [ ] **Step 1: Write the failing test**

```ts
describe('seguros: auditoría', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('trae el seguro del auto, la foto de cada ingreso y filtra los autorizados sin seguro', async () => {
    const { u, g, v, auto, guardia } = await escenario()
    await auto('AE482KL', '2026-10-10')
    const [alta] = await db.insert(invitations).values({
      unitId: u.id, createdBy: g.id, kind: 'visita', guestName: 'Hugo', plate: 'AE 482 KL', validFrom: hoy, validTo: hoy, token: 'a1',
    }).returning()
    const [comun] = await db.insert(invitations).values({
      unitId: u.id, createdBy: v.id, kind: 'visita', guestName: 'Ana', validFrom: hoy, validTo: hoy, token: 'a2',
    }).returning()
    await db.insert(entryLogs).values([
      { invitationId: alta.id, unitId: u.id, guardId: g.id, guestName: 'Hugo', plate: 'AE 482 KL', providerInsurance: 'no_aplica', vehicleInsurance: 'vencido' },
      { invitationId: comun.id, unitId: u.id, guardId: g.id, guestName: 'Ana', providerInsurance: 'no_aplica', vehicleInsurance: 'no_aplica' },
    ])
    const r = await request(app).get('/gate/audit').set('Cookie', guardia).expect(200)
    const hugo = r.body.rows.find((x: { guestName: string }) => x.guestName === 'Hugo')
    expect(hugo).toMatchObject({ vehicleCompany: 'La Caja', vehicleExpiresOn: '2026-10-10', autorizadoSinSeguro: true })
    const f = await request(app).get('/gate/audit?sinSeguro=true').set('Cookie', guardia).expect(200)
    expect(f.body.rows.map((x: { guestName: string }) => x.guestName)).toEqual(['Hugo'])
    const m = await request(app).get(`/gate/audit/${alta.id}/entries`).set('Cookie', guardia).expect(200)
    expect(m.body[0]).toMatchObject({ vehicleInsurance: 'vencido', autorizadoSinSeguro: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/seguros.test.ts -t auditoría`
Expected: FAIL (`vehicleCompany` undefined)

- [ ] **Step 3: Write minimal implementation**

`api/src/services/entries.ts`:
- `AuditRow`: después de `insuranceExpiresOn`:

```ts
  /** El seguro del auto HOY, por la patente de la invitación. El de cada ingreso está en sus movimientos. */
  vehicleCompany: string | null
  vehiclePolicy: string | null
  vehicleExpiresOn: string | null
  /** Algún ingreso fue un alta exprés con un seguro faltante: "Autorizar igual". */
  autorizadoSinSeguro: boolean
```

- `AuditFilters`: `sinSeguro?: boolean`.
- En `filtrosAuditoria`, al final del `sql` (antes del backtick de cierre):

```sql
    and (not ${f.sinSeguro ?? false}::boolean or (p.role = 'guard' and exists (
      select 1 from entry_log es where es.invitation_id = i.id
        and (es.provider_insurance in ('sin_cargar','vencido') or es.vehicle_insurance in ('sin_cargar','vencido')))))
```

  (Los dos usos de `filtrosAuditoria`, filas y conteos, ya hacen `join person p on p.id = i.created_by`.)
- En `auditRows`, en el select después de las columnas del seguro del proveedor:

```sql
      ve.insurance_company        as "vehicleCompany",
      ve.insurance_policy         as "vehiclePolicy",
      ve.insurance_expires_on::text as "vehicleExpiresOn",
      (p.role = 'guard' and exists (select 1 from entry_log es where es.invitation_id = i.id
        and (es.provider_insurance in ('sin_cargar','vencido') or es.vehicle_insurance in ('sin_cargar','vencido'))))
                                  as "autorizadoSinSeguro",
```

  y después del `left join provider pv …`:

```sql
    left join vehicle ve on ve.neighborhood_id = u.neighborhood_id
      and ve.plate = upper(regexp_replace(coalesce(i.plate, ''), '[^0-9A-Za-z]', '', 'g'))
```

`api/src/services/reports.ts`, `entriesLog`: `EntryRow` suma `providerInsurance: string | null; vehicleInsurance: string | null; autorizadoSinSeguro: boolean`. En el select:

```sql
           e.provider_insurance as "providerInsurance", e.vehicle_insurance as "vehicleInsurance",
           (pi.role = 'guard' and (e.provider_insurance in ('sin_cargar','vencido')
             or e.vehicle_insurance in ('sin_cargar','vencido'))) as "autorizadoSinSeguro",
```

con `join person pi on pi.id = i.created_by` después del `join invitation i`.

`api/src/routes/gate.ts`:
- `auditFilters` suma `sinSeguro: z.enum(['true', 'false']).optional().transform((v) => v === 'true')`.
- En la hoja **Invitaciones** del Excel, después de `Estado seguro`:

```ts
          { header: 'Seguro auto', key: 'seguroAuto', width: 24 },
          { header: 'Vence seguro auto', key: 'venceAuto', formato: 'fecha' },
```

  y antes de `Autorizó portería`: `{ header: 'Autorizó sin seguro', key: 'sinSeguro', width: 18 },`. En las filas:

```ts
          seguroAuto: r.vehicleCompany ? `${r.vehicleCompany} · ${r.vehiclePolicy}` : '',
          venceAuto: r.vehicleExpiresOn ? diaExcel(r.vehicleExpiresOn) : '',
          sinSeguro: r.autorizadoSinSeguro ? 'Sí' : '',
```

- En la hoja **Ingresos**, después de `Patente`:

```ts
          { header: 'Seguro proveedor (al ingresar)', key: 'fotoProv', width: 18 },
          { header: 'Seguro auto (al ingresar)', key: 'fotoAuto', width: 18 },
          { header: 'Autorizó sin seguro', key: 'sinSeguro', width: 20 },
```

  y en las filas (con `etiquetaClave` de `../lib/seguro.js`, plan 1 Task 2):

```ts
          fotoProv: etiquetaClave(e.providerInsurance),
          fotoAuto: etiquetaClave(e.vehicleInsurance),
          // Quién: el guardia del ingreso.
          sinSeguro: e.autorizadoSinSeguro ? (e.guardName ?? 'Sí') : '',
```

- En la portada, bloque **Filtros aplicados**: `['Autorizados sin seguro', f.sinSeguro ? 'Solo esos' : 'Todos']`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npm test && npx tsc --noEmit`
Expected: PASS completo

- [ ] **Step 5: Commit**

```bash
git add api/src api/tests
git commit -m "feat: la auditoría y su excel traen el seguro del auto y la foto de cada ingreso"
```

---

### Task 4: Web: lógica pura y queries de Seguros

**Files:**
- Create: `web/src/lib/seguros.ts`, `web/src/lib/seguros.check.ts`, `web/src/lib/queries/seguros.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces:
  - tipos `FilaVehiculo`, `FilaProveedor`, `EstadoListado` (como la API de la Task 1)
  - `textoEstadoListado(e: EstadoListado, expiresOn: string | null, hoy: string): string`, por ejemplo `'Vencido hace 14 días'`, `'Vence en 5 días'`, `'Vence hoy'`, `'Vigente'`, `'Sin cargar'`
  - `COLOR_ESTADO: Record<EstadoListado, string>` (clases de token: `bg-alto-tint text-alto`, `bg-espera-tint text-espera`, `bg-verde-tint text-verde`, `bg-surface-sunk text-ink-soft`)
  - `paramsSeguros(f: { estado: 'todos' | EstadoListado; q: string }): URLSearchParams`
  - `useSegurosAutos(f)`, `useSegurosProveedores(f)`

- [ ] **Step 1: Write the failing check**

`web/src/lib/seguros.check.ts`:

```ts
/** `node src/lib/seguros.check.ts`. */
import assert from 'node:assert/strict'
import { paramsSeguros, textoEstadoListado } from './seguros.ts'
const HOY = '2026-10-24'
assert.equal(textoEstadoListado('vencido', '2026-10-10', HOY), 'Vencido hace 14 días')
assert.equal(textoEstadoListado('vencido', '2026-10-23', HOY), 'Vencido ayer')
assert.equal(textoEstadoListado('por_vencer', '2026-10-29', HOY), 'Vence en 5 días')
assert.equal(textoEstadoListado('por_vencer', '2026-10-24', HOY), 'Vence hoy')
assert.equal(textoEstadoListado('vigente', '2027-03-12', HOY), 'Vigente')
assert.equal(textoEstadoListado('sin_cargar', null, HOY), 'Sin cargar')
assert.equal(paramsSeguros({ estado: 'todos', q: '' }).toString(), '')
assert.equal(paramsSeguros({ estado: 'vencido', q: ' AE ' }).toString(), 'estado=vencido&q=AE')
console.log('seguros: ok')
```

`web/package.json` → `check`: sumar ` && node src/lib/seguros.check.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && node src/lib/seguros.check.ts`
Expected: FAIL, módulo no encontrado

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/seguros.ts`:

```ts
export type EstadoListado = 'vencido' | 'por_vencer' | 'vigente' | 'sin_cargar'
type Ultimo = { at: string; unitLabel: string; sinSeguro: boolean }

export type FilaVehiculo = {
  id: string; plate: string; company: string; policy: string; expiresOn: string
  estado: Exclude<EstadoListado, 'sin_cargar'>
  updatedByName: string | null; updatedAt: string
  ultimoIngreso: (Ultimo & { guestName: string }) | null
}

export type FilaProveedor = {
  id: string; doc: string; name: string; tradeName: string | null
  company: string | null; policy: string | null; expiresOn: string | null
  estado: EstadoListado
  source: 'garita' | 'link' | null; updatedByName: string | null; updatedAt: string | null
  lotes: string[]
  ultimoIngreso: Ultimo | null
}

const dias = (iso: string, hoy: string) => {
  const utc = (f: string) => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(iso) - utc(hoy)) / 86_400_000)
}

export function textoEstadoListado(e: EstadoListado, expiresOn: string | null, hoy: string): string {
  if (e === 'sin_cargar' || !expiresOn) return 'Sin cargar'
  const n = dias(expiresOn, hoy)
  if (e === 'vencido') return n === -1 ? 'Vencido ayer' : `Vencido hace ${-n} días`
  if (e === 'por_vencer') return n === 0 ? 'Vence hoy' : n === 1 ? 'Vence mañana' : `Vence en ${n} días`
  return 'Vigente'
}

export const COLOR_ESTADO: Record<EstadoListado, string> = {
  vencido: 'bg-alto-tint text-alto',
  por_vencer: 'bg-espera-tint text-espera',
  vigente: 'bg-verde-tint text-verde',
  sin_cargar: 'bg-surface-sunk text-ink-soft',
}

export function paramsSeguros(f: { estado: 'todos' | EstadoListado; q: string }): URLSearchParams {
  const p = new URLSearchParams()
  if (f.estado !== 'todos') p.set('estado', f.estado)
  if (f.q.trim()) p.set('q', f.q.trim())
  return p
}
```

`web/src/lib/queries/seguros.ts`:

```ts
'use client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { paramsSeguros, type EstadoListado, type FilaProveedor, type FilaVehiculo } from '@/lib/seguros'

type Filtro = { estado: 'todos' | EstadoListado; q: string }

export function useSegurosAutos(f: Filtro) {
  return useQuery({
    // Cuelga de ['garita']: un ingreso o una corrección invalidan ese prefijo y la lista se pone al día.
    queryKey: ['garita', 'seguros', 'autos', f] as const,
    queryFn: ({ signal }) => api<{ rows: FilaVehiculo[]; counts: Record<'vencido' | 'por_vencer' | 'vigente', number> }>(
      `/insurance/vehicles?${paramsSeguros(f)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useSegurosProveedores(f: Filtro) {
  return useQuery({
    queryKey: ['garita', 'seguros', 'proveedores', f] as const,
    queryFn: ({ signal }) => api<{ rows: FilaProveedor[]; counts: Record<EstadoListado, number> }>(
      `/insurance/providers?${paramsSeguros(f)}`, { signal }),
    placeholderData: keepPreviousData,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm run check && npx tsc --noEmit`
Expected: `seguros: ok`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/seguros.ts web/src/lib/seguros.check.ts web/src/lib/queries/seguros.ts web/package.json
git commit -m "feat: lógica y queries de la pantalla de seguros"
```

---

### Task 5: La pantalla Seguros

**Files:**
- Create: `web/src/app/(garita)/seguros/page.tsx`
- Modify: `web/src/components/garita/chrome.tsx`, `web/src/components/admin/chrome.tsx`

**Interfaces:**
- Consumes: Task 4; `useCorregirSeguro` (plan 2, Task 2); `CamposSeguro`, `estadoSeguroCargado`; `Chips`, `EncabezadoPagina`, `Vacio`, `SkeletonFilas`, `ErrorConReintento`; `Sheet*`; `apiBase` (`@/lib/api`); `ChromeAdmin`/`ChromeGarita` (igual que `auditoria/page.tsx`).
- Produces: `/seguros` con:
  - pestañas (Chips) `Vehículos N · Proveedores N`
  - filtros (Chips) `Todos · Vencidos N · Por vencer N · Vigentes N` (más `· Sin cargar N` en Proveedores)
  - buscador ("Patente, compañía o póliza" / "Nombre, DNI, compañía o póliza")
  - "Exportar a Excel" (link a `${apiBase}/insurance/vehicles.xlsx?…`)
  - una tabla en `md+`; filas apiladas (`Fila`) en el celular
  - el guardia ve "Corregir" por fila (hoja con `CamposSeguro`); el admin no
  - la pestaña llega por la URL: `/seguros?tab=proveedores&estado=vencido` (lo usa el tablero)
  - nav: garita `Garita · Auditoría · Seguros`; admin `Tablero · Vecinos · Guardias · Barrio · Auditoría · Seguros`

- [ ] **Step 1: Escribir la página**

`web/src/app/(garita)/seguros/page.tsx`:

```tsx
'use client'
import { use, useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { useDemora } from '@/lib/use-demora'
import { hoyISO, fechaCompleta, fechaHora } from '@/lib/fechas'
import { COLOR_ESTADO, paramsSeguros, textoEstadoListado, type EstadoListado, type FilaProveedor, type FilaVehiculo } from '@/lib/seguros'
import { useSegurosAutos, useSegurosProveedores } from '@/lib/queries/seguros'
import { useCorregirSeguro, type Correccion } from '@/lib/queries/garita'
import { ChromeGarita } from '@/components/garita/chrome'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { CamposSeguro, estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Tab = 'autos' | 'proveedores'
type Estado = 'todos' | EstadoListado

function Tag({ e, vence }: { e: EstadoListado; vence: string | null }) {
  return <span className={cn('whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-bold', COLOR_ESTADO[e])}>{textoEstadoListado(e, vence, hoyISO())}</span>
}

export default function SegurosPage({ searchParams }: { searchParams: Promise<{ tab?: string; estado?: string }> }) {
  const sp = use(searchParams)
  const me = useMe()
  const [tab, setTab] = useState<Tab>(sp.tab === 'proveedores' ? 'proveedores' : 'autos')
  const [estado, setEstado] = useState<Estado>((['vencido', 'por_vencer', 'vigente', 'sin_cargar'] as const).find((e) => e === sp.estado) ?? 'todos')
  const [texto, setTexto] = useState('')
  const q = useDemora(texto)
  const filtro = { estado: tab === 'autos' && estado === 'sin_cargar' ? 'todos' as const : estado, q }
  const autos = useSegurosAutos(filtro)
  const provs = useSegurosProveedores(filtro)
  const consulta = tab === 'autos' ? autos : provs
  const corregir = useCorregirSeguro()
  const [editando, setEditando] = useState<{ titulo: string; base: Omit<Correccion, 'insurance'> } | null>(null)
  const [valor, setValor] = useState<ValorSeguro>({ company: '', policy: '', expiresOn: '' })

  if (!me) return <main className="p-6">Cargando…</main>
  const Chrome = me.role === 'admin' ? ChromeAdmin : ChromeGarita
  const esGuardia = me.role === 'guard'
  const counts = (consulta.data?.counts ?? {}) as Partial<Record<EstadoListado, number>>
  const total = (c: Partial<Record<EstadoListado, number>>) => Object.values(c).reduce((a, b) => a + (b ?? 0), 0)
  const opcionesEstado = [
    { valor: 'todos' as Estado, etiqueta: 'Todos', contador: total(counts) },
    { valor: 'vencido' as Estado, etiqueta: 'Vencidos', contador: counts.vencido ?? 0 },
    { valor: 'por_vencer' as Estado, etiqueta: 'Por vencer', contador: counts.por_vencer ?? 0 },
    { valor: 'vigente' as Estado, etiqueta: 'Vigentes', contador: counts.vigente ?? 0 },
    ...(tab === 'proveedores' ? [{ valor: 'sin_cargar' as Estado, etiqueta: 'Sin cargar', contador: counts.sin_cargar ?? 0 }] : []),
  ]

  function abrir(titulo: string, base: Omit<Correccion, 'insurance'>, actual: { company: string | null; policy: string | null; expiresOn: string | null }) {
    setValor({ company: actual.company ?? '', policy: actual.policy ?? '', expiresOn: actual.expiresOn ?? '' })
    setEditando({ titulo, base })
  }

  const filas = consulta.data?.rows ?? []
  return (
    <Chrome>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-6 xl:px-8">
        <EncabezadoPagina titulo="Seguros" acciones={
          <a href={`${apiBase}/insurance/${tab === 'autos' ? 'vehicles' : 'providers'}.xlsx?${paramsSeguros(filtro)}`}
            className={buttonVariants({ variant: 'outline' })}><Download aria-hidden />Exportar a Excel</a>} />

        <Chips etiqueta="Qué seguros" valor={tab} onCambio={(t) => { setTab(t); setEstado('todos') }}
          opciones={[
            { valor: 'autos', etiqueta: 'Vehículos', contador: autos.data ? total(autos.data.counts) : undefined },
            { valor: 'proveedores', etiqueta: 'Proveedores', contador: provs.data ? total(provs.data.counts) : undefined },
          ]} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input aria-label="Buscar seguros" className="md:max-w-md" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={tab === 'autos' ? 'Patente, compañía o póliza' : 'Nombre, DNI, compañía o póliza'} />
          <Chips etiqueta="Estado del seguro" valor={estado} onCambio={setEstado} desplaza opciones={opcionesEstado} />
        </div>

        {consulta.isPending ? <SkeletonFilas /> : consulta.isError ? (
          <ErrorConReintento onReintentar={() => consulta.refetch()} reintentando={consulta.isFetching} />
        ) : filas.length === 0 ? (
          <Vacio icono={ShieldCheck} titulo="No hay seguros para mostrar"
            detalle={tab === 'autos' ? 'Los autos aparecen cuando la garita les carga el seguro.' : 'Los proveedores aparecen al entrar o al cargar su seguro desde el link.'} />
        ) : tab === 'autos' ? (
          <TablaAutos filas={filas as FilaVehiculo[]} onCorregir={esGuardia ? (r) => abrir(r.plate, { tipo: 'auto', plate: r.plate }, r) : undefined} />
        ) : (
          <TablaProveedores filas={filas as FilaProveedor[]} onCorregir={esGuardia ? (r) => abrir(r.name, { tipo: 'proveedor', doc: r.doc, name: r.name }, r) : undefined} />
        )}
      </div>

      <Sheet open={editando !== null} onOpenChange={(v) => { if (!v) setEditando(null) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Seguro de {editando?.titulo}</SheetTitle>
            <SheetDescription>Con el certificado a la vista. Queda a tu nombre en la auditoría.</SheetDescription>
          </SheetHeader>
          <form className="flex flex-col gap-4 px-4 pb-8" onSubmit={(e) => {
            e.preventDefault()
            if (!editando || estadoSeguroCargado(valor) !== 'completo') return
            corregir.mutate({ ...editando.base, insurance: { company: valor.company.trim(), policy: valor.policy.trim(), expiresOn: valor.expiresOn } } as Correccion,
              { onSuccess: () => setEditando(null) })
          }}>
            <CamposSeguro idBase="seguro-lista" valor={valor} onCambio={setValor} />
            <Button type="submit" disabled={corregir.isPending || estadoSeguroCargado(valor) !== 'completo'}>Guardar</Button>
          </form>
        </SheetContent>
      </Sheet>
    </Chrome>
  )
}

const TH = 'px-3 py-2 text-left text-xs font-semibold text-ink-soft'
const TD = 'px-3 py-2.5 align-top text-sm'

function Ultimo({ u }: { u: FilaVehiculo['ultimoIngreso'] | FilaProveedor['ultimoIngreso'] }) {
  if (!u) return <span className="text-ink-soft">—</span>
  return (
    <>
      <span className="tabular">{fechaHora(u.at)}</span>
      <span className="block text-xs text-ink-soft">
        {'guestName' in u ? `${u.guestName} · ` : ''}{u.unitLabel}
        {u.sinSeguro && <span className="font-semibold text-alto"> · autorizado sin seguro</span>}
      </span>
    </>
  )
}

function TablaAutos({ filas, onCorregir }: { filas: FilaVehiculo[]; onCorregir?: (r: FilaVehiculo) => void }) {
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-md border border-line bg-card md:table">
        <thead className="bg-surface-sunk"><tr>
          <th className={TH}>Patente</th><th className={TH}>Seguro</th><th className={TH}>Vence</th><th className={TH}>Estado</th>
          <th className={TH}>Último ingreso</th><th className={TH}>Cargado por</th>{onCorregir && <th className={TH}><span className="sr-only">Acciones</span></th>}
        </tr></thead>
        <tbody>{filas.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className={cn(TD, 'font-bold tabular')}>{r.plate}</td>
            <td className={TD}>{r.company}<span className="block text-xs text-ink-soft tabular">Póliza {r.policy}</span></td>
            <td className={cn(TD, 'tabular')}>{fechaCompleta(r.expiresOn)}</td>
            <td className={TD}><Tag e={r.estado} vence={r.expiresOn} /></td>
            <td className={TD}><Ultimo u={r.ultimoIngreso} /></td>
            <td className={TD}>{r.updatedByName ?? '—'}<span className="block text-xs text-ink-soft tabular">{fechaHora(r.updatedAt)}</span></td>
            {onCorregir && <td className={TD}><Button size="sm" variant="ghost" onClick={() => onCorregir(r)}>Corregir</Button></td>}
          </tr>
        ))}</tbody>
      </table>
      <ul className="md:hidden">{filas.map((r) => (
        <li key={r.id}><Fila densa titulo={r.plate} meta={`${r.company} · vence ${fechaCompleta(r.expiresOn)}`}
          extremo={<Tag e={r.estado} vence={r.expiresOn} />} onClick={onCorregir ? () => onCorregir(r) : undefined} /></li>
      ))}</ul>
    </>
  )
}

function TablaProveedores({ filas, onCorregir }: { filas: FilaProveedor[]; onCorregir?: (r: FilaProveedor) => void }) {
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-md border border-line bg-card md:table">
        <thead className="bg-surface-sunk"><tr>
          <th className={TH}>Proveedor</th><th className={TH}>Rubro</th><th className={TH}>Seguro</th><th className={TH}>Vence</th>
          <th className={TH}>Estado</th><th className={TH}>Trabaja en</th><th className={TH}>Lo cargó</th>{onCorregir && <th className={TH}><span className="sr-only">Acciones</span></th>}
        </tr></thead>
        <tbody>{filas.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className={TD}><span className="font-bold">{r.name}</span><span className="block text-xs text-ink-soft tabular">DNI {r.doc}</span></td>
            <td className={TD}>{r.tradeName ?? '—'}</td>
            <td className={TD}>{r.company ?? '—'}{r.policy && <span className="block text-xs text-ink-soft tabular">Póliza {r.policy}</span>}</td>
            <td className={cn(TD, 'tabular')}>{r.expiresOn ? fechaCompleta(r.expiresOn) : '—'}</td>
            <td className={TD}><Tag e={r.estado} vence={r.expiresOn} /></td>
            <td className={TD}>{r.lotes.length ? r.lotes.join(', ') : '—'}</td>
            <td className={TD}>{r.source === 'link' ? 'Él, desde su link' : r.updatedByName ?? '—'}
              {r.updatedAt && <span className="block text-xs text-ink-soft tabular">{fechaHora(r.updatedAt)}</span>}</td>
            {onCorregir && <td className={TD}><Button size="sm" variant="ghost" onClick={() => onCorregir(r)}>Corregir</Button></td>}
          </tr>
        ))}</tbody>
      </table>
      <ul className="md:hidden">{filas.map((r) => (
        <li key={r.id}><Fila densa titulo={r.name} meta={[r.tradeName, r.expiresOn && `vence ${fechaCompleta(r.expiresOn)}`].filter(Boolean).join(' · ')}
          extremo={<Tag e={r.estado} vence={r.expiresOn} />} onClick={onCorregir ? () => onCorregir(r) : undefined} /></li>
      ))}</ul>
    </>
  )
}
```

Nav: en `web/src/components/garita/chrome.tsx`, `items` suma `{ href: '/seguros', etiqueta: 'Seguros', icono: ShieldCheck, activo: path.startsWith('/seguros') }`. En `web/src/components/admin/chrome.tsx`, en las dos listas (la de arriba y la de `items`), después de Auditoría: `{ href: '/seguros', etiqueta: 'Seguros' }` y `{ href: '/seguros', etiqueta: 'Seguros', icono: ShieldCheck, activo: path.startsWith('/seguros') }`.

- [ ] **Step 2: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sin errores

Con el demo cargado: como admin, `/seguros` → Vehículos (AE 482 KL vencido primero, AD 301 MN por vencer, AC 915 PR vigente) → filtro Vencidos → Exportar baja un .xlsx → Proveedores (Ramiro vencido, Osvaldo por vencer, Gustavo sin cargar). Sin "Corregir". Como guardia (`julio`/`pass123`): "Corregir" en AD 301 MN → nuevo vencimiento → pasa a Vigente. Captura a 1440×900 y a 390×844, comparar con `seguros-admin.html`.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(garita)/seguros/page.tsx" web/src/components/garita/chrome.tsx web/src/components/admin/chrome.tsx
git commit -m "feat: pantalla de seguros de autos y proveedores"
```

---

### Task 6: Tablero y auditoría en la web

**Files:**
- Modify: `web/src/app/(admin)/admin/page.tsx`, `web/src/lib/queries/admin.ts` (tipo `Kpis`), `web/src/lib/queries/auditoria.ts`, `web/src/components/auditoria/tabla.tsx`, `web/src/components/auditoria/detalle.tsx`, `web/src/components/auditoria/movimientos.tsx`, `web/src/app/(garita)/auditoria/page.tsx`

**Interfaces:**
- Consumes: Tasks 2 y 3.
- Produces:
  - Tablero → Atención: `Seguros vencidos` (link `/seguros?estado=vencido`), `Vencen en los próximos días` (link `/seguros?estado=por_vencer`), `Autorizados sin seguro · 7 días` (link `/auditoria?sinSeguro=1`).
  - Auditoría: en la línea secundaria de la fila, `auto sin seguro` en `text-alto` si `autorizadoSinSeguro`; en el panel, el bloque **Vehículo** (patente y seguro actual del auto); en cada movimiento, `Seguro al ingresar: Vencido · Auto: Sin cargar · autorizó igual Julio`; en Filtros, "Solo autorizados sin seguro".

- [ ] **Step 1: Tablero**

`web/src/lib/queries/admin.ts`, tipo de los KPIs: sumar `segurosVencidos: number; segurosPorVencer: number; autorizadosSinSeguro: number`.

`web/src/app/(admin)/admin/page.tsx`: `import Link from 'next/link'`. `hayAtencion` suma `|| k.segurosVencidos > 0 || k.segurosPorVencer > 0 || k.autorizadosSinSeguro > 0`. Dentro de la grilla de Atención:

```tsx
                  {k.segurosVencidos > 0 && (
                    <Link href="/seguros?estado=vencido" className="rounded-md focus-visible:outline-2 focus-visible:outline-focus">
                      <Kpi tono="atencion" etiqueta="Seguros vencidos que siguen entrando" valor={k.segurosVencidos} />
                    </Link>
                  )}
                  {k.segurosPorVencer > 0 && (
                    <Link href="/seguros?estado=por_vencer" className="rounded-md focus-visible:outline-2 focus-visible:outline-focus">
                      <Kpi tono="atencion" etiqueta="Seguros por vencer" valor={k.segurosPorVencer} />
                    </Link>
                  )}
                  {k.autorizadosSinSeguro > 0 && (
                    <Link href="/auditoria?sinSeguro=1" className="rounded-md focus-visible:outline-2 focus-visible:outline-focus">
                      <Kpi tono="atencion" etiqueta="Autorizados sin seguro · 7 días" valor={k.autorizadosSinSeguro} />
                    </Link>
                  )}
```

La grilla pasa de `sm:grid-cols-3` a `sm:grid-cols-3 lg:grid-cols-3` (ya parte en filas solas con más de tres). Si con seis tarjetas queda desparejo, dejarlo así: cada una es algo para resolver.

- [ ] **Step 2: Auditoría**

`web/src/lib/queries/auditoria.ts`:
- `AuditRow` suma `vehicleCompany: string | null; vehiclePolicy: string | null; vehicleExpiresOn: string | null; autorizadoSinSeguro: boolean`.
- `Movimiento` suma `providerInsurance: string | null; vehicleInsurance: string | null; autorizadoSinSeguro: boolean`.
- `FiltrosAuditoria` suma `sinSeguro: boolean`, y `paramsDe` hace `if (f.sinSeguro) p.set('sinSeguro', 'true')`.

`web/src/app/(garita)/auditoria/page.tsx`:
- Recibe `searchParams: Promise<{ sinSeguro?: string }>` (con `use`), y estado `const [sinSeguro, setSinSeguro] = useState(sp.sinSeguro === '1')`.
- `filtros` suma `sinSeguro`. En `aplicados`: `if (sinSeguro) aplicados.push({ clave: 'sinSeguro', etiqueta: 'Autorizados sin seguro', quitar: () => cambiar(setSinSeguro)(false) })`. `limpiarPanel` hace también `setSinSeguro(false)`.
- En la `HojaFiltros`, una `SeccionFiltro` más ("Seguros") con un `Switch` "Solo autorizados sin seguro" ligado a `cambiar(setSinSeguro)`. Copiar la forma de las secciones que ya están ahí.

`web/src/components/auditoria/tabla.tsx`, `NombreFila`: después del `aviso` del proveedor, sumar:

```tsx
          {r.autorizadoSinSeguro && <span className="font-semibold text-alto">{(rubro || aviso) && ' · '}autorizado sin seguro</span>}
```

(y que el separador antes de `docs` también cuente `r.autorizadoSinSeguro`).

`web/src/components/auditoria/detalle.tsx`: después de `{esProveedor(fila) && <Proveedor …/>}`:

```tsx
              {fila.plate && (
                <Bloque titulo="Vehículo">
                  <dl>
                    <Dato etiqueta="Patente">{fila.plate}</Dato>
                    <Dato etiqueta="Seguro">{fila.vehicleCompany ? `${fila.vehicleCompany} · ${fila.vehiclePolicy}` : 'Sin cargar'}</Dato>
                    <Dato etiqueta="Vence">{fila.vehicleExpiresOn ? fechaCompleta(fila.vehicleExpiresOn) : '—'}</Dato>
                    <Dato etiqueta="Nota" className="text-ink-soft">El estado en cada ingreso está en Movimientos.</Dato>
                  </dl>
                </Bloque>
              )}
```

`web/src/components/auditoria/movimientos.tsx`: arriba, `const FOTO: Record<string, string> = { no_aplica: '', sin_cargar: 'Sin cargar', vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente' }`. Después del párrafo de nombre/DNI/patente:

```tsx
          {(FOTO[m.providerInsurance ?? ''] || FOTO[m.vehicleInsurance ?? ''] || m.autorizadoSinSeguro) && (
            <p className="text-ink-soft sm:col-span-2">
              {[FOTO[m.providerInsurance ?? ''] && `Seguro al ingresar: ${FOTO[m.providerInsurance!]}`,
                FOTO[m.vehicleInsurance ?? ''] && `Auto: ${FOTO[m.vehicleInsurance!]}`].filter(Boolean).join(' · ')}
              {m.autorizadoSinSeguro && <span className="font-semibold text-alto"> · autorizó igual {m.guardName ?? 'la guardia'}</span>}
            </p>
          )}
```

- [ ] **Step 3: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint && npm run check`
Expected: sin errores

Con el demo: tablero → las tarjetas de seguros llevan a Seguros y a Auditoría con el filtro puesto. Auditoría → Hugo Ríos: panel con Vehículo AE 482 KL vencido. Movimientos con "Auto: …" (los ingresos del demo anteriores al padrón no tienen foto y no muestran la línea).

- [ ] **Step 4: Commit**

```bash
git add web/src
git commit -m "feat: tablero y auditoría con los seguros de autos y la foto de cada ingreso"
```

---

### Task 7: E2E y cierre

**Files:**
- Create: `web/e2e/seguros.spec.ts`

- [ ] **Step 1: E2E**

```ts
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('el admin ve los seguros vencidos y exporta el excel', async ({ page }) => {
  const patente = `V${String(Date.now()).slice(-6)}`
  // Lo carga un guardia (el admin solo mira): con la sesión del guardia, por API.
  const g = await page.context().browser()!.newContext()
  const gp = await g.newPage()
  await entrar(gp, 'guardia')
  const r = await gp.request.put(`${API}/gate/vehicles/insurance`, {
    data: { plate: patente, insurance: { company: 'E2E Seguros', policy: 'P-1', expiresOn: '2020-01-01' } },
  })
  expect(r.ok()).toBe(true)
  await g.close()

  await entrar(page, 'admin')
  await page.goto('/seguros?estado=vencido')
  await expect(page.getByRole('cell', { name: patente })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corregir' })).toHaveCount(0)
  const descarga = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exportar a Excel' }).click()
  expect((await descarga).suggestedFilename()).toMatch(/seguros-autos\.xlsx$/)
})
```

Run: `cd web && npx playwright test e2e/seguros.spec.ts --workers=1`
Expected: passed. El auto de prueba queda en la base de desarrollo, que no se limpia sola, como el resto de los e2e. Su patente es única por corrida.

- [ ] **Step 2: Verificar todo**

Run: `cd api && npm test && npx tsc --noEmit` y `cd web && npm run check && npm run lint && npx tsc --noEmit && npm run e2e -- --workers=1`
Expected: todo en verde

- [ ] **Step 3: README y commit**

En `README.md`, después de **Seguro del proveedor**, un párrafo **Seguros**: "*Seguros* (garita y admin) lista los autos y los proveedores ordenados por vencimiento, con filtros y Excel. El guardia corrige desde ahí; el admin solo mira. El tablero avisa los vencidos que siguen entrando, los que vencen pronto y los ingresos autorizados sin seguro. La auditoría guarda cómo estaba cada seguro **el día del ingreso**: renovarlo después no cambia la historia."

```bash
git add web/e2e/seguros.spec.ts README.md
git commit -m "feat: e2e y readme de la pantalla de seguros"
```
