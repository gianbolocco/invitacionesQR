# Alta exprés en garita y DNI obligatorio al ingreso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que el guardia dé de alta, desde la garita, una invitación exprés a nombre del vecino que aprobó por teléfono, y exigir documento para registrar cualquier ingreso.

**Architecture:** Dos funciones nuevas de servicio (`searchUnits`, `createExpressInvitation`) y dos rutas nuevas bajo `/gate`, reutilizando el 100% del flujo de veredicto/ingreso que ya existe. El Documento pasa de opcional a obligatorio en el contrato de `POST /gate/entries` y en la pantalla de veredicto — no en el servicio `registerEntry`, que sigue siendo un primitivo flexible para no romper las ~40 llamadas directas que ya lo usan en tests no relacionados. Una expresión SQL compartida enmascara el nombre del creador cuando es un guardia.

**Tech Stack:** Express 5 + TS + Drizzle + Postgres (api/), Next 16 + React 19 + TanStack Query v5 (web/), Vitest + Supertest, Playwright.

## Global Constraints

- `entry_log.invitation_id` es `NOT NULL`: todo ingreso/egreso sigue pasando por una invitación, nunca se crea un camino sin ella.
- El alta exprés crea con `kind: 'visita'`, `validFrom = validTo = hoy` (`todayInBuenosAires()`), `capacity: 1`, sin pedirle nada de eso al guardia.
- El Documento se exige en el contrato HTTP de `POST /gate/entries` (zod), **no** dentro de `registerEntry` — así las llamadas directas a `registerEntry(...)` en tests no relacionados (agenda, auditoría, egresos, reportes) siguen funcionando sin tocarlas.
- La etiqueta cuando el creador es guardia es exactamente: `Portería (autorizado por teléfono)`.
- Cualquier Sheet/Dialog que se abra desde un botón suelto (no un `SheetTrigger`) tiene que devolver el foco a ese botón al cerrarse (`onCloseAutoFocus` + ref), siguiendo el mismo patrón ya usado en `DialogLote`/`DialogBaja` (`web/src/app/(admin)/admin/vecinos/page.tsx`) — si no, se reintroduce el bug de foco que se corrigió en la fase anterior.

---

## Task 1: Buscar unidades por lote o apellido (`searchUnits` + `GET /gate/units`)

**Files:**
- Modify: `api/src/services/units.ts`
- Modify: `api/src/routes/gate.ts`
- Create: `api/tests/alta-expres.test.ts`

**Interfaces:**
- Produces: `searchUnits(neighborhoodId: string, query: string): Promise<{ unitId: string; unitLabel: string; residentName: string }[]>`, exportado desde `api/src/services/units.ts`.
- Produces: `GET /gate/units?q=` (requiere sesión `guard`/`admin`, ya cubierto por `gateRoutes.use(requireAuth, requireRole('guard', 'admin'))`), responde `{ unitId, unitLabel, residentName }[]`.

- [ ] **Step 1: Escribir el test, en rojo**

Crear `api/tests/alta-expres.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function escenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u142] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [u200] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 200' }).returning()
  const [martin] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín Pérez',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u142.id, personId: martin.id })

  const [otroBarrio] = await db.insert(neighborhoods).values({ name: 'Otro Barrio' }).returning()
  const [uOtro] = await db.insert(units).values({ neighborhoodId: otroBarrio.id, label: 'Lote 142' }).returning()
  const [deOtro] = await db.insert(people).values({
    neighborhoodId: otroBarrio.id, email: 'ajeno@example.com', name: 'Ajeno',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: uOtro.id, personId: deOtro.id })

  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], neighborhoodId: n.id, unit142: u142, unit200: u200, martin, guardia }
}

describe('buscar unidades en la garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('encuentra por lote', async () => {
    const { cookie, unit142 } = await escenario()
    const res = await request(app).get('/gate/units?q=142').set('Cookie', cookie).expect(200)
    expect(res.body).toEqual([{ unitId: unit142.id, unitLabel: 'Lote 142', residentName: 'Martín Pérez' }])
  })

  it('encuentra por apellido, sin tilde', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=perez').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].residentName).toBe('Martín Pérez')
  })

  it('no devuelve unidades de otro barrio', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=142').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
  })

  it('una unidad sin nadie cargado no aparece', async () => {
    const { cookie } = await escenario()
    const res = await request(app).get('/gate/units?q=200').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(0)
  })

  it('exige q', async () => {
    const { cookie } = await escenario()
    await request(app).get('/gate/units').set('Cookie', cookie).expect(400)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: FAIL — `404` en `/gate/units` (la ruta no existe todavía).

- [ ] **Step 3: Implementar `searchUnits`**

En `api/src/services/units.ts`, cambiar el import de drizzle-orm de:

```ts
import { and, eq } from 'drizzle-orm'
```

a:

```ts
import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { people } from '../db/schema.js'
```

(el archivo ya importa `units, unitMembers, people` desde `'../db/schema.js'` en una sola línea — agregar `people` ahí si falta; revisar el import existente `import { units, unitMembers, people } from '../db/schema.js'` antes de duplicarlo.)

Agregar al final del archivo:

```ts
/**
 * Unidades de un barrio que matchean por lote o por apellido de algún
 * residente. A diferencia de `unitsOfPerson` (las unidades de UN vecino,
 * para que elija entre las suyas), esta busca entre TODAS las del barrio:
 * la usa el guardia para encontrar la unidad de alguien que llamó por
 * teléfono, sin ser miembro de ella.
 *
 * Una fila por combinación unidad+residente: si dos personas viven en el
 * mismo lote, aparecen las dos, apuntando al mismo `unitId`.
 */
