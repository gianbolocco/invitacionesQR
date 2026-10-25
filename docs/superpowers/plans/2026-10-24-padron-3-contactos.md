# Contactos del vecino — fase 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El vecino guarda contactos (visitas y proveedores) en la agenda de su casa e invita a uno en dos toques: "Nueva invitación" → elegir el contacto → fecha → crear.

**Architecture:** Tabla `contact` por UF, sin vínculo al padrón: el estado del seguro de un proveedor se cruza al leer, por el DNI normalizado contra `provider`. La API sigue el patrón de `invitations` (servicio + rutas con zod y `assertMemberOfUnit`). En la web hay una hoja "¿A quién invitás?" que abre "Nueva invitación", una pestaña nueva "Contactos" y el tilde "Guardar en contactos" en el formulario.

**Tech Stack:** Express 5 + zod + Drizzle (API); Next.js 16 + TanStack Query 5 + componentes `ui/` (Sheet, Dialog) y `dominio/` (Fila, Chips, Campo) en la web.

**Spec:** `docs/superpowers/specs/2026-10-24-padron-seguros-contactos-design.md` (Pantallas → Vecino)
**Mockup:** `.superpowers/brainstorm/8-1792885331/content/vecino-contactos.html` (A + B)
**Depende de:** plan 1 (tabla `provider`, `docSql`, `claveSeguro`). Se puede desplegar antes o después de la fase 4.

## Global Constraints

- Código, nombres y comentarios en español (salvo el esquema de la base y las rutas). Textos de la UI en voseo.
- Un despliegue es un barrio: no filtrar por barrio más allá de la UF del vecino.
- Errores: `throw new AppError(status, 'codigo_en_snake')`. El front los traduce en la mutación.
- Colores: solo tokens de `globals.css`. Vecino mobile-first: probar a 390×844.
- Tests de API: `beforeEach(async () => { await resetDb(); resetRateLimits() })`.
- Lógica pura de la web en `web/src/lib/*.ts` con `*.check.ts`.
- Verificar: `cd api && npm test && npx tsc --noEmit`; `cd web && npm run check && npm run lint && npx tsc --noEmit`; `cd web && npm run e2e -- --workers=1`.
- Commits: `feat:` + español en minúscula + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Archivos

| Archivo | Qué |
|---|---|
| `api/src/db/schema.ts` | tabla `contacts` |
| `api/drizzle/0022_contactos.sql` (generada) | la tabla |
| `api/src/services/contacts.ts` (nuevo) | listar, crear, editar, borrar |
| `api/src/routes/contacts.ts` (nuevo) | `/contacts` |
| `api/src/app.ts` | montar `/contacts` |
| `api/tests/helpers/db.ts` | truncar `contact` |
| `api/tests/contactos.test.ts` (nuevo) | |
| `web/src/lib/contactos.ts` + `contactos.check.ts` (nuevos) | filtrar, agrupar, texto del seguro |
| `web/src/lib/queries/contactos.ts` (nuevo) | queries y mutaciones |
| `web/src/components/vecino/elegir-contacto.tsx` (nuevo) | hoja "¿A quién invitás?" |
| `web/src/components/vecino/formulario-contacto.tsx` (nuevo) | alta y edición |
| `web/src/app/(vecino)/contactos/page.tsx` (nuevo) | la pestaña |
| `web/src/components/vecino/chrome.tsx` | pestaña Contactos |
| `web/src/app/(vecino)/page.tsx` | "Nueva invitación" abre la hoja |
| `web/src/app/(vecino)/invitaciones/nueva/page.tsx` | `?contacto=` |
| `web/src/components/vecino/formulario-invitacion.tsx` | tarjeta del contacto y "Guardar en contactos" |
| `web/e2e/contactos.spec.ts` (nuevo) | |
| `api/scripts/demo.sql`, `web/package.json` | demo y check |

---

### Task 1: Tabla `contact`

**Files:**
- Modify: `api/src/db/schema.ts`, `api/tests/helpers/db.ts`
- Create (generada): `api/drizzle/0022_contactos.sql`
- Test: `api/tests/contactos.test.ts`

**Interfaces:**
- Produces: `contacts` (tabla `contact`): `id, unitId, kind ('visita'|'proveedor'), name, doc (null), tradeId (null), createdBy, createdAt`.

- [ ] **Step 1: Write the failing test**

`api/tests/contactos.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { contacts, neighborhoods, people, providers, units, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
  const crear = async (email: string, role: 'admin' | 'resident') => (await db.insert(people).values({
    neighborhoodId: n.id, email, name: email.split('@')[0], role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning())[0]
  const admin = await crear('admin@example.com', 'admin')
  const ana = await crear('ana@example.com', 'resident')
  const beto = await crear('beto@example.com', 'resident')
  const carla = await crear('carla@example.com', 'resident')
  const [l1] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()
  const [l2] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 2' }).returning()
  // Ana y Beto viven juntos en el Lote 1; Carla en el 2.
  await db.insert(unitMembers).values([{ unitId: l1.id, personId: ana.id }, { unitId: l1.id, personId: beto.id }, { unitId: l2.id, personId: carla.id }])
  const entrar = async (email: string) =>
    (await request(app).post('/auth/login').send({ email, password: PASS })).headers['set-cookie'] as unknown as string[]
  return { n, l1, l2, ana, admin: await entrar('admin@example.com'), sAna: await entrar('ana@example.com'), sBeto: await entrar('beto@example.com'), sCarla: await entrar('carla@example.com') }
}

describe('contactos: tabla', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('una visita no lleva rubro', async () => {
    const { l1, ana } = await escenario()
    const [n] = await db.select().from(neighborhoods)
    const [t] = await db.execute<{ id: string }>(
      `insert into trade (neighborhood_id, name) values ('${n.id}', 'Jardinero') returning id` as never).then((r) => r.rows)
    expect(await violatedConstraint(db.insert(contacts).values({
      unitId: l1.id, kind: 'visita', name: 'Rosa', tradeId: t.id, createdBy: ana.id,
    }))).toBe('contact_trade_ck')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/contactos.test.ts`
