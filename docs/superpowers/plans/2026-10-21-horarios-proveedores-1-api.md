# Horarios de proveedores 1: API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rubros, franjas horarias y el rechazo `outside_hours` en la barrera, del lado de la API.
**Architecture:** tabla `trade` + `invitation.trade_id` + `neighborhood.provider_windows jsonb`. La lógica de franja es pura (`lib/franjas.ts`) y `canEnter` la recibe por parámetro.
**Tech Stack:** Express 5, Drizzle, PostgreSQL 16, zod, vitest.
**Spec:** `docs/superpowers/specs/2026-10-21-horarios-proveedores-design.md`. Sigue el plan 2 (web).

## Global Constraints

- Hora de Buenos Aires siempre (`lib/dates.ts`); nunca `new Date()` para calcular un día.
- `canEnter` sigue puro; `outside_hours` va **entre `wrong_weekday` y `no_capacity`**.
- Errores: `throw new AppError(status, 'codigo_en_snake')`.
- Sin franjas (`[]`) no hay restricción. Visitas y frecuentes de visita nunca se evalúan.
- Nombres y comentarios en español; esquema y rutas en inglés.
- Verificar: `cd api && npm test && npx tsc --noEmit`.

---

### Task 1: esquema y migración

**Files:** Modify `api/src/db/schema.ts`, `api/tests/helpers/db.ts` · Create `api/drizzle/0017_horarios_proveedores.sql` (generada)

- [ ] **Step 1:** en `schema.ts`, antes de `invitations`:

```ts
export type Franja = {
  days: number[]                               // 0 = domingo, como invitation.weekdays
  from: string; to: string                     // 'HH:MM'; `to` excluido, '24:00' vale
  season: { from: string; to: string } | null  // 'MM-DD'; puede cruzar el año
  trades: string[] | null                      // ids de trade; null = todos los rubros
}

export const trades = pgTable('trade', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  name: text('name').notNull(),
  // Se archiva, no se borra: las invitaciones y las franjas lo siguen usando.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [uniqueIndex('trade_name_uq').on(t.neighborhoodId, sql`lower(${t.name})`)])
```

En `neighborhoods`: `providerWindows: jsonb('provider_windows').$type<Franja[]>().notNull().default([]),` con el comentario "Franjas de ingreso de proveedores. [] = sin restricción". Como `trades` referencia a `neighborhoods`, poné `Franja` y `trades` **después** de `neighborhoods` y antes de `invitations`.

En `invitations`: `tradeId: uuid('trade_id').references(() => trades.id),` y el check:

```ts
check('invitation_trade_ck', sql`${t.tradeId} is null or ${t.kind} = 'proveedor'
  or (${t.kind} = 'frecuente' and ${t.frequentAs} = 'proveedor')`),
```

- [ ] **Step 2:** `cd api && npx drizzle-kit generate --name horarios_proveedores`. Revisá que el SQL tenga: `create table trade`, el índice con `lower(name)`, `provider_windows ... default '[]'::jsonb not null`, `trade_id` con FK y el check.
- [ ] **Step 3:** en `tests/helpers/db.ts` sumá `trade` al `truncate` (entre `invitation` y `unit_member`).
- [ ] **Step 4:** `npm test`: todo verde (la migración corre sola sobre `invitaciones_test`).
- [ ] **Step 5:** commit `feat: tablas de rubros y franjas de proveedores`.

### Task 2: lógica pura de franjas

**Files:** Create `api/src/lib/franjas.ts`, `api/tests/franjas.test.ts`
**Produces:** `horaEnBuenosAires(now): string` ('HH:MM'), `temporadaRige(season, mmdd): boolean`, `dentroDeFranja(franjas, tradeId, now): boolean`, `aplicaFranjas(kind, frequentAs): boolean`.