export async function searchUnits(neighborhoodId: string, query: string) {
  const q = `%${query.trim()}%`
  return db.select({
    unitId: units.id,
    unitLabel: units.label,
    residentName: people.name,
  })
    .from(unitMembers)
    .innerJoin(units, eq(units.id, unitMembers.unitId))
    .innerJoin(people, eq(people.id, unitMembers.personId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      or(
        sql`unaccent(${people.name}) ilike unaccent(${q})`,
        // Sin unaccent: un lote no lleva tildes.
        ilike(units.label, q),
      ),
    ))
    .orderBy(units.label)
    .limit(20)
}
```

- [ ] **Step 4: Agregar la ruta**

En `api/src/routes/gate.ts`, agregar `searchUnits` al import de servicios y la ruta nueva junto a `/search`:

```ts
import { searchUnits } from '../services/units.js'
```

```ts
gateRoutes.get('/units', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchUnits(req.person!.neighborhoodId, q))
})
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: PASS (los 5 tests de este archivo).

- [ ] **Step 6: Commit**

```bash
git add api/src/services/units.ts api/src/routes/gate.ts api/tests/alta-expres.test.ts
git commit -m "feat: buscar unidades por lote o apellido para la garita"
```

---

## Task 2: Crear la invitación exprés (`createExpressInvitation` + `POST /gate/invitations`)

**Files:**
- Modify: `api/src/services/invitations.ts`
- Modify: `api/src/routes/gate.ts`
- Modify: `api/tests/alta-expres.test.ts`

**Interfaces:**
- Consumes: nada de la Task 1 directamente (es un camino de escritura separado).
- Produces: `createExpressInvitation(input: { unitId: string; guestName: string; plate?: string; createdBy: string; neighborhoodId: string })`, exportado desde `api/src/services/invitations.ts`. Devuelve la invitación creada (misma forma que `createInvitation`).
- Produces: `assertUnitInNeighborhood(unitId: string, neighborhoodId: string): Promise<void>`, exportado desde el mismo archivo — lanza `AppError(403, 'not_your_neighborhood')`.
- Produces: `POST /gate/invitations` con body `{ unitId: string; guestName: string; plate?: string }`, responde `201` con la invitación creada (el cliente usa `.id` para navegar al veredicto).

- [ ] **Step 1: Agregar los tests, en rojo**

Agregar a `api/tests/alta-expres.test.ts` (reutiliza `escenario()` de la Task 1):

```ts
describe('alta exprés de invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea con los defaults de una visita de un día', async () => {
    const { cookie, unit142, guardia } = await escenario()
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Invitado Exprés' }).expect(201)

    expect(res.body.kind).toBe('visita')
    expect(res.body.capacity).toBe(1)
    expect(res.body.validFrom).toBe(res.body.validTo)
    expect(res.body.createdBy).toBe(guardia.id)
    expect(res.body.guestName).toBe('Invitado Exprés')
  })

  it('acepta la patente opcional', async () => {
    const { cookie, unit142 } = await escenario()
    const res = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Con patente', plate: 'ab123cd' }).expect(201)
    expect(res.body.plate).toBe('AB123CD')
  })

  it('rechaza una unidad de otro barrio', async () => {
    const { cookie } = await escenario()
    const [otroBarrio] = await db.insert(neighborhoods).values({ name: 'Lejano' }).returning()
    const [unidadAjena] = await db.insert(units).values({ neighborhoodId: otroBarrio.id, label: 'Lote 1' }).returning()

    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unidadAjena.id, guestName: 'Intruso' }).expect(403)
  })

  it('el ingreso recién creado se puede registrar como cualquier otro', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Invitado Exprés' }).expect(201).then((r) => r.body)

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.check).toEqual({ ok: true })

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Invitado Exprés', guestDoc: '30555666' }).expect(201)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: FAIL — `404` en `POST /gate/invitations`.

- [ ] **Step 3: Implementar `assertUnitInNeighborhood` y `createExpressInvitation`**

En `api/src/services/invitations.ts`, agregar después de `assertMemberOfUnit`:

```ts
export async function assertUnitInNeighborhood(unitId: string, neighborhoodId: string): Promise<void> {
  const [row] = await db.select().from(units)
    .where(and(eq(units.id, unitId), eq(units.neighborhoodId, neighborhoodId)))
    .limit(1)
  if (!row) throw new AppError(403, 'not_your_neighborhood')
}