Expected: FAIL, "contacts is not exported"

- [ ] **Step 3: Write minimal implementation**

`api/src/db/schema.ts`, después de `vehicles`:

```ts
/*
 * La agenda de una casa: la ven y la editan todos los que viven en la UF,
 * igual que las invitaciones. No se vincula al padrón: el estado del seguro
 * de un proveedor se cruza al leer, por el DNI normalizado.
 */
export const contacts = pgTable('contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  // Como lo escribió el vecino ("28.443.120"): se compara normalizado.
  doc: text('doc'),
  tradeId: uuid('trade_id').references(() => trades.id),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('contact_unit_idx').on(t.unitId, t.name),
  check('contact_kind_ck', sql`${t.kind} in ('visita','proveedor')`),
  check('contact_name_ck', sql`char_length(${t.name}) between 1 and 80`),
  check('contact_doc_ck', sql`char_length(${t.doc}) <= 40`),
  check('contact_trade_ck', sql`${t.tradeId} is null or ${t.kind} = 'proveedor'`),
])
```

Run: `cd api && npx drizzle-kit generate --name contactos`
Expected: `drizzle/0022_contactos.sql` con `CREATE TABLE "contact"`, sin `DROP`.

`api/tests/helpers/db.ts`: sumar `contact` al principio de la lista del truncate.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run tests/contactos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/db/schema.ts api/drizzle api/tests/helpers/db.ts api/tests/contactos.test.ts
git commit -m "feat: tabla de contactos de la casa"
```

---

### Task 2: API de contactos

**Files:**
- Create: `api/src/services/contacts.ts`, `api/src/routes/contacts.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/contactos.test.ts`

**Interfaces:**
- Consumes: `docSql` (plan 1, Task 1), `claveSeguro`, `pideSeguro` (`api/src/lib/seguro.ts`), `unitsOfPerson` (`api/src/services/units.ts`), `assertMemberOfUnit` (`api/src/services/invitations.ts`).
- Produces:
  - `GET /contacts` → `Contacto[]`, ordenados por nombre:
    ```ts
    type Contacto = {
      id: string; unitId: string; kind: 'visita' | 'proveedor'; name: string; doc: string | null
      tradeId: string | null; tradeName: string | null
      insuranceState: 'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'
      insuranceExpiresOn: string | null
    }
    ```
  - `POST /contacts` `{ unitId?, kind, name, doc?, tradeId? }` → 201 `Contacto`. Sin `unitId`, la primera UF del vecino.
  - `PATCH /contacts/:id` `{ name?, doc?, tradeId? }` → `Contacto` (el tipo no cambia).
  - `DELETE /contacts/:id` → `{ ok: true }`.
  - Un contacto de otra UF da `404 contact_not_found`. Un rubro de otro barrio o archivado, `400 rubro_invalido`.

- [ ] **Step 1: Write the failing test**

Agregar a `api/tests/contactos.test.ts`:

```ts
describe('contactos: API', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el vecino guarda una visita y los de su casa la ven; los de otra casa no', async () => {
    const { sAna, sBeto, sCarla } = await escenario()
    const r = await request(app).post('/contacts').set('Cookie', sAna)
      .send({ kind: 'visita', name: ' Rosa Benítez ', doc: '28.443.120' }).expect(201)
    expect(r.body).toMatchObject({ kind: 'visita', name: 'Rosa Benítez', doc: '28.443.120', insuranceState: 'no_aplica' })
    expect((await request(app).get('/contacts').set('Cookie', sBeto).expect(200)).body).toHaveLength(1)
    expect((await request(app).get('/contacts').set('Cookie', sCarla).expect(200)).body).toHaveLength(0)
    await request(app).patch(`/contacts/${r.body.id}`).set('Cookie', sCarla).send({ name: 'X' }).expect(404)
    await request(app).delete(`/contacts/${r.body.id}`).set('Cookie', sCarla).expect(404)
  })

  it('un proveedor trae el estado de su seguro del padrón, por DNI escrito como sea', async () => {
    const { n, admin, sAna } = await escenario()
    const { body: t } = await request(app).post('/admin/trades').set('Cookie', admin).send({ name: 'Jardinero' }).expect(201)
    await request(app).patch(`/admin/trades/${t.id}`).set('Cookie', admin).send({ requiresInsurance: true }).expect(200)
    await db.insert(providers).values({
      neighborhoodId: n.id, doc: '30112445', name: 'Carlos', insuranceCompany: 'Sancor', insurancePolicy: '1',
      insuranceExpiresOn: '2999-03-12', insuranceSource: 'link',
    })
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Carlos', doc: '30.112.445', tradeId: t.id }).expect(201)
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Hugo', tradeId: t.id }).expect(201)
    const { body } = await request(app).get('/contacts').set('Cookie', sAna).expect(200)
    expect(body.map((c: { name: string; insuranceState: string }) => [c.name, c.insuranceState]))
      .toEqual([['Carlos', 'vigente'], ['Hugo', 'sin_cargar']])
    expect(body[0]).toMatchObject({ tradeName: 'Jardinero', insuranceExpiresOn: '2999-03-12' })
    expect(JSON.stringify(body)).not.toMatch(/Sancor/)
  })

  it('edita y borra', async () => {
    const { sAna } = await escenario()
    const { body: c } = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Rosa' }).expect(201)
    const r = await request(app).patch(`/contacts/${c.id}`).set('Cookie', sAna).send({ name: 'Rosa B.', doc: '1' }).expect(200)
    expect(r.body).toMatchObject({ name: 'Rosa B.', doc: '1' })
    await request(app).delete(`/contacts/${c.id}`).set('Cookie', sAna).expect(200)
    expect(await db.select().from(contacts)).toHaveLength(0)
  })

  it('valida: nombre vacío, rubro en una visita, rubro de otro barrio', async () => {
    const { sAna } = await escenario()
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: '  ' }).expect(400)
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [t] = await db.execute<{ id: string }>(
      `insert into trade (neighborhood_id, name) values ('${otro.id}', 'X') returning id` as never).then((r) => r.rows)
    const r = await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'proveedor', name: 'Y', tradeId: t.id }).expect(400)
    expect(r.body.error).toBe('rubro_invalido')
    await request(app).post('/contacts').set('Cookie', sAna).send({ kind: 'visita', name: 'Y', tradeId: t.id }).expect(400)
  })

  it('un unitId que no es del vecino da 403', async () => {
    const { l2, sAna } = await escenario()
    await request(app).post('/contacts').set('Cookie', sAna).send({ unitId: l2.id, kind: 'visita', name: 'Rosa' }).expect(403)
  })

  it('sin sesión, 401', async () => {
    await request(app).get('/contacts').expect(401)
  })
})
```

(`l2`, `n`, `ana` ya los devuelve `escenario()`; sacar de la desestructuración lo que no se use para que `tsc` no se queje.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run tests/contactos.test.ts`
Expected: FAIL con 404 en `/contacts`