- [ ] **Step 1: test que falla** (`tests/franjas.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { dentroDeFranja, temporadaRige, aplicaFranjas, type Franja } from '../src/lib/franjas.js'

const PILETA = 'p', PLOMERO = 'x'
const alamo: Franja[] = [
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: { from: '04-01', to: '10-31' }, trades: null },
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00', season: { from: '11-01', to: '03-31' }, trades: null },
  { days: [6], from: '08:00', to: '13:00', season: null, trades: [PILETA] },
]
// Hora de Buenos Aires = UTC-3. 2026-10-20 es martes; 2026-10-24, sábado.
const ba = (iso: string) => new Date(`${iso}-03:00`)

describe('franjas', () => {
  it('sin franjas, todo pasa', () => expect(dentroDeFranja([], PLOMERO, ba('2026-10-25T03:00'))).toBe(true))
  it('martes 16:59 entra, 17:00 no', () => {
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-20T16:59'))).toBe(true)
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-20T17:00'))).toBe(false)
  })
  it('en verano rige 8 a 18', () => expect(dentroDeFranja(alamo, PLOMERO, ba('2026-11-03T17:30'))).toBe(true))
  it('el sábado solo piletero', () => {
    expect(dentroDeFranja(alamo, PILETA, ba('2026-10-24T10:00'))).toBe(true)
    expect(dentroDeFranja(alamo, PLOMERO, ba('2026-10-24T10:00'))).toBe(false)
  })
  it('sin rubro, solo las franjas de todos', () => {
    expect(dentroDeFranja(alamo, null, ba('2026-10-20T10:00'))).toBe(true)
    expect(dentroDeFranja(alamo, null, ba('2026-10-24T10:00'))).toBe(false)
  })
  it('24:00 incluye las 23:59', () =>
    expect(dentroDeFranja([{ days: [0], from: '00:00', to: '24:00', season: null, trades: null }], null, ba('2026-10-25T23:59'))).toBe(true))
  it('temporada que cruza el año', () => {
    const verano = { from: '11-01', to: '03-31' }
    expect(temporadaRige(verano, '01-15')).toBe(true)
    expect(temporadaRige(verano, '03-31')).toBe(true)
    expect(temporadaRige(verano, '04-01')).toBe(false)
    expect(temporadaRige({ from: '04-01', to: '10-31' }, '10-31')).toBe(true)
  })
  it('aplica a proveedores y frecuentes que vienen a trabajar', () => {
    expect(aplicaFranjas('proveedor', null)).toBe(true)
    expect(aplicaFranjas('frecuente', 'proveedor')).toBe(true)
    expect(aplicaFranjas('frecuente', 'visita')).toBe(false)
    expect(aplicaFranjas('frecuente', null)).toBe(false)
    expect(aplicaFranjas('visita', null)).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run tests/franjas.test.ts`. Tiene que fallar porque el módulo no existe.
- [ ] **Step 3: implementación** (`src/lib/franjas.ts`):

```ts
import { TZ, todayInBuenosAires, weekdayInBuenosAires } from './dates.js'
import type { Franja } from '../db/schema.js'
export type { Franja }

/** 'HH:MM' en Buenos Aires. h23: medianoche es '00', no '24'. */
export function horaEnBuenosAires(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

/** 'MM-DD' comparado como string; si from > to, la temporada cruza el año. */
export function temporadaRige(season: Franja['season'], mmdd: string): boolean {
  if (!season) return true
  return season.from <= season.to
    ? mmdd >= season.from && mmdd <= season.to
    : mmdd >= season.from || mmdd <= season.to
}

/** Una frecuente sin subtipo cuenta como visita, igual que en la alerta de permanencia. */
export function aplicaFranjas(kind: string, frequentAs: string | null): boolean {
  return kind === 'proveedor' || (kind === 'frecuente' && frequentAs === 'proveedor')
}

/** ¿Alguna franja deja pasar a este rubro ahora? Sin franjas, no hay restricción. */
export function dentroDeFranja(franjas: Franja[], tradeId: string | null, now: Date): boolean {
  if (!franjas.length) return true
  const mmdd = todayInBuenosAires(now).slice(5)
  const dia = weekdayInBuenosAires(now)
  const hora = horaEnBuenosAires(now)
  return franjas.some((f) =>
    temporadaRige(f.season, mmdd)
    && f.days.includes(dia)
    && hora >= f.from && hora < f.to
    && (f.trades === null || (tradeId !== null && f.trades.includes(tradeId))))
}
```

- [ ] **Step 4:** corré el test: verde.
- [ ] **Step 5:** commit `feat: lógica pura de franjas horarias`.

### Task 3: `canEnter` con `outside_hours`

**Files:** Modify `api/src/authz.ts`, `api/tests/authz.test.ts`
**Consumes:** `dentroDeFranja`, `aplicaFranjas` (Task 2).
**Produces:** `canEnter(inv, now, usedCount, franjas: Franja[] = [])`. `InvitationLike` suma `kind: string; frequentAs: string | null; tradeId: string | null`. `EntryReason` suma `'outside_hours'`.

- [ ] **Step 1:** en `tests/authz.test.ts`, completá `base` con `kind: 'visita', frequentAs: null, tradeId: null` y sumá estos tests:

```ts
const solo8a12: Franja[] = [{ days: [1], from: '08:00', to: '12:00', season: null, trades: null }]
const prov = { ...base, kind: 'proveedor' }

it('rechaza a un proveedor fuera de franja (lunes 15 h)', () =>
  expect(canEnter(prov, lunes15h, 0, solo8a12)).toEqual({ ok: false, reason: 'outside_hours' }))
it('una visita no mira las franjas', () =>
  expect(canEnter(base, lunes15h, 0, solo8a12)).toEqual({ ok: true }))
it('el día gana sobre el horario', () =>
  expect(canEnter({ ...prov, validTo: '2026-12-31', weekdays: [2] }, lunes15h, 0, solo8a12))
    .toEqual({ ok: false, reason: 'wrong_weekday' }))
it('el horario gana sobre el cupo', () =>
  expect(canEnter(prov, lunes15h, 1, solo8a12)).toEqual({ ok: false, reason: 'outside_hours' }))
```

(Importá `type Franja` desde `../src/lib/franjas.js`.)

- [ ] **Step 2:** corré los tests: fallan.
- [ ] **Step 3:** en `authz.ts`, después del chequeo de `wrong_weekday`:

```ts
  if (aplicaFranjas(inv.kind, inv.frequentAs) && !dentroDeFranja(franjas, inv.tradeId, now)) {
    return { ok: false, reason: 'outside_hours' }
  }
```

Actualizá el comentario de orden: "…después el día, después el horario del proveedor, y recién al final el cupo".

- [ ] **Step 4:** verde. `npx tsc --noEmit` va a marcar los llamados en `entries.ts`; se arreglan en la Task 5.
- [ ] **Step 5:** commit `feat: canEnter rechaza proveedores fuera de horario`.

### Task 4: rubros y franjas en el admin

**Files:** Create `api/src/services/trades.ts`, `api/tests/horarios-proveedores.test.ts` · Modify `api/src/routes/admin.ts`, `api/src/services/neighborhoods.ts`, `api/src/routes/invitations.ts`
**Produces:** `listTrades(nid, { incluirArchivados })`, `createTrade(nid, actorId, name)`, `updateTrade(nid, actorId, id, { name?, archived? })`. `getNeighborhood` suma `providerWindows`. `GET /invitations/trades` → `{ trades: {id,name}[], providerWindows: Franja[] }`.

- [ ] **Step 1: tests** (copiá el `escenario` de `tests/permanencia.test.ts` con un admin y un vecino):
  - `POST /admin/trades {name:'Plomero'}` da 201; el mismo nombre en minúscula da `400 rubro_duplicado`.
  - `PATCH /admin/trades/:id {archived:true}`: `GET /invitations/trades` ya no lo lista y `GET /admin/trades` sí, con `archivedAt`.
  - `PATCH /admin/neighborhood {providerWindows:[…alamo]}` guarda la lista y `GET` la devuelve.
  - Da `400 franja_invalida` con `days: []`, con `from: '17:00', to: '08:00'`, con `from: '8:00'` y con un `trades` que tiene un id que no es del barrio.
- [ ] **Step 2:** los tests fallan.
- [ ] **Step 3: implementación.**
  - `services/trades.ts`: el insert captura el error de unicidad (`code === '23505'`) y lo convierte en `AppError(400,'rubro_duplicado')`; `archived` pone `archivedAt` en `now()` o en `null`; las tres funciones hacen `audit()` igual que `updateNeighborhood`.
  - Rutas en `admin.ts`: `GET /trades`, `POST /trades` (`name: z.string().trim().min(1).max(40)`) y `PATCH /trades/:id`.
  - En el PATCH de `/neighborhood`, este esquema de franjas:

```ts
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/)
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
const franja = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  from: hhmm, to: hhmm,
  season: z.object({ from: mmdd, to: mmdd }).nullable(),
  trades: z.array(z.string().uuid()).min(1).nullable(),
}).refine((f) => f.from < f.to)
// providerWindows: z.array(franja).max(30).optional()
```

  Si el parse falla, el error tiene que ser `franja_invalida`: hacé `safeParse` sobre `providerWindows` antes del resto y en ese caso `throw new AppError(400, 'franja_invalida')`. En `updateNeighborhood`, verificá que todos los ids de `trades` sean del barrio (si alguno no lo es, `franja_invalida`) y guardá con `providerWindows: data.providerWindows`.
  - `GET /invitations/trades` (con sesión, en `routes/invitations.ts` **antes** de `validarUuid` si este choca con `/:id`): rubros activos más las franjas del barrio de `req.person`.
- [ ] **Step 4:** verde.
- [ ] **Step 5:** commit `feat: el admin carga rubros y franjas de proveedores`.

### Task 5: rubro en la invitación y franjas en la barrera

**Files:** Modify `api/src/services/invitations.ts`, `api/src/routes/invitations.ts`, `api/src/services/entries.ts`, `api/tests/horarios-proveedores.test.ts`
**Consumes:** `canEnter(…, franjas)` (Task 3), `trades` (Task 1).

- [ ] **Step 1: tests** (en el mismo archivo):
  - Con rubros cargados, `POST /invitations` de un proveedor sin `tradeId` da `400 rubro_requerido`; sin rubros, da 201.
  - `tradeId` en una visita, en una frecuente de visita o en un rubro archivado da `400 rubro_invalido`.
  - Una frecuente `frequentAs:'proveedor'` con `tradeId` da 201.
  - Barrio con la franja `{days:[0..6], from:'00:00', to:'00:01'}`: `GET /gate/check/:token` de un proveedor da `check: {ok:false, reason:'outside_hours'}` e `invitation.tradeName`, y `POST` de ingreso da `409 outside_hours`.
  - Con `[]`, el mismo proveedor pasa.
  - Una visita con esa misma franja pasa.
- [ ] **Step 2:** los tests fallan.
- [ ] **Step 3: implementación.**
  - `createInvitation` y `editInvitation` reciben `tradeId?: string | null` y el `neighborhoodId` del actor (pasalo desde la ruta con `req.person!.neighborhoodId`).
  - Agregá este helper:

```ts
async function assertRubro(neighborhoodId: string, kind: string, frequentAs: string | null, tradeId: string | null | undefined) {
  if (!aplicaFranjas(kind, frequentAs)) {
    if (tradeId) throw new AppError(400, 'rubro_invalido')
    return
  }
  if (tradeId) {
    const [t] = await db.select().from(trades).where(and(eq(trades.id, tradeId),
      eq(trades.neighborhoodId, neighborhoodId), isNull(trades.archivedAt))).limit(1)
    if (!t) throw new AppError(400, 'rubro_invalido')
    return
  }
  const [hay] = await db.select({ id: trades.id }).from(trades)
    .where(and(eq(trades.neighborhoodId, neighborhoodId), isNull(trades.archivedAt))).limit(1)
  if (hay) throw new AppError(400, 'rubro_requerido')
}
```

    Al crear, se llama con el `frequentAs` ya resuelto. Al editar, solo si viene `tradeId` o `frequentAs`, y si `frequentAs` pasa a `visita` también se limpia `tradeId`.
  - Ambos zod suman `tradeId: z.string().uuid().nullable().optional()`.
  - `columnas` suma `tradeId` y `tradeName` (con `leftJoin(trades, …)` en `consultaInvitaciones` y en el `group by` si hace falta).
  - `entries.ts`:
    - `loadForCheck` suma `kind`, `frequentAs`, `tradeId`, `tradeName: trades.name` (leftJoin) y `providerWindows: neighborhoods.providerWindows` (innerJoin por `units.neighborhoodId`);
    - `buildCheck` pasa `invitation.providerWindows` a `canEnter` y suma `franjas: invitation.providerWindows.filter((f) => f.trades === null || (invitation.tradeId !== null && f.trades.includes(invitation.tradeId)))` a la respuesta, sin devolver `providerWindows` entero;
    - `registerEntry`, después del `FOR UPDATE`, lee `providerWindows` del barrio de `target.unitId` y se las pasa a `canEnter`. El `FOR UPDATE` queda igual.
  - `searchGuests`, `agendaForDay`, `insideNow` y la página pública (`findPublicByToken`, que suma también `franjas`, filtradas igual) suman `tradeName`.
  - `auditInvitations` y su Excel (en `routes/reports.ts` o `routes/gate.ts`, buscá `buildWorkbook`) suman la columna `Rubro`.
- [ ] **Step 4:** `npm test && npx tsc --noEmit`: verde.
- [ ] **Step 5:** commit `feat: rubro en la invitación y horario en la barrera`.

### Task 6: datos de demo

**Files:** Modify `api/scripts/demo.sql`

- [ ] **Step 1:** después de borrar los datos, insertá los once rubros del mail (Jardinero, Piletero, Electricista, Plomero, Carpintero, Albañil, Corralón, Gasista, Techista, Agua, Flete) y hacé un `update neighborhood set provider_windows = …` con las tres franjas de Alamo Alto. Las dos de semana van con `trades: null`; la del sábado, con los ids de Piletero y Agua, sacados con un `jsonb_build_array((select id from trade where name='Piletero'), …)`.
- [ ] **Step 2:** asigná rubro a los proveedores que ya crea el script y sumá una frecuente `frequent_as='proveedor'` de Jardinero con `weekdays '{1,3,6}'` (el sábado choca con su horario).
- [ ] **Step 3:** corré el script contra la base de desarrollo con el stack levantado: `docker compose exec -T db psql -U invitaciones invitaciones -v ON_ERROR_STOP=1 < api/scripts/demo.sql`. Tiene que terminar sin errores.
- [ ] **Step 4:** commit `feat: rubros y horarios en los datos de demo`.