export type CreateExpressInvitationInput = {
  unitId: string
  guestName: string
  plate?: string
  createdBy: string
  neighborhoodId: string
}

/**
 * El alta exprés: la crea el guardia cuando alguien llega sin invitación y
 * el vecino aprueba por teléfono. No usa `assertMemberOfUnit` —el guardia
 * nunca es miembro de una unidad— sino que valida que la unidad sea del
 * mismo barrio.
 *
 * Nada de lo que normalmente se elige: es de hoy, una vez, una persona —
 * los mismos defaults que ya tendría una visita de un solo día.
 */
export async function createExpressInvitation(input: CreateExpressInvitationInput) {
  await assertUnitInNeighborhood(input.unitId, input.neighborhoodId)
  const hoy = todayInBuenosAires()

  const [inv] = await db.insert(invitations).values({
    unitId: input.unitId,
    createdBy: input.createdBy,
    kind: 'visita',
    guestName: input.guestName.trim(),
    plate: input.plate?.trim().toUpperCase() || null,
    validFrom: hoy,
    validTo: hoy,
    capacity: 1,
    token: randomToken(16),
  }).returning()

  return inv
}
```

- [ ] **Step 4: Agregar la ruta**

En `api/src/routes/gate.ts`, agregar `createExpressInvitation` al import de `'../services/invitations.js'` (ruta nueva, agregar el import):

```ts
import { createExpressInvitation } from '../services/invitations.js'
```

```ts
gateRoutes.post('/invitations', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid(),
    guestName: z.string().min(1),
    plate: z.string().optional(),
  }).parse(req.body)

  res.status(201).json(await createExpressInvitation({
    ...body, createdBy: req.person!.id, neighborhoodId: req.person!.neighborhoodId,
  }))
})
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: PASS (los 9 tests acumulados en este archivo).

- [ ] **Step 6: Commit**

```bash
git add api/src/services/invitations.ts api/src/routes/gate.ts api/tests/alta-expres.test.ts
git commit -m "feat: alta exprés de invitación desde la garita"
```

---

## Task 3: El Documento es obligatorio para registrar un ingreso

**Files:**
- Modify: `api/src/routes/gate.ts`
- Modify: `api/src/services/entries.ts`
- Modify: `api/tests/gate.test.ts`
- Modify: `api/tests/invitations.test.ts`
- Modify: `api/tests/alta-expres.test.ts`

**Interfaces:**
- Consumes: nada de las tasks anteriores.
- Produces: `POST /gate/entries` ahora exige `guestDoc` no vacío (`400` si falta). `registerEntry` sigue aceptando `guestDoc` opcional en su firma (sin cambios de tipo) — la obligatoriedad vive en el schema de la ruta, no en la función. Si la invitación no tenía `guestDoc` y llega uno, queda guardado en `invitations.guestDoc`, no solo en el registro de esa entrada.

- [ ] **Step 1: Escribir los tests nuevos, en rojo**

Agregar a `api/tests/alta-expres.test.ts`:

```ts
describe('el documento es obligatorio al ingreso', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('rechaza el ingreso sin documento', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Sin Doc' }).expect(201).then((r) => r.body)

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Sin Doc' }).expect(400)
  })

  it('si la invitación no tenía documento, el tipeado en la puerta queda guardado en la invitación', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Carga en la puerta' }).expect(201).then((r) => r.body)
    expect(creada.guestDoc).toBeNull()

    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: creada.id, guestName: 'Carga en la puerta', guestDoc: '30777888' }).expect(201)

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.invitation.guestDoc).toBe('30777888')
  })

  it('si ya tenía documento, no lo pisa con otro distinto', async () => {
    const { cookie, unit142, guardia } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Con Doc Previo', plate: undefined }).expect(201).then((r) => r.body)

    await db.update(invitations).set({ guestDoc: '30111111', capacity: 5, kind: 'frecuente' })
      .where(eq(invitations.id, creada.id))

    await registerEntry(creada.id, guardia.id, { guestName: 'Con Doc Previo', guestDoc: '30999999' })

    const check = await request(app).get(`/gate/invitation/${creada.id}`).set('Cookie', cookie).expect(200)
    expect(check.body.invitation.guestDoc).toBe('30111111')
  })
})
```