- [ ] **Step 3: Write minimal implementation**

`api/src/services/contacts.ts`:

```ts
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { contacts, neighborhoods, providers, trades, units } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { docSql } from '../lib/padron.js'
import { claveSeguro, pideSeguro, type ClaveSeguro } from '../lib/seguro.js'
import { assertMemberOfUnit } from './invitations.js'

export type Contacto = {
  id: string
  unitId: string
  kind: 'visita' | 'proveedor'
  name: string
  doc: string | null
  tradeId: string | null
  tradeName: string | null
  insuranceState: ClaveSeguro
  insuranceExpiresOn: string | null
}

/**
 * Los contactos de las UF del vecino. El seguro se cruza con el padrón por el
 * DNI normalizado: el vecino ve el estado y el vencimiento, nunca compañía ni
 * póliza (son datos que cargó otro).
 */
export async function listContacts(unitIds: string[], soloId?: string): Promise<Contacto[]> {
  if (!unitIds.length) return []
  const filas = await db.select({
    c: contacts,
    tradeName: trades.name,
    requiresInsurance: trades.requiresInsurance,
    warnDays: neighborhoods.insuranceWarnDays,
    company: providers.insuranceCompany,
    policy: providers.insurancePolicy,
    expiresOn: providers.insuranceExpiresOn,
  }).from(contacts)
    .innerJoin(units, eq(units.id, contacts.unitId))
    .innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
    .leftJoin(trades, eq(trades.id, contacts.tradeId))
    .leftJoin(providers, and(eq(providers.neighborhoodId, units.neighborhoodId), eq(providers.doc, docSql(contacts.doc))))
    .where(and(inArray(contacts.unitId, unitIds), soloId ? eq(contacts.id, soloId) : undefined))
    .orderBy(asc(contacts.name))

  return filas.map(({ c, tradeName, requiresInsurance, warnDays, company, policy, expiresOn }) => {
    const s = company && policy && expiresOn ? { company, policy, expiresOn } : null
    return {
      id: c.id, unitId: c.unitId, kind: c.kind as Contacto['kind'], name: c.name, doc: c.doc,
      tradeId: c.tradeId, tradeName,
      insuranceState: claveSeguro(pideSeguro(c.kind, null, requiresInsurance), s, warnDays),
      insuranceExpiresOn: s?.expiresOn ?? null,
    }
  })
}

async function assertRubroDelBarrio(tradeId: string, unitId: string) {
  const [t] = await db.select({ id: trades.id }).from(trades)
    .innerJoin(units, eq(units.neighborhoodId, trades.neighborhoodId))
    .where(and(eq(trades.id, tradeId), eq(units.id, unitId), isNull(trades.archivedAt))).limit(1)
  if (!t) throw new AppError(400, 'rubro_invalido')
}

/** El contacto, si es de alguna UF del vecino. Si no, 404: no se cuenta que existe. */
async function propio(id: string, unitIds: string[]) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), inArray(contacts.unitId, unitIds.length ? unitIds : ['00000000-0000-0000-0000-000000000000']))).limit(1)
  if (!c) throw new AppError(404, 'contact_not_found')
  return c
}

export async function createContact(personId: string, unitIds: string[], data: {
  unitId?: string; kind: 'visita' | 'proveedor'; name: string; doc?: string | null; tradeId?: string | null
}): Promise<Contacto> {
  const unitId = data.unitId ?? unitIds[0]
  if (!unitId) throw new AppError(403, 'not_your_unit')
  await assertMemberOfUnit(personId, unitId)
  if (data.tradeId) await assertRubroDelBarrio(data.tradeId, unitId)
  const [c] = await db.insert(contacts).values({
    unitId, kind: data.kind, name: data.name.trim(), doc: data.doc?.trim() || null,
    tradeId: data.kind === 'proveedor' ? data.tradeId ?? null : null, createdBy: personId,
  }).returning()
  return (await listContacts([unitId], c.id))[0]
}

export async function editContact(id: string, unitIds: string[], data: {
  name?: string; doc?: string | null; tradeId?: string | null
}): Promise<Contacto> {
  const c = await propio(id, unitIds)
  if (data.tradeId) {
    if (c.kind !== 'proveedor') throw new AppError(400, 'rubro_invalido')
    await assertRubroDelBarrio(data.tradeId, c.unitId)
  }
  await db.update(contacts).set({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.doc !== undefined ? { doc: data.doc?.trim() || null } : {}),
    ...(data.tradeId !== undefined ? { tradeId: data.tradeId } : {}),
  }).where(eq(contacts.id, id))
  return (await listContacts([c.unitId], id))[0]
}

/** Borrado real: es la agenda del vecino, no un registro de nada. */
export async function deleteContact(id: string, unitIds: string[]): Promise<void> {
  await propio(id, unitIds)
  await db.delete(contacts).where(eq(contacts.id, id))
}
```