Agregar los imports que falten al tope de `api/tests/alta-expres.test.ts`:

```ts
import { eq } from 'drizzle-orm'
import { invitations } from '../src/db/schema.js'
import { registerEntry } from '../src/services/entries.js'
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: FAIL — el primer test nuevo espera `400` y hoy da `201` (`guestDoc` es opcional); el segundo espera que `invitations.guestDoc` quede completado y hoy sigue en `null`.

- [ ] **Step 3: Exigir `guestDoc` en el contrato de la ruta**

En `api/src/routes/gate.ts`, en `gateRoutes.post('/entries', ...)`, cambiar:

```ts
    guestDoc: z.string().optional(),
```

a:

```ts
    guestDoc: z.string().trim().min(1),
```

(deja el resto del schema igual: `invitationId`, `guestName`, `plate`, `note`.)

- [ ] **Step 4: Guardar el documento en la invitación si estaba vacía**

En `api/src/services/entries.ts`, dentro de `registerEntry`, después del `insert` en `entryLogs` y antes del `return entry`:

```ts
    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: target.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: data.guestDoc?.trim() || null,
      plate: data.plate?.trim().toUpperCase() || null,
      note: data.note?.trim() || null,
    }).returning()

    // Si la invitación no tenía documento, el que se tipeó en la puerta
    // queda ahí: la próxima vez (frecuente, proveedor) ya viene precargado.
    // La fila de la invitación ya está bloqueada por el FOR UPDATE de arriba.
    if (!target.guestDoc && data.guestDoc?.trim()) {
      await tx.update(invitations).set({ guestDoc: data.guestDoc.trim() })
        .where(eq(invitations.id, invitationId))
    }

    return entry
```

- [ ] **Step 5: Correr y ver que los tests nuevos pasan, y arreglar los que rompieron**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: PASS (los 3 tests de este describe).

Run: `cd api && npx vitest run`
Expected: FALLAN estos 4, porque mandan `POST /gate/entries` sin `guestDoc`:

En `api/tests/gate.test.ts`, línea ~174-178 (test `'queda registrado el guardia logueado, no lo que mande el cliente'`), cambiar:

```ts
    await request(app).post('/gate/entries').set('Cookie', cookie).send({
      invitationId: inv.id,
      guardId: '00000000-0000-0000-0000-000000000000',
      guestName: 'Juan Pérez',
    }).expect(201)
```

a:

```ts
    await request(app).post('/gate/entries').set('Cookie', cookie).send({
      invitationId: inv.id,
      guardId: '00000000-0000-0000-0000-000000000000',
      guestName: 'Juan Pérez',
      guestDoc: '30123456',
    }).expect(201)
```

En el mismo archivo, línea ~186-187 (test `'la auditoría muestra el nombre de ese guardia'`), cambiar:

```ts
    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: inv.id, guestName: 'Juan Pérez' }).expect(201)
```

a:

```ts
    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: inv.id, guestName: 'Juan Pérez', guestDoc: '30123456' }).expect(201)
```

En `api/tests/invitations.test.ts`, línea ~367-368 (dentro de `'deja afuera las vencidas, las anuladas y las que ya se usaron y salieron'`), cambiar:

```ts
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: usada.id, guestName: 'Ya entró' }).expect(201)
```

a:

```ts
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: usada.id, guestName: 'Ya entró', guestDoc: '30123456' }).expect(201)
```

En el mismo archivo, línea ~390-391 (dentro de `'quien está adentro sigue en la home aunque haya agotado el cupo'`), cambiar:

```ts
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Adentro' }).expect(201)
```

a:

```ts
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Adentro', guestDoc: '30123456' }).expect(201)
```

- [ ] **Step 6: Correr toda la suite y ver que pasa**

Run: `cd api && npx vitest run`
Expected: PASS, todos los archivos (los 4 call-sites corregidos más los nuevos de `alta-expres.test.ts`). Ningún otro archivo llama `POST /gate/entries` por HTTP sin pasar por este schema — el resto de los tests (`agenda.test.ts`, `audit.test.ts`, `egresos.test.ts`, `reports.test.ts`, `public-invite.test.ts`) llaman `registerEntry(...)` directo, que no exige `guestDoc`, y siguen igual.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/gate.ts api/src/services/entries.ts api/tests/gate.test.ts api/tests/invitations.test.ts api/tests/alta-expres.test.ts
git commit -m "fix: exigir documento para registrar un ingreso"
```

---

## Task 4: Etiqueta "Portería" cuando la invitación la creó un guardia

**Files:**
- Modify: `api/src/services/invitations.ts`
- Modify: `api/src/services/entries.ts`
- Modify: `api/tests/alta-expres.test.ts`

**Interfaces:**
- Consumes: `createExpressInvitation` de la Task 2, para crear invitaciones con `createdBy` de un guardia en los tests.
- Produces: ningún tipo ni función nueva — cambia el **valor** que ya devuelven `creatorName` (en `listForUnits`/`searchInvitations`/`getInvitation`, vía `consultaInvitaciones`), `inviterName` (en `findPublicByToken`, en `agendaForDay`, y en `auditInvitations`/`auditAll`, vía `auditRows`) cuando el creador tiene `role = 'guard'`.

- [ ] **Step 1: Escribir los tests, en rojo**

Agregar a `api/tests/alta-expres.test.ts`:

```ts
describe('a quién se le atribuye una invitación de garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const ETIQUETA = 'Portería (autorizado por teléfono)'

  it('en el historial del vecino', async () => {
    const { cookie, unit142 } = await escenario()
    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés' }).expect(201)

    // El vecino de la unidad 142 ve su historial.
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const loginVecino = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const res = await request(app).get('/invitations/historial').set('Cookie', loginVecino.headers['set-cookie']).expect(200)
    const fila = res.body.rows.find((r: { guestName: string }) => r.guestName === 'Exprés')
    expect(fila.creatorName).toBe(ETIQUETA)
  })

  it('en la auditoría del admin', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Auditoría' }).expect(201).then((r) => r.body)

    const res = await request(app).get('/gate/audit').set('Cookie', cookie).expect(200)
    const fila = res.body.rows.find((r: { id: string }) => r.id === creada.id)
    expect(fila.inviterName).toBe(ETIQUETA)
  })

  it('en la agenda del día', async () => {
    const { cookie, unit142 } = await escenario()
    await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Agenda' }).expect(201)

    const hoy = todayInBuenosAires()
    const res = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', cookie).expect(200)
    const fila = res.body.find((r: { guestName: string }) => r.guestName === 'Exprés Agenda')
    expect(fila.inviterName).toBe(ETIQUETA)
  })

  it('en el link público, si alguien lo abre', async () => {
    const { cookie, unit142 } = await escenario()
    const creada = await request(app).post('/gate/invitations').set('Cookie', cookie)
      .send({ unitId: unit142.id, guestName: 'Exprés Público' }).expect(201).then((r) => r.body)

    const res = await request(app).get(`/invitations/public/${creada.token}`).expect(200)
    expect(res.body.inviterName).toBe(ETIQUETA)
  })

  it('una invitación normal sigue mostrando el nombre del vecino', async () => {
    const { cookie, unit142 } = await escenario()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const loginVecino = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const hoy = todayInBuenosAires()
    await request(app).post('/invitations').set('Cookie', loginVecino.headers['set-cookie']).send({
      unitId: unit142.id, kind: 'visita', guestName: 'Normal', validFrom: hoy, validTo: hoy, capacity: 1,
    }).expect(201)

    const res = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', cookie).expect(200)
    const fila = res.body.find((r: { guestName: string }) => r.guestName === 'Normal')
    expect(fila.inviterName).toBe('Martín Pérez')
  })
})
```

Agregar los imports que falten al tope del archivo:

```ts
import { eq } from 'drizzle-orm'
import { todayInBuenosAires } from '../src/lib/dates.js'
```

(`eq` puede que ya esté importado desde la Task 3; si ya está, no duplicar la línea.)

- [ ] **Step 2: Correr y ver que falla**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: FAIL — los cuatro primeros tests de este describe esperan la etiqueta y hoy reciben el nombre real del guardia.

- [ ] **Step 3: La expresión compartida, en `invitations.ts`**

En `api/src/services/invitations.ts`, agregar junto a `adentroSql` (antes de `const columnas = {`):

```ts
/**
 * Cuando quien creó la invitación es un guardia (alta exprés por teléfono),
 * se muestra esta etiqueta en vez de su nombre: no es el vecino que invita,
 * y mostrar el nombre del guardia da la impresión de que invitó él
 * personalmente a un desconocido.
 */
const nombreOEtiquetaSql = sql<string>`case when ${people.role} = 'guard' then 'Portería (autorizado por teléfono)' else ${people.name} end`
```