`api/src/routes/contacts.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { unitsOfPerson } from '../services/units.js'
import { createContact, deleteContact, editContact, listContacts } from '../services/contacts.js'

export const contactRoutes = Router()
contactRoutes.use(requireAuth)
validarUuid(contactRoutes)

const ids = async (personId: string) => (await unitsOfPerson(personId)).map((u) => u.id)
const nombre = z.string().trim().min(1).max(80)
const doc = z.string().trim().max(40).nullable().optional()

contactRoutes.get('/', async (req, res) => {
  res.json(await listContacts(await ids(req.person!.id)))
})

contactRoutes.post('/', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid().optional(),
    kind: z.enum(['visita', 'proveedor']),
    name: nombre,
    doc,
    tradeId: z.string().uuid().nullable().optional(),
  }).refine((b) => b.kind === 'proveedor' || !b.tradeId, { path: ['tradeId'] }).parse(req.body)
  res.status(201).json(await createContact(req.person!.id, await ids(req.person!.id), body))
})

contactRoutes.patch('/:id', async (req, res) => {
  const body = z.object({ name: nombre.optional(), doc, tradeId: z.string().uuid().nullable().optional() }).parse(req.body)
  res.json(await editContact(req.params.id, await ids(req.person!.id), body))
})

contactRoutes.delete('/:id', async (req, res) => {
  await deleteContact(req.params.id, await ids(req.person!.id))
  res.json({ ok: true })
})
```

`api/src/app.ts`: `import { contactRoutes } from './routes/contacts.js'` y, después de `app.use('/invitations', invitationRoutes)`, `app.use('/contacts', contactRoutes)`. No va en la lista de `avisarAlEscribir`: un contacto no cambia nada de lo que ve la garita.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run tests/contactos.test.ts && npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/services/contacts.ts api/src/routes/contacts.ts api/src/app.ts api/tests/contactos.test.ts
git commit -m "feat: api de contactos del vecino"
```

---

### Task 3: Lógica pura y queries de contactos en la web

**Files:**
- Create: `web/src/lib/contactos.ts`, `web/src/lib/contactos.check.ts`, `web/src/lib/queries/contactos.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces:
  - `type Contacto` (la misma forma que la API)
  - `filtrarContactos(cs: Contacto[], q: string, tipo: 'todos' | 'visita' | 'proveedor'): Contacto[]`: busca por nombre (sin tildes ni mayúsculas) o por dígitos del DNI
  - `agruparContactos(cs: Contacto[]): { visitas: Contacto[]; proveedores: Contacto[] }`
  - `lineaContacto(c: Contacto, hoy: string): string`, por ejemplo `'DNI 28.443.120'`, `'Jardinería · Seguro hasta 12/03/2027'`, `'Plomería · Seguro vencido'`, `'Plomería · Sin seguro cargado'`, `'Proveedor'`
  - `useContactos()`, `useCrearContacto()`, `useEditarContacto()`, `useBorrarContacto()`; claves `['contactos']`

- [ ] **Step 1: Write the failing check**

`web/src/lib/contactos.check.ts`:

```ts
/** `node src/lib/contactos.check.ts`. */
import assert from 'node:assert/strict'
import { agruparContactos, filtrarContactos, lineaContacto, type Contacto } from './contactos.ts'

const c = (o: Partial<Contacto>): Contacto => ({
  id: o.name ?? 'x', unitId: 'u', kind: 'visita', name: 'X', doc: null, tradeId: null, tradeName: null,
  insuranceState: 'no_aplica', insuranceExpiresOn: null, ...o,
})
const rosa = c({ name: 'Rosa Benítez', doc: '28.443.120' })
const carlos = c({ name: 'Carlos Gómez', kind: 'proveedor', tradeName: 'Jardinería', insuranceState: 'vigente', insuranceExpiresOn: '2027-03-12' })
const hugo = c({ name: 'Hugo Ríos', kind: 'proveedor', tradeName: 'Plomería', insuranceState: 'vencido', insuranceExpiresOn: '2026-10-10' })
const todos = [rosa, carlos, hugo]

assert.deepEqual(filtrarContactos(todos, 'benitez', 'todos'), [rosa])
assert.deepEqual(filtrarContactos(todos, '28443', 'todos'), [rosa])
assert.deepEqual(filtrarContactos(todos, '', 'proveedor'), [carlos, hugo])
assert.deepEqual(filtrarContactos(todos, 'rios', 'visita'), [])
assert.deepEqual(agruparContactos(todos), { visitas: [rosa], proveedores: [carlos, hugo] })
const HOY = '2026-10-24'
assert.equal(lineaContacto(rosa, HOY), 'DNI 28.443.120')
assert.equal(lineaContacto(c({ name: 'Mamá' }), HOY), 'Visita')
assert.equal(lineaContacto(carlos, HOY), 'Jardinería · Seguro hasta 12/03/2027')
assert.equal(lineaContacto(hugo, HOY), 'Plomería · Seguro vencido')
assert.equal(lineaContacto({ ...hugo, insuranceState: 'sin_cargar', insuranceExpiresOn: null }, HOY), 'Plomería · Sin seguro cargado')
assert.equal(lineaContacto({ ...carlos, insuranceState: 'no_aplica', tradeName: null }, HOY), 'Proveedor')
console.log('contactos: ok')
```

`web/package.json` → `check`: sumar ` && node src/lib/contactos.check.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && node src/lib/contactos.check.ts`
Expected: FAIL, "Cannot find module './contactos.ts'"

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/contactos.ts`:

```ts
import { fechaCompleta } from './fechas.ts'