En `columnas`, cambiar:

```ts
  creatorName: people.name,
```

a:

```ts
  creatorName: nombreOEtiquetaSql,
```

En `findPublicByToken`, cambiar:

```ts
    inviterName: people.name,
```

a:

```ts
    inviterName: nombreOEtiquetaSql,
```

- [ ] **Step 4: Las dos consultas en SQL crudo, en `entries.ts`**

En `api/src/services/entries.ts`, función `agendaForDay`, cambiar:

```ts
      p.name              as "inviterName",
```

a:

```ts
      case when p.role = 'guard' then 'Portería (autorizado por teléfono)' else p.name end as "inviterName",
```

En la función `auditRows` (la usan tanto `auditInvitations` como `auditAll`), cambiar:

```ts
      p.name                      as "inviterName",
```

a:

```ts
      case when p.role = 'guard' then 'Portería (autorizado por teléfono)' else p.name end as "inviterName",
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd api && npx vitest run tests/alta-expres.test.ts`
Expected: PASS, los 5 tests de este describe.

Run: `cd api && npx vitest run`
Expected: PASS toda la suite — ningún test existente crea una invitación con `createdBy` de rol `guard` (todas usan `createdBy: vecino.id` o equivalente), así que la etiqueta nunca se activa en ellos.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/invitations.ts api/src/services/entries.ts api/tests/alta-expres.test.ts
git commit -m "feat: etiquetar como Portería las invitaciones creadas por un guardia"
```

---

## Task 5: Pantalla de alta exprés en la garita

**Files:**
- Modify: `web/src/lib/gate.ts`
- Modify: `web/src/lib/queries/garita.ts`
- Create: `web/src/components/garita/alta-expres.tsx`
- Modify: `web/src/components/garita/buscar-invitado.tsx`

**Interfaces:**
- Consumes: `GET /gate/units?q=` y `POST /gate/invitations` de las Tasks 1 y 2.
- Produces: `buscarUnidades(q: string): Promise<UnidadHit[]>` y `altaExpres(datos: { unitId: string; guestName: string; plate?: string }): Promise<{ id: string }>` en `web/src/lib/gate.ts`. `useBuscarUnidades(q: string)` y `useAltaExpres()` en `web/src/lib/queries/garita.ts`. Componente `AltaExpres` que recibe `{ abierto, onAbiertoChange, disparador, onCreada }`.

- [ ] **Step 1: Las funciones de API, en `gate.ts`**

En `web/src/lib/gate.ts`, agregar después del tipo `Hit`:

```ts
export type UnidadHit = { unitId: string; unitLabel: string; residentName: string }
```

Y después de `registrarEgreso`:

```ts
export const buscarUnidades = (q: string) => api<UnidadHit[]>(`/gate/units?q=${encodeURIComponent(q)}`)

export const altaExpres = (datos: { unitId: string; guestName: string; plate?: string }) =>
  api<{ id: string }>('/gate/invitations', { method: 'POST', body: JSON.stringify(datos) })
```

- [ ] **Step 2: Los hooks, en `queries/garita.ts`**

En `web/src/lib/queries/garita.ts`, cambiar el import de `'@/lib/gate'`:

```ts
import {
  porId, registrarIngreso, registrarEgreso, deshacer,
  type Hit, type Resultado,
} from '@/lib/gate'
```

a:

```ts
import {
  porId, registrarIngreso, registrarEgreso, deshacer, buscarUnidades, altaExpres,
  type Hit, type Resultado, type UnidadHit,
} from '@/lib/gate'
```

Agregar al final del archivo:

```ts
export function useBuscarUnidades(q: string) {
  return useQuery({
    queryKey: ['garita', 'unidades', q] as const,
    queryFn: () => buscarUnidades(q),
    enabled: q.length > 0,
  })
}

export function useAltaExpres() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: altaExpres,
    onError: () => toast.error('No se pudo crear la invitación. Probá de nuevo.'),
    onSuccess: () => invalidarGarita(qc),
  })
}
```

(`UnidadHit` queda importado para que `alta-expres.tsx` lo pueda re-exportar o importar directo de `@/lib/gate`; si el linter marca el tipo como no usado en este archivo, importarlo solo donde se usa — en el Step 3 se usa directo desde `@/lib/gate`, así que en este archivo alcanza con dejar `buscarUnidades, altaExpres` en el import y no `type UnidadHit` si no se lo nombra en ningún tipo de este archivo.)

- [ ] **Step 3: El componente del formulario**

Crear `web/src/components/garita/alta-expres.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Campo } from '@/components/dominio/campo'
import { Fila } from '@/components/dominio/fila'
import { useDemora } from '@/lib/use-demora'
import { useBuscarUnidades, useAltaExpres } from '@/lib/queries/garita'
import type { UnidadHit } from '@/lib/gate'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'

/**
 * El alta exprés: nombre + lote nada más. Tipo, ventana y cupo quedan fijos
 * (visita, solo hoy, una persona) — es alguien parado en la puerta ahora, no
 * una invitación a futuro.
 */
export function AltaExpres({ abierto, onAbiertoChange, disparador, onCreada }: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  disparador: HTMLButtonElement | null
  onCreada: (id: string) => void
}) {
  const [guestName, setGuestName] = useState('')
  const [unidad, setUnidad] = useState<UnidadHit | null>(null)
  const [qUnidad, setQUnidad] = useState('')
  const [plate, setPlate] = useState('')
  const qDemorada = useDemora(qUnidad)
  const unidades = useBuscarUnidades(unidad ? '' : qDemorada.trim())
  const alta = useAltaExpres()

  function cerrar(v: boolean) {
    if (!v) { setGuestName(''); setUnidad(null); setQUnidad(''); setPlate('') }
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!unidad) return
    const inv = await alta.mutateAsync({ unitId: unidad.unitId, guestName, plate: plate || undefined })
    cerrar(false)
    onCreada(inv.id)
  }

  return (
    <Sheet open={abierto} onOpenChange={cerrar}>
      {/* Lo abre un botón suelto en BuscarInvitado, no un SheetTrigger: sin
          onCloseAutoFocus, Radix manda el foco al body al cerrar. */}
      <SheetContent onCloseAutoFocus={(e) => { e.preventDefault(); disparador?.focus() }}>
        <SheetHeader>
          <SheetTitle>Autorizar sin invitación</SheetTitle>
          <SheetDescription>Para cuando el vecino aprobó por teléfono. Vale solo por hoy.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4 px-4 pb-8">
          <Campo id="nombre-expres" etiqueta="Nombre del invitado">
            <Input id="nombre-expres" required value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Campo>

          <Campo id="lote-expres" etiqueta="Lote">
            {unidad ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2">
                <span className="text-sm font-semibold">{unidad.unitLabel} · {unidad.residentName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setUnidad(null)}>Cambiar</Button>
              </div>
            ) : (
              <>
                <Input id="lote-expres" value={qUnidad} placeholder="Lote o apellido del vecino"
                  onChange={(e) => setQUnidad(e.target.value)} />
                {unidades.data && unidades.data.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-auto rounded-md border border-border">
                    {unidades.data.map((u) => (
                      <Fila key={`${u.unitId}-${u.residentName}`} titulo={u.residentName} meta={u.unitLabel}
                        onClick={() => { setUnidad(u); setQUnidad('') }} />
                    ))}
                  </div>
                )}
                {unidades.data?.length === 0 && (
                  <p className="mt-1 text-sm text-ink-soft">Sin resultados. Probá con el lote o el apellido.</p>
                )}
              </>
            )}
          </Campo>

          <Campo id="patente-expres" etiqueta="Patente (opcional)">
            <Input id="patente-expres" value={plate} className="uppercase"
              onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </Campo>

          <Button type="submit" disabled={!unidad || !guestName.trim() || alta.isPending}>
            {alta.isPending ? 'Creando…' : 'Autorizar ingreso'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: El botón, en `buscar-invitado.tsx`**

Reemplazar todo el contenido de `web/src/components/garita/buscar-invitado.tsx`:

```tsx
'use client'
import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda } from '@/lib/queries/garita'
import { AltaExpres } from './alta-expres'

/** Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos. */
export function BuscarInvitado({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('')
  const qDemorada = useDemora(q)
  const busqueda = useBusqueda(qDemorada.trim())
  const [altaAbierta, setAltaAbierta] = useState(false)
  const disparadorRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
          className="h-12 pl-10 text-base" />
      </div>

      {busqueda.data?.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">Sin resultados. Probá con el apellido o la unidad.</p>
          <button type="button" ref={disparadorRef} onClick={() => setAltaAbierta(true)}
            className="self-start text-sm font-semibold text-marca underline underline-offset-4">
            ¿No tiene invitación? Autorizar ahora
          </button>
        </div>
      )}

      {busqueda.data && busqueda.data.length > 0 && (
        <div>
          {busqueda.data.map((h) => (
            <Fila key={h.id} titulo={h.guestName} onClick={() => onAbrir(h.id)}
              meta={[h.unitLabel, h.guestDoc, h.plate].filter(Boolean).join(' · ')}
              extremo={h.adentro ? <EstadoTag estado="adentro" /> : undefined} />
          ))}
        </div>
      )}

      <AltaExpres abierto={altaAbierta} onAbiertoChange={setAltaAbierta}
        disparador={disparadorRef.current} onCreada={onAbrir} />
    </div>
  )
}
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `cd web && npx tsc --noEmit`
Expected: sin errores.

Run: `cd web && npx eslint src/lib/gate.ts src/lib/queries/garita.ts src/components/garita/alta-expres.tsx src/components/garita/buscar-invitado.tsx --max-warnings=0`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/gate.ts web/src/lib/queries/garita.ts web/src/components/garita/alta-expres.tsx web/src/components/garita/buscar-invitado.tsx
git commit -m "feat: pantalla de alta exprés en la garita"
```

---

## Task 6: Documento obligatorio en la pantalla de veredicto, y e2e

**Files:**
- Modify: `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`
- Modify: `web/e2e/garita.spec.ts`

**Interfaces:**
- Consumes: la pantalla de `AltaExpres` de la Task 5 (la navegación `onCreada`/`onAbrir` ya lleva a esta misma pantalla de veredicto).
- No produce interfaces nuevas: es un cambio de validación en una pantalla existente.

- [ ] **Step 1: Deshabilitar "Registrar ingreso" sin documento**

En `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, dentro del bloque `{ok ? (...)}`, cambiar:

```tsx
          <button ref={accionRef} onClick={registrar} disabled={registrando}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
          </button>
```

a:

```tsx
          {/* Nadie entra sin documento: si la invitación no lo traía, se carga acá. */}
          {!esEgreso && !doc.trim() && (
            <p className="text-sm font-semibold opacity-80">Hace falta el documento para registrar el ingreso.</p>
          )}
          <button ref={accionRef} onClick={registrar} disabled={registrando || (!esEgreso && !doc.trim())}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
          </button>
```

- [ ] **Step 2: Arreglar los e2e que ya registraban un ingreso sin documento**

En `web/e2e/garita.spec.ts`, en el test `'el guardia busca un invitado, registra el ingreso y lo deshace'`, cambiar:

```ts
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()

  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
```

a:

```ts
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()

  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
```

En el test `'el guardia registra el ingreso y después el egreso del mismo invitado'`, cambiar:

```ts
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
```

a:

```ts
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()
  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
```

- [ ] **Step 3: Agregar el e2e del flujo exprés completo**

Agregar a `web/e2e/garita.spec.ts`, al final del archivo:

```ts
test('el guardia da de alta una invitación exprés y el ingreso exige documento', async ({ page }) => {
  const nombre = `Exprés E2E ${Date.now()}`
  await entrar(page, 'guardia')
  await page.goto('/garita')

  await page.getByLabel('Buscar invitado').fill(nombre)
  await expect(page.getByText('Sin resultados.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '¿No tiene invitación? Autorizar ahora' }).click()

  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Lote').fill('900')
  await page.getByText('Vecina E2E').click()
  await page.getByRole('button', { name: 'Autorizar ingreso' }).click()

  await expect(page).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(page.getByText('INGRESO', { exact: true })).toBeVisible()

  // Sin documento, el botón no deja avanzar.
  await expect(page.getByRole('button', { name: 'Registrar ingreso' })).toBeDisabled()

  await page.getByLabel('Documento').fill('30999888')
  await page.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(page.getByRole('button', { name: /^Siguiente/ })).toBeVisible()
})
```

- [ ] **Step 4: Verificar tipos, lint y build**

Run: `cd web && npx tsc --noEmit && npx eslint src/app/\(garita\)/garita/invitacion/\[id\]/page.tsx --max-warnings=0 && npm run build`
Expected: sin errores, build exitoso.

- [ ] **Step 5: Correr el stack y los e2e**

Run: `docker compose up -d --build`
Run: `cd web && npx playwright test garita.spec.ts`
Expected: PASS, los 5 tests de `garita.spec.ts` (los 4 existentes, 2 de ellos ajustados, más el nuevo).

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(garita\)/garita/invitacion/\[id\]/page.tsx web/e2e/garita.spec.ts
git commit -m "fix: exigir documento en el veredicto; agregar e2e del alta exprés"
```

---

## Verificación final

Después de la Task 6, con el stack levantado (`docker compose up -d --build`):

- `cd api && npx vitest run` → todos los tests, incluidos los nuevos de `alta-expres.test.ts` y los 4 ajustados.
- `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
- `cd web && npx playwright test` → toda la suite e2e, no solo `garita.spec.ts`.