export type Contacto = {
  id: string
  unitId: string
  kind: 'visita' | 'proveedor'
  name: string
  doc: string | null
  tradeId: string | null
  tradeName: string | null
  insuranceState: 'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'
  insuranceExpiresOn: string | null
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Por nombre (sin tildes ni mayúsculas) o por los dígitos del DNI, como el buscador de la garita. */
export function filtrarContactos(cs: Contacto[], q: string, tipo: 'todos' | 'visita' | 'proveedor'): Contacto[] {
  const texto = sinTildes(q.trim())
  const digitos = q.replace(/\D/g, '')
  return cs.filter((c) => (tipo === 'todos' || c.kind === tipo) && (!texto
    || sinTildes(c.name).includes(texto)
    || (digitos.length >= 3 && (c.doc ?? '').replace(/\D/g, '').includes(digitos))))
}

export function agruparContactos(cs: Contacto[]) {
  return { visitas: cs.filter((c) => c.kind === 'visita'), proveedores: cs.filter((c) => c.kind === 'proveedor') }
}

/** La línea de abajo del nombre: el DNI de una visita, o el rubro y el seguro de un proveedor. */
export function lineaContacto(c: Contacto, _hoy: string): string {
  if (c.kind === 'visita') return c.doc ? `DNI ${c.doc}` : 'Visita'
  const seguro = c.insuranceState === 'vigente' || c.insuranceState === 'por_vencer'
    ? `Seguro hasta ${fechaCompleta(c.insuranceExpiresOn!)}`
    : c.insuranceState === 'vencido' ? 'Seguro vencido'
    : c.insuranceState === 'sin_cargar' ? 'Sin seguro cargado' : null
  return [c.tradeName, seguro].filter(Boolean).join(' · ') || 'Proveedor'
}
```

`web/src/lib/queries/contactos.ts`:

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import type { Contacto } from '@/lib/contactos'

const CLAVE = ['contactos'] as const

export type DatosContacto = { kind: 'visita' | 'proveedor'; name: string; doc: string | null; tradeId: string | null }

export function useContactos() {
  return useQuery({ queryKey: CLAVE, queryFn: ({ signal }) => api<Contacto[]>('/contacts', { signal }) })
}

function mensaje(e: unknown) {
  return e instanceof ApiError && e.code === 'rubro_invalido' ? 'Ese rubro ya no está disponible. Elegí otro.'
    : e instanceof ApiError && e.code === 'contact_not_found' ? 'Ese contacto ya no existe.'
    : 'No se pudo guardar el contacto. Probá de nuevo.'
}

export function useCrearContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosContacto) => api<Contacto>('/contacts', { method: 'POST', body: JSON.stringify(d) }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useEditarContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...d }: Omit<DatosContacto, 'kind'> & { id: string }) =>
      api<Contacto>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useBorrarContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/contacts/${id}`, { method: 'DELETE' }),
    onError: (e) => toast.error(mensaje(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm run check && npx tsc --noEmit`
Expected: `contactos: ok` y sin errores

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/contactos.ts web/src/lib/contactos.check.ts web/src/lib/queries/contactos.ts web/package.json
git commit -m "feat: lógica y queries de contactos en el front"
```

---

### Task 4: Formulario de contacto y pestaña Contactos

**Files:**
- Create: `web/src/components/vecino/formulario-contacto.tsx`, `web/src/app/(vecino)/contactos/page.tsx`
- Modify: `web/src/components/vecino/chrome.tsx`

**Interfaces:**
- Consumes: Task 3; `useRubrosDelBarrio` (`web/src/lib/queries/invitaciones.ts`); `Campo`, `Chips`, `Fila`, `Vacio`, `EncabezadoPagina`, `SkeletonFilas`, `ErrorConReintento`; `Sheet*` y `Dialog*` de `ui/`.
- Produces:
  - `<FormularioContacto contacto?: Contacto onListo: () => void />`: alta (con tipo) o edición (sin tipo); en edición, "Borrar contacto" con confirmación.
  - Página `/contactos`: título "Contactos", chips `Todos N · Visitas N · Proveedores N`, buscador "Nombre o DNI", una `Fila` por contacto con `lineaContacto` y el link "Invitar" a `/invitaciones/nueva?contacto=<id>`, y "+ Agregar contacto". Tocar la fila abre la edición en una hoja.
  - Barra: `Invitaciones · Contactos · Historial · Perfil` (ícono `BookUser` de lucide).

- [ ] **Step 1: Escribir el formulario**

`web/src/components/vecino/formulario-contacto.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/dominio/campo'
import { Chips } from '@/components/dominio/chips'
import { useRubrosDelBarrio } from '@/lib/queries/invitaciones'
import { useBorrarContacto, useCrearContacto, useEditarContacto } from '@/lib/queries/contactos'
import type { Contacto } from '@/lib/contactos'

/** Alta o edición de un contacto. Una visita es nombre y DNI; un proveedor suma el rubro. */
export function FormularioContacto({ contacto, onListo }: { contacto?: Contacto; onListo: () => void }) {
  const [kind, setKind] = useState<Contacto['kind']>(contacto?.kind ?? 'visita')
  const [name, setName] = useState(contacto?.name ?? '')
  const [doc, setDoc] = useState(contacto?.doc ?? '')
  const [rubro, setRubro] = useState(contacto?.tradeId ?? '')
  const [intento, setIntento] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const { data: rubros } = useRubrosDelBarrio()
  const lista = rubros?.trades ?? []
  const crear = useCrearContacto()
  const editar = useEditarContacto()
  const borrar = useBorrarContacto()
  const guardando = crear.isPending || editar.isPending
  const errorNombre = intento && !name.trim() ? 'Escribí el nombre.' : null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (!name.trim()) return
    const datos = { name: name.trim(), doc: doc.trim() || null, tradeId: kind === 'proveedor' && rubro ? rubro : null }
    if (contacto) await editar.mutateAsync({ id: contacto.id, ...datos })
    else await crear.mutateAsync({ kind, ...datos })
    onListo()
  }

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-5 px-4 pb-8">
      {!contacto && (
        <Campo id="tipo-contacto" etiqueta="Tipo">
          <Chips etiqueta="Tipo de contacto" valor={kind} onCambio={setKind}
            opciones={[{ valor: 'visita', etiqueta: 'Visita' }, { valor: 'proveedor', etiqueta: 'Proveedor' }]} />
        </Campo>
      )}
      <Campo id="nombre-contacto" etiqueta="Nombre" error={errorNombre}>
        <Input id="nombre-contacto" value={name} autoComplete="off" placeholder="Rosa Benítez"
          aria-invalid={Boolean(errorNombre) || undefined} onChange={(e) => setName(e.target.value)} />
      </Campo>
      <Campo id="doc-contacto" etiqueta="Documento (opcional)"
        ayuda={kind === 'proveedor' ? 'Con el DNI ves si su seguro está al día.' : 'Si lo cargás, el guardia no lo tiene que pedir.'}>
        <Input id="doc-contacto" value={doc} className="tabular" placeholder="30.123.456" onChange={(e) => setDoc(e.target.value)} />
      </Campo>
      {kind === 'proveedor' && lista.length > 0 && (
        <Campo id="rubro-contacto" etiqueta="Rubro (opcional)">
          <Select value={rubro} onValueChange={setRubro}>
            <SelectTrigger id="rubro-contacto" className="h-11! w-full"><SelectValue placeholder="Elegí el rubro" /></SelectTrigger>
            <SelectContent>{lista.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
      )}
      <Button type="submit" size="lg" disabled={guardando}>
        {guardando && <Loader2 className="animate-spin" aria-hidden />}
        {contacto ? 'Guardar cambios' : 'Guardar contacto'}
      </Button>
      {contacto && (
        <Button type="button" variant="ghost" className="text-alto hover:bg-alto-tint hover:text-alto" onClick={() => setBorrando(true)}>
          <Trash2 aria-hidden />Borrar contacto
        </Button>
      )}
      <Dialog open={borrando} onOpenChange={setBorrando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar a {contacto?.name}?</DialogTitle>
            <DialogDescription>Sale de los contactos de tu casa. Las invitaciones que ya le hiciste quedan.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBorrando(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={borrar.isPending}
              onClick={() => contacto && borrar.mutate(contacto.id, { onSuccess: () => { setBorrando(false); onListo() } })}>
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
```

- [ ] **Step 2: Escribir la página**

`web/src/app/(vecino)/contactos/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { BookUser, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { FormularioContacto } from '@/components/vecino/formulario-contacto'
import { useContactos } from '@/lib/queries/contactos'
import { filtrarContactos, lineaContacto, type Contacto } from '@/lib/contactos'
import { hoyISO } from '@/lib/fechas'
import { cn } from '@/lib/utils'

type Tipo = 'todos' | 'visita' | 'proveedor'

export default function ContactosPage() {
  const q = useContactos()
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [busca, setBusca] = useState('')
  // undefined = hoja cerrada; null = alta; un contacto = edición.
  const [hoja, setHoja] = useState<Contacto | null | undefined>(undefined)
  const todos = q.data ?? []
  const lista = filtrarContactos(todos, busca, tipo)
  const cuenta = (t: Tipo) => filtrarContactos(todos, '', t).length
  const hoy = hoyISO()

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Contactos"
        acciones={<Button size="lg" className="hidden sm:inline-flex" onClick={() => setHoja(null)}><Plus aria-hidden />Agregar contacto</Button>} />

      {q.isPending ? <SkeletonFilas /> : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : todos.length === 0 ? (
        <Vacio icono={BookUser} titulo="Todavía no guardaste contactos"
          detalle="Guardá a los que vienen seguido y los invitás en dos toques."
          accion={<Button onClick={() => setHoja(null)}><Plus aria-hidden />Agregar contacto</Button>} />
      ) : (
        <>
          <Chips etiqueta="Filtrar contactos" valor={tipo} onCambio={setTipo} desplaza
            opciones={[
              { valor: 'todos', etiqueta: 'Todos', contador: cuenta('todos') },
              { valor: 'visita', etiqueta: 'Visitas', contador: cuenta('visita') },
              { valor: 'proveedor', etiqueta: 'Proveedores', contador: cuenta('proveedor') },
            ]} />
          <Input aria-label="Buscar contacto" placeholder="Nombre o DNI" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <ul>
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Fila className="flex-1" titulo={c.name} meta={lineaContacto(c, hoy)} onClick={() => setHoja(c)} />
                <Link href={`/invitaciones/nueva?contacto=${c.id}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>Invitar</Link>
              </li>
            ))}
          </ul>
          {lista.length === 0 && <p className="text-sm text-ink-soft">Nadie coincide con “{busca}”.</p>}
        </>
      )}

      {todos.length > 0 && (
        <Button size="lg" onClick={() => setHoja(null)}
          className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 shadow-(--sombra-flotante) sm:hidden">
          <Plus aria-hidden />Agregar contacto
        </Button>
      )}

      <Sheet open={hoja !== undefined} onOpenChange={(v) => { if (!v) setHoja(undefined) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{hoja ? 'Editar contacto' : 'Nuevo contacto'}</SheetTitle>
            <SheetDescription>Lo ven y lo usan todos los que viven en tu casa.</SheetDescription>
          </SheetHeader>
          {hoja !== undefined && <FormularioContacto key={hoja?.id ?? 'nuevo'} contacto={hoja ?? undefined} onListo={() => setHoja(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

En `web/src/components/vecino/chrome.tsx`: sumar `BookUser` al import de lucide y, entre Invitaciones e Historial:

```ts
    { href: '/contactos', etiqueta: 'Contactos', icono: BookUser, activo: path.startsWith('/contactos') },
```

- [ ] **Step 3: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sin errores

A 390×844, como vecino: entrar a Contactos → vacío → agregar una visita y un proveedor → la lista los muestra con su línea → los chips cuentan → buscar por apellido y por dígitos → editar → borrar con confirmación. Con un admin en la barra (si el vecino es admin), revisar que cinco pestañas entren en la barra de abajo. Si no entran, la de Administración ya está solo arriba: confirmarlo en `BarraSeccion`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/vecino/formulario-contacto.tsx "web/src/app/(vecino)/contactos/page.tsx" web/src/components/vecino/chrome.tsx
git commit -m "feat: pestaña contactos del vecino"
```

---

### Task 5: Invitar desde un contacto y guardar uno nuevo

**Files:**
- Create: `web/src/components/vecino/elegir-contacto.tsx`
- Modify: `web/src/app/(vecino)/page.tsx`, `web/src/app/(vecino)/invitaciones/nueva/page.tsx`, `web/src/components/vecino/formulario-invitacion.tsx`

**Interfaces:**
- Consumes: `useContactos`, `useCrearContacto`, `agruparContactos`, `filtrarContactos`, `lineaContacto` (Task 3).
- Produces:
  - `<ElegirContacto abierto onAbiertoChange />`: hoja "¿A quién invitás?" con buscador, "+ Alguien nuevo" (→ `/invitaciones/nueva`) y los contactos en dos grupos, Visitas y Proveedores (→ `/invitaciones/nueva?contacto=<id>`).
  - En la home, "Nueva invitación" (los dos botones) abre la hoja si hay contactos. Sin contactos va directo al formulario, como hoy.
  - `/invitaciones/nueva?contacto=<id>`: título "Invitás a *Carlos.*", y el formulario precargado (tipo, nombre, DNI, rubro) con una tarjeta del contacto arriba y "Cambiar" (→ abre la hoja). Sin los campos Nombre y Documento: los trae el contacto.
  - `FormularioInvitacion` suma la prop `contacto?: Contacto` y, sin contacto y en alta, el tilde "Guardar en contactos". Al crear la invitación con el tilde, se guarda también el contacto.

- [ ] **Step 1: La hoja**

`web/src/components/vecino/elegir-contacto.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Fila } from '@/components/dominio/fila'
import { useContactos } from '@/lib/queries/contactos'
import { agruparContactos, filtrarContactos, lineaContacto, type Contacto } from '@/lib/contactos'
import { hoyISO } from '@/lib/fechas'

const NUEVA = '/invitaciones/nueva'

function Grupo({ titulo, cs }: { titulo: string; cs: Contacto[] }) {
  if (!cs.length) return null
  const hoy = hoyISO()
  return (
    <section aria-label={titulo}>
      <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink-soft">{titulo}</h3>
      <ul>{cs.map((c) => (
        <li key={c.id}><Fila titulo={c.name} meta={lineaContacto(c, hoy)} href={`${NUEVA}?contacto=${c.id}`} /></li>
      ))}</ul>
    </section>
  )
}

/** "Nueva invitación" arranca por a quién: elegir un contacto deja solo la fecha. */
export function ElegirContacto({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const q = useContactos()
  const [busca, setBusca] = useState('')
  const { visitas, proveedores } = agruparContactos(filtrarContactos(q.data ?? [], busca, 'todos'))
  return (
    <Sheet open={abierto} onOpenChange={(v) => { onAbiertoChange(v); if (!v) setBusca('') }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>¿A quién invitás?</SheetTitle>
          <SheetDescription className="sr-only">Elegí un contacto o invitá a alguien nuevo.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col px-4 pb-8">
          <Input aria-label="Buscar en tus contactos" placeholder="Buscá en tus contactos" value={busca}
            onChange={(e) => setBusca(e.target.value)} />
          <Fila href={NUEVA} titulo={<span className="flex items-center gap-2"><Plus aria-hidden className="size-4" />Alguien nuevo</span>} />
          <Grupo titulo="Visitas" cs={visitas} />
          <Grupo titulo="Proveedores" cs={proveedores} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: La home abre la hoja**

`web/src/app/(vecino)/page.tsx`: `import { useState } from 'react'`, `import { ElegirContacto } from '@/components/vecino/elegir-contacto'`, `import { useContactos } from '@/lib/queries/contactos'`. En el componente:

```ts
  const contactos = useContactos()
  const [eligiendo, setEligiendo] = useState(false)
  // Sin contactos no hay nada que elegir: directo al formulario, como antes.
  const hayContactos = (contactos.data?.length ?? 0) > 0
```

Los dos `<Link href={NUEVA} …>` pasan a renderizarse así: si `hayContactos`, un `<button type="button" onClick={() => setEligiendo(true)} className={…la misma clase…}>`; si no, el `Link` de hoy. Al final del JSX: `<ElegirContacto abierto={eligiendo} onAbiertoChange={setEligiendo} />`.

- [ ] **Step 3: `?contacto=` en la página nueva y en el formulario**

`web/src/app/(vecino)/invitaciones/nueva/page.tsx`:
- `searchParams` suma `contacto?: string`.
- `const contactos = useContactos()` y `const contacto = sp.contacto ? contactos.data?.find((c) => c.id === sp.contacto) : undefined`.
- Mientras `sp.contacto && contactos.isPending`, `<SkeletonFilas />`.
- `inicial` con contacto: `{ kind: contacto.kind, guestName: contacto.name, guestDoc: contacto.doc ?? undefined, tradeId: contacto.tradeId ?? undefined }`.
- Título: con contacto, `titulo={<>Invitás a <em>{contacto.name.split(' ')[0]}.</em></>}`; sin contacto, el de hoy.
- `<FormularioInvitacion … contacto={contacto} key={contacto?.id ?? 'nuevo'} />` (la `key` reinicia el formulario al cambiar de contacto).
- Estado `const [eligiendo, setEligiendo] = useState(false)` y `<ElegirContacto abierto={eligiendo} onAbiertoChange={setEligiendo} />`. El "Cambiar" de la tarjeta lo abre: se pasa al formulario como `onCambiarContacto={() => setEligiendo(true)}`.

`web/src/components/vecino/formulario-invitacion.tsx`:
- Props: `contacto?: Contacto`, `onCambiarContacto?: () => void`; `inicial` suma `tradeId?: string`. `useState(invitacion?.tradeId ?? inicial?.tradeId ?? '')` para el rubro.
- Estado `const [guardarContacto, setGuardarContacto] = useState(false)` y `const crearContacto = useCrearContacto()`.
- Con `contacto`, en lugar del `Campo` "Nombre del invitado", la tarjeta:

```tsx
        {contacto ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-verde-tint p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{contacto.name}</p>
              <p className="truncate text-sm text-ink-soft tabular">{lineaContacto(contacto, hoy)}</p>
            </div>
            {onCambiarContacto && (
              <Button type="button" variant="ghost" size="sm" onClick={onCambiarContacto}>Cambiar</Button>
            )}
          </div>
        ) : (
          /* el Campo "Nombre del invitado" de hoy, sin cambios */
        )}
```

- En la sección "Para entrar más rápido", con `contacto` no se muestra el Documento (queda solo la Patente, en una columna).
- Antes de `{errorGeneral && …}`, en alta y sin contacto:

```tsx
      {!editando && !contacto && (
        <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
          <input type="checkbox" className="size-5 accent-(--marca-base)" checked={guardarContacto}
            onChange={(e) => setGuardarContacto(e.target.checked)} />
          Guardar en contactos
        </label>
      )}
```

(Si `accent-(--marca-base)` no resuelve en Tailwind 4 del proyecto, usar el token del botón primario: ver `--color-primary` en `globals.css`.)

- En `submit`, después de crear y antes de `onListo(inv)`:

```ts
      // La invitación ya está creada: si guardar el contacto falla, se avisa y se sigue.
      if (!editando && !contacto && guardarContacto) {
        await crearContacto.mutateAsync({
          kind: comoProveedor ? 'proveedor' : 'visita', name: guestName.trim(),
          doc: guestDoc.trim() || null, tradeId: pideRubro && rubro ? rubro : null,
        }).catch(() => {})
      }
```

(Una frecuente "de visita" se guarda como visita y una "a trabajar", como proveedor: `comoProveedor` ya lo resuelve.)

- [ ] **Step 4: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint && npm run check`
Expected: sin errores

A 390×844: crear una invitación nueva con "Guardar en contactos" → aparece en Contactos. En la home, "Nueva invitación" abre la hoja → tocar el contacto → "Invitás a Rosa." con la tarjeta → elegir la fecha → Crear. Probar "Cambiar" y "Alguien nuevo". Sacar captura de la hoja y del formulario con contacto y compararlas con el mockup A.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat: invitar desde un contacto en dos toques"
```

---

### Task 6: E2E y demo

**Files:**
- Create: `web/e2e/contactos.spec.ts`
- Modify: `api/scripts/demo.sql`, `web/e2e/limpiar.ts` (si hace falta borrar contactos de prueba)

- [ ] **Step 1: E2E**

`web/e2e/contactos.spec.ts`:

```ts
import { entrar, expect, test } from './sesion'

test('el vecino guarda un contacto al invitar y la próxima vez lo invita desde la hoja', async ({ page }) => {
  const nombre = `Contacto E2E ${Date.now()}`
  await entrar(page, 'vecino')

  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Guardar en contactos').check()
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  await page.goto('/')
  await page.getByRole('button', { name: 'Nueva invitación' }).first().click()
  await page.getByLabel('Buscar en tus contactos').fill(nombre)
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await expect(page.getByRole('heading', { name: /Invitás a/ })).toBeVisible()
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Se borra al final: la base de desarrollo no se limpia sola.
  await page.goto('/contactos')
  await page.getByLabel('Buscar contacto').fill(nombre)
  await page.getByRole('button', { name: new RegExp(nombre) }).click()
  await page.getByRole('button', { name: 'Borrar contacto' }).click()
  await page.getByRole('button', { name: 'Borrar', exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(nombre) })).toHaveCount(0)
})
```

(En la home hay dos botones "Nueva invitación": el de escritorio está oculto en el celular. `.first()` toma el visible del proyecto que corre. Si el proyecto mobile de Playwright toma el oculto, usar `getByRole(..., { name: 'Nueva invitación' }).locator('visible=true')`.)

Run: `cd web && npx playwright test e2e/contactos.spec.ts --workers=1`
Expected: passed

- [ ] **Step 2: Demo**

`api/scripts/demo.sql`: en la limpieza, `delete from contact;` antes de `delete from unit_member;`. Al final del bloque de invitaciones de Laura (`l12`):

```sql
  -- Contactos de la casa de Laura: dos visitas y el jardinero (con seguro en el padrón).
  insert into contact (unit_id, kind, name, doc, trade_id, created_by) values
    (l12, 'visita', 'Rosa Benítez', '28.443.120', null, laura),
    (l12, 'visita', 'Mamá', '12.334.556', null, laura),
    (l12, 'proveedor', 'Osvaldo Benavídez', '22.870.134', (select id from trade where name = 'Gasista'), laura);
```

Run: `docker compose exec -T db psql -U invitaciones -v ON_ERROR_STOP=1 < api/scripts/demo.sql`
Expected: `COMMIT`

- [ ] **Step 3: Verificar todo y commit**

Run: `cd api && npm test && npx tsc --noEmit` y `cd web && npm run check && npm run lint && npx tsc --noEmit && npm run e2e -- --workers=1`
Expected: todo en verde

```bash
git add web/e2e api/scripts/demo.sql
git commit -m "feat: e2e y demo de contactos"
```

- [ ] **Step 4: README**

En `README.md`, sección **Cómo funciona → El vecino**, sumar: "Guarda a los que vienen seguido en **Contactos** (los ven todos los de la casa). *Nueva invitación* arranca por a quién: elegir un contacto deja solo la fecha. De un proveedor ve si su seguro está al día, nunca la póliza." Commit `feat: readme de contactos`.
