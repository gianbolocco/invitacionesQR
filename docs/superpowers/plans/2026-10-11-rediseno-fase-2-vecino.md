# Rediseño · Fase 2 (Vecino, invitado y acceso) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer con el diseño nuevo todo lo que ven el vecino y el invitado: acceso (login, alta, olvido, reset), home, detalle como pase, nueva y editar, historial, perfil y la página pública del invitado.

**Architecture:** Next 16 App Router. Un grupo `(auth)` con un layout de tarjeta centrada y el grupo `(vecino)` con su propio encabezado (banda del barrio y barra inferior en mobile). El detalle, la edición y la creación pasan a ser rutas. Los datos van por TanStack Query con hooks por recurso en `lib/queries/invitaciones.ts`, y las mutaciones son optimistas con toasts. Se construye sobre la base de la fase 1: tokens, primitivas de shadcn y componentes de `components/dominio/`.

**Tech Stack:** Next 16.3, React 19.2, Tailwind v4, TanStack Query v5, motion, sonner, radix-ui (vía shadcn), lucide-react, qrcode.react, Playwright. API: Express 5 + Drizzle + Vitest.

Spec: `docs/superpowers/specs/2026-10-11-rediseno-ui-design.md` (secciones "Pantallas → Autenticación, Vecino, Invitado" y "Movimiento, carga y feedback").

**Desvío deliberado de la spec:** la "transición de elemento compartido fila → pase" no se puede hacer con `layoutId` entre rutas del App Router: la página de origen se desmonta antes de que monte la nueva. En su lugar, el pase entra con un resorte (escala y desplazamiento) y la navegación entre pantallas hace un fundido.

## Global Constraints

- Textos de interfaz en español rioplatense con voseo. Comentarios en español, explicando el porqué.
- Objetivos táctiles de al menos 44px (`h-11`) en todo lo que se toca.
- Ningún color de marca escrito a mano: solo tokens. Los hex de la paleta y del default solo pueden aparecer en `web/src/app/globals.css` y `web/src/lib/marca.ts` (lo controla `npm run check`).
- Toda URL de la API sale de `apiBase` o de `api()` (`web/src/lib/api.ts`). Nunca `/api/...` escrito a mano.
- `prefers-reduced-motion`: nada se desplaza; quedan solo fundidos. `MotionConfig reducedMotion="user"` ya envuelve la app y `globals.css` neutraliza las animaciones CSS.
- **Nunca** poner `transform` en un ancestro de un elemento `position: fixed` (rompe el botón flotante y la barra inferior): las transiciones de página son solo de opacidad.
- Las primitivas se importan con su archivo (`@/components/ui/button`). `@/components/ui` (sin barra) es el archivo viejo `ui.tsx`, que siguen usando garita y admin: no se toca.
- El login conserva las etiquetas "Mail" y "Contraseña" y el botón "Entrar", que usan los e2e.
- Al cerrar cada tarea: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check` limpio. Si la tarea toca `api/`: `cd api && npx tsc --noEmit && npx vitest run` verde.
- No matar procesos de Node globalmente (nunca `taskkill //IM node.exe`).
- Commits con la línea `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Stack de desarrollo: `docker compose up -d --build` desde la raíz (web en :3000, api en :8080). Cuentas de desarrollo con contraseña `smoke-test-pass-larga`: `admin@aromos.test`, `vecino.prueba@aromos.test` (Lote 142) y `guardia.prueba@aromos.test`.

## Mapa de archivos

```
api/src/services/invitations.ts          columnas compartidas, adentro/ultimoIngreso, getInvitation
api/src/routes/invitations.ts            GET /invitations/:id
api/tests/invitations.test.ts            tests nuevos y uno ajustado

web/src/lib/estado-invitacion.ts (+ .check.ts)   estado puro de una invitación
web/src/lib/invitations.ts               tipo con adentro/ultimoIngreso, datosPase, urls
web/src/lib/queries/invitaciones.ts      hooks de lectura y mutaciones
web/src/lib/use-demora.ts                debounce
web/src/lib/sesion-contexto.ts           abrirSesion()

web/src/components/selector-tema.tsx
web/src/components/campo-contrasena.tsx
web/src/components/dominio/nota.tsx      aviso en línea (error, éxito, info)
web/src/components/dominio/campo.tsx     etiqueta + control + ayuda/error
web/src/components/dominio/skeleton-filas.tsx
web/src/components/dominio/barra-seccion.tsx
web/src/components/vecino/chrome.tsx
web/src/components/vecino/fila-invitacion.tsx
web/src/components/vecino/acciones-pase.tsx
web/src/components/vecino/formulario-invitacion.tsx
web/src/components/vecino/filtros-historial.tsx

web/src/app/(auth)/layout.tsx + login/ acceso/ olvide/ reset/
web/src/app/(vecino)/layout.tsx  template.tsx  page.tsx
web/src/app/(vecino)/invitaciones/nueva/page.tsx
web/src/app/(vecino)/invitaciones/[id]/page.tsx
web/src/app/(vecino)/invitaciones/[id]/editar/page.tsx
web/src/app/(vecino)/historial/page.tsx
web/src/app/(vecino)/perfil/page.tsx
web/src/app/i/[token]/page.tsx
web/next.config.ts                       /nueva → /invitaciones/nueva
web/e2e/vecino.spec.ts, web/e2e/sesion.ts

Se borran: app/(vecino)/nueva, components/invitation-form.tsx, invitation-detail.tsx,
qr-share.tsx, guest-page.tsx, tema-flotante.tsx
```

---

### Task 1: API · detalle por id y "adentro" en la home

**Files:**
- Modify: `api/src/services/invitations.ts`, `api/src/routes/invitations.ts`
- Test: `api/tests/invitations.test.ts`

**Interfaces:**
- Produces: `GET /invitations/:id` (con sesión) → la misma forma que cada elemento de `GET /invitations`. 404 `not_found` si no existe; 403 `not_your_unit` si no es de una unidad de la persona; 400 `id_invalido` si no es uuid (lo hace `validarUuid`, que ya está en el router).
- Produces: cada invitación de `GET /invitations`, de `GET /invitations/historial` y de `GET /invitations/:id` suma `adentro: boolean` (hay un ingreso sin salida) y `ultimoIngreso: string | null` (ISO del último `entered_at`).
- Cambio de regla en `GET /invitations`: una invitación con el cupo agotado **sigue** apareciendo mientras haya alguien adentro.

- [ ] **Step 1: Tests que fallan**

En `api/tests/invitations.test.ts`, dentro de `describe('la home del vecino pide solo lo vigente', …)`, reemplazar el test `'deja afuera las vencidas, las anuladas y las que ya se usaron'` por este, que registra también la salida (si no, "Ya entró" sigue adentro y ahora debe aparecer):

```ts
  it('deja afuera las vencidas, las anuladas y las que ya se usaron y salieron', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const crear = (guestName: string, over: Record<string, unknown> = {}) =>
      request(app).post('/invitations').set('Cookie', cookie).send({
        unitId, kind: 'visita', guestName, validFrom: HOY, validTo: HOY, capacity: 1, ...over,
      }).expect(201).then((r) => r.body)

    const viva = await crear('Vigente')
    await crear('Vencida', { validFrom: dias(-10), validTo: dias(-3) })
    const anulada = await crear('Anulada')
    await request(app).post(`/invitations/${anulada.id}/revoke`).set('Cookie', cookie).expect(200)
    const usada = await crear('Ya entró')

    const g = await guardia()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: usada.id, guestName: 'Ya entró' }).expect(201)
    await request(app).post('/gate/exits').set('Cookie', g)
      .send({ invitationId: usada.id }).expect(201)

    const res = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(res.body.map((i: { guestName: string }) => i.guestName)).toEqual(['Vigente'])
    expect(res.body[0].id).toBe(viva.id)
    expect(res.body[0].adentro).toBe(false)
    expect(res.body[0].ultimoIngreso).toBeNull()

    // Pero el historial las sigue teniendo todas.
    const hist = await request(app).get('/invitations/historial').set('Cookie', cookie).expect(200)
    expect(hist.body.total).toBe(4)
  })

  it('quien está adentro sigue en la home aunque haya agotado el cupo', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Adentro', validFrom: HOY, validTo: HOY, capacity: 1,
    }).expect(201).then((r) => r.body)

    const g = await guardia()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Adentro' }).expect(201)

    const res = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].adentro).toBe(true)
    expect(typeof res.body[0].ultimoIngreso).toBe('string')
    expect(res.body[0].usedCount).toBe(1)
  })
```

Y agregar arriba del `describe`, junto a `HOY` y `dias`, el helper:

```ts
  /** Un guardia logueado, para registrar ingresos y salidas. Devuelve su cookie. */
  async function guardia() {
    const barrio = await neighborhood()
    await db.insert(people).values({
      neighborhoodId: barrio.id, email: 'guardia@example.com', name: 'Guardia',
      role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
    }).onConflictDoNothing()
    const g = await request(app).post('/auth/login')
      .send({ email: 'guardia@example.com', password: PASS })
    return g.headers['set-cookie']
  }
```

Al final del archivo, agregar:

```ts
describe('detalle de una invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('devuelve la invitación con sus datos de lista', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    const res = await request(app).get(`/invitations/${inv.id}`).set('Cookie', cookie).expect(200)
    expect(res.body.guestName).toBe('Juan')
    expect(res.body.unitLabel).toBe('Lote 142')
    expect(res.body.creatorName).toBe('martin')
    expect(res.body.usedCount).toBe(0)
    expect(res.body.adentro).toBe(false)
  })

  it('también devuelve una anulada: el detalle no es solo de las vigentes', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)
    await request(app).post(`/invitations/${inv.id}/revoke`).set('Cookie', cookie).expect(200)

    const res = await request(app).get(`/invitations/${inv.id}`).set('Cookie', cookie).expect(200)
    expect(res.body.revokedAt).not.toBeNull()
  })

  it('un vecino de otra UF no la puede ver', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const inv = await request(app).post('/invitations').set('Cookie', a.cookie).send({
      unitId: a.unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    await request(app).get(`/invitations/${inv.id}`).set('Cookie', b.cookie).expect(403)
  })

  it('una que no existe da 404', async () => {
    const { cookie } = await resident('martin@example.com', 'Lote 142')
    await request(app).get('/invitations/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookie).expect(404)
  })
})
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd api && npx vitest run tests/invitations.test.ts`
Expected: FAIL. `adentro` llega `undefined`, "Adentro" no aparece en la home, y `GET /invitations/:id` da 404 para todo (no existe la ruta).

- [ ] **Step 3: Columnas compartidas, `adentro` y `getInvitation`**

En `api/src/services/invitations.ts`, después de `assertMemberOfUnit`, agregar:

```ts
/*
 * Las columnas de una invitación tal como las ve el vecino. Las usan la home,
 * el historial y el detalle: una sola definición para que las tres pantallas
 * no se desfasen. Requiere el join con people, units y entry_log y el group by
 * de abajo.
 */
const adentroSql = sql<boolean>`coalesce(bool_or(${entryLogs.id} is not null and ${entryLogs.exitedAt} is null), false)`

const columnas = {
  id: invitations.id,
  kind: invitations.kind,
  guestName: invitations.guestName,
  guestDoc: invitations.guestDoc,
  plate: invitations.plate,
  validFrom: invitations.validFrom,
  validTo: invitations.validTo,
  weekdays: invitations.weekdays,
  capacity: invitations.capacity,
  token: invitations.token,
  revokedAt: invitations.revokedAt,
  createdAt: invitations.createdAt,
  createdBy: invitations.createdBy,
  creatorName: people.name,
  unitId: invitations.unitId,
  unitLabel: units.label,
  usedCount: count(entryLogs.id),
  // Hay un ingreso sin salida: la persona está en el barrio ahora.
  adentro: adentroSql,
  ultimoIngreso: sql<Date | null>`max(${entryLogs.enteredAt})`,
}

function consultaInvitaciones() {
  return db.select(columnas)
    .from(invitations)
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(units, eq(units.id, invitations.unitId))
    .leftJoin(entryLogs, eq(entryLogs.invitationId, invitations.id))
    .$dynamic()
}
```

Reemplazar el cuerpo de `listForUnits` (desde `return db.select({` hasta el `.orderBy(...)` final) por:

```ts
  return consultaInvitaciones()
    .where(and(
      inArray(invitations.unitId, unitIds),
      isNull(invitations.revokedAt),
      gte(invitations.validTo, hoy),
    ))
    .groupBy(invitations.id, people.name, units.label)
    // El cupo se mide sobre el count de ingresos, así que va en HAVING. Quien
    // está adentro sigue en la home aunque haya agotado el cupo: es justo lo
    // que el vecino quiere ver ("ya llegó").
    .having(sql`count(${entryLogs.id}) < ${invitations.capacity} or ${adentroSql}`)
    .orderBy(desc(invitations.createdAt))
```

y actualizar el comentario de `listForUnits` para que diga que "vigente" incluye a quien está adentro.

En `searchInvitations`, reemplazar el `db.select({ … }).from(invitations).innerJoin(…).innerJoin(…).leftJoin(…)` de la consulta de filas por `consultaInvitaciones()`, dejando igual el `.where(donde).groupBy(…).orderBy(…).limit(…).offset(…)`.

El tipo `HistoryPage['rows']` sigue siendo `Awaited<ReturnType<typeof listForUnits>>`; no hace falta cambiarlo.

Al final de la sección de lectura (antes de `revokeInvitation`), agregar:

```ts
/**
 * Una invitación, con lo mismo que muestra la lista. Cualquier estado: el
 * detalle se abre también desde el historial (anuladas, vencidas, usadas).
 * Solo para quien es de la unidad.
 */
export async function getInvitation(id: string, personId: string) {
  const [row] = await consultaInvitaciones()
    .where(eq(invitations.id, id))
    .groupBy(invitations.id, people.name, units.label)
    .limit(1)
  if (!row) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, row.unitId)
  return row
}
```

- [ ] **Step 4: La ruta**

En `api/src/routes/invitations.ts`, importar `getInvitation` y agregar, **después** de la ruta `GET /historial` (así `/historial` no cae en `/:id`):

```ts
/** El detalle de una invitación, para la pantalla del pase. */
invitationRoutes.get('/:id', async (req, res) => {
  res.json(await getInvitation(req.params.id, req.person!.id))
})
```

- [ ] **Step 5: Correr todo**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: PASS. 247 tests: los 242 de antes, más 2 en la home (uno reemplazado y uno nuevo) y 4 de detalle.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/invitations.ts api/src/routes/invitations.ts api/tests/invitations.test.ts
git commit -m "feat: detalle de invitacion por id y quien esta adentro en la home"
```

---

### Task 2: Estado de una invitación y helpers puros

**Files:**
- Create: `web/src/lib/estado-invitacion.ts`, `web/src/lib/estado-invitacion.check.ts`
- Modify: `web/src/lib/invitations.ts`, `web/package.json` (script `check`)

**Interfaces:**
- Consumes: la forma de la API de la Tarea 1.
- Produces (en `@/lib/estado-invitacion`): `type EstadoVecino = 'adentro' | 'esperando' | 'salio' | 'anulada' | 'vencida'` y `estadoInvitacion(inv: { kind: string; revokedAt: string | null; validTo: string; usedCount: number; adentro: boolean }, hoy: string): EstadoVecino`. Cada valor es también un `Estado` válido de `EstadoTag`.
- Produces (en `@/lib/invitations`):
  - `Invitation` suma `adentro: boolean` y `ultimoIngreso: string | null`
  - `vigencia(v: { validFrom: string; validTo: string; weekdays: number[] | null }): string`
  - `datosPase(inv: Invitation): DatosPase`
  - `urlPublica(token: string): string`
  - `urlVolverAInvitar(inv: Pick<Invitation, 'kind' | 'guestName' | 'guestDoc' | 'plate'>): string`

- [ ] **Step 1: El chequeo que falla**

Crear `web/src/lib/estado-invitacion.check.ts`:

```ts
/** `node src/lib/estado-invitacion.check.ts`. */
import assert from 'node:assert/strict'
import { estadoInvitacion } from './estado-invitacion.ts'

const HOY = '2026-10-11'
const base = { kind: 'visita', revokedAt: null, validTo: HOY, usedCount: 0, adentro: false }

assert.equal(estadoInvitacion(base, HOY), 'esperando')
// Anulada gana sobre todo, también sobre estar adentro: es lo que hay que saber.
assert.equal(estadoInvitacion({ ...base, revokedAt: '2026-10-11T10:00:00Z', adentro: true }, HOY), 'anulada')
assert.equal(estadoInvitacion({ ...base, adentro: true, usedCount: 1 }, HOY), 'adentro')
assert.equal(estadoInvitacion({ ...base, usedCount: 1 }, HOY), 'salio')
assert.equal(estadoInvitacion({ ...base, validTo: '2026-10-10' }, HOY), 'vencida')
// Una frecuente que ya entró y salió sigue esperando el próximo ingreso.
assert.equal(estadoInvitacion({ ...base, kind: 'frecuente', usedCount: 5 }, HOY), 'esperando')
// Una visita usada de un día que ya pasó cuenta como que salió, no como vencida.
assert.equal(estadoInvitacion({ ...base, validTo: '2026-10-01', usedCount: 1 }, HOY), 'salio')

console.log('estado-invitacion: ok')
```

En `web/package.json`, el script `check` pasa a:

```json
    "check": "node src/lib/nav.check.ts && node src/lib/fechas.check.ts && node src/lib/estado-invitacion.check.ts && node scripts/colores.check.mjs",
```

Run: `cd web && npm run check`
Expected: FAIL con `Cannot find module` para `estado-invitacion.ts`.

- [ ] **Step 2: Implementar**

Crear `web/src/lib/estado-invitacion.ts` (sin imports, así Node lo corre directo):

```ts
export type EstadoVecino = 'adentro' | 'esperando' | 'salio' | 'anulada' | 'vencida'

/**
 * En qué está una invitación, para la etiqueta de la fila y del detalle.
 *
 * El orden importa: anulada gana sobre todo; después, si alguien está adentro
 * es lo único que importa; una visita ya usada "salió" aunque su día haya
 * pasado; y una frecuente nunca "sale", espera el próximo ingreso.
 */
export function estadoInvitacion(
  inv: { kind: string; revokedAt: string | null; validTo: string; usedCount: number; adentro: boolean },
  hoy: string,
): EstadoVecino {
  if (inv.revokedAt) return 'anulada'
  if (inv.adentro) return 'adentro'
  if (inv.kind !== 'frecuente' && inv.usedCount > 0) return 'salio'
  if (inv.validTo < hoy) return 'vencida'
  return 'esperando'
}
```

Run: `cd web && npm run check`
Expected: `nav: ok`, `fechas: ok`, `estado-invitacion: ok` y `colores: ok`.

- [ ] **Step 3: Tipo y helpers en `invitations.ts`**

Reemplazar todo `web/src/lib/invitations.ts` por:

```ts
import { hoyISO, fechaCorta } from './fechas'
import type { DatosPase } from '@/components/dominio/pase'
export { hoyISO, fechaCorta } from './fechas'

export type Invitation = {
  id: string
  kind: 'visita' | 'frecuente' | 'proveedor'
  guestName: string
  guestDoc: string | null
  plate: string | null
  validFrom: string
  validTo: string
  weekdays: number[] | null
  capacity: number
  token: string
  revokedAt: string | null
  createdAt: string
  createdBy: string
  creatorName: string
  unitId: string
  unitLabel: string
  usedCount: number
  /** Hay un ingreso sin salida: está en el barrio ahora. */
  adentro: boolean
  /** ISO del último ingreso, o null si nunca entró. */
  ultimoIngreso: string | null
}

export const KIND_LABEL: Record<Invitation['kind'], string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  proveedor: 'Proveedor',
}

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** "Hoy", "14 sept" o "11 oct a 9 ene · Lun Mié Vie". Sirve para la lista y para el invitado. */
export function vigencia(v: { validFrom: string; validTo: string; weekdays: number[] | null }): string {
  if (v.validFrom === v.validTo) {
    return v.validFrom === hoyISO() ? 'Hoy' : fechaCorta(v.validFrom)
  }
  const dias = v.weekdays?.length ? ` · ${v.weekdays.map((d) => DIAS[d]).join(' ')}` : ''
  return `${fechaCorta(v.validFrom)} a ${fechaCorta(v.validTo)}${dias}`
}

/** Los datos que muestra el pase del vecino. */
export function datosPase(inv: Invitation): DatosPase {
  return {
    tipo: KIND_LABEL[inv.kind],
    vigencia: vigencia(inv),
    invitado: inv.guestName,
    unidad: inv.unitLabel,
    invita: inv.creatorName,
  }
}

/**
 * El link que recibe el invitado. Sale del origen de la página: la misma app
 * sirve en cualquier dominio. Solo se llama en el navegador.
 */
export function urlPublica(token: string): string {
  const origen = typeof window === 'undefined' ? '' : window.location.origin
  return `${origen}/i/${token}`
}

/** "Volver a invitar": el formulario nuevo precargado con los datos de esta. */
export function urlVolverAInvitar(inv: Pick<Invitation, 'kind' | 'guestName' | 'guestDoc' | 'plate'>): string {
  const p = new URLSearchParams({ kind: inv.kind, guestName: inv.guestName })
  if (inv.guestDoc) p.set('guestDoc', inv.guestDoc)
  if (inv.plate) p.set('plate', inv.plate)
  return `/invitaciones/nueva?${p}`
}
```

- [ ] **Step 4: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio. Si alguna pantalla vieja no compila porque construye un `Invitation` a mano, corregirla agregando `adentro: false, ultimoIngreso: null` (no debería pasar: todas lo reciben de la API).

```bash
git add web/src/lib web/package.json
git commit -m "feat: estado de una invitacion y helpers del pase"
```

---

### Task 3: Datos de invitaciones con TanStack Query

**Files:**
- Create: `web/src/lib/queries/invitaciones.ts`, `web/src/lib/use-demora.ts`

**Interfaces:**
- Consumes: `api`, `ApiError` (`@/lib/api`); `Invitation` (`@/lib/invitations`); `toast` de `sonner`.
- Produces (en `@/lib/queries/invitaciones`):
  - `claves = { todas, vigentes, una(id), historial(f) }`
  - `type FiltrosHistorial = { q: string; kind: '' | Invitation['kind']; estado: '' | 'entro' | 'no_entro' | 'anulada'; soloMias: boolean }`
  - `type DatosInvitacion = { kind: Invitation['kind']; guestName: string; guestDoc: string | null; plate: string | null; validFrom: string; validTo: string; weekdays: number[] | null; capacity: number }`
  - `useInvitaciones()` → `UseQueryResult<Invitation[]>`
  - `useInvitacion(id: string)` → `UseQueryResult<Invitation>`
  - `useHistorial(f: FiltrosHistorial)` → infinite query de `PaginaHistorial` (`{ rows: Invitation[]; total: number; page: number; pageSize: number }`)
  - `useCrearInvitacion()` → mutación con `(d: DatosInvitacion & { unitId: string }) => Invitation`. Ojo: la respuesta del POST no trae `unitLabel`, `creatorName`, `usedCount` ni `adentro`; sirve solo para tomar el `id`.
  - `useEditarInvitacion(id: string)` → mutación con `(d: DatosInvitacion) => Invitation`
  - `useAnularInvitacion()` → mutación con `(inv: Invitation) => unknown`, optimista sobre las vigentes, con un toast que trae "Deshacer"
  - `useRestaurarInvitacion()` → mutación con `(inv: Invitation) => unknown`
- Produces (en `@/lib/use-demora`): `useDemora<T>(valor: T, ms?: number): T`.

- [ ] **Step 1: `useDemora`**

Crear `web/src/lib/use-demora.ts`:

```ts
'use client'
import { useEffect, useState } from 'react'

/**
 * El valor, pero `ms` después de que dejó de cambiar. Para el buscador: el
 * vecino tipea "martin" y eso son seis teclas, no seis búsquedas.
 */
export function useDemora<T>(valor: T, ms = 300): T {
  const [demorado, setDemorado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return demorado
}
```

- [ ] **Step 2: Hooks de invitaciones**

Crear `web/src/lib/queries/invitaciones.ts`:

```ts
'use client'
import {
  keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Invitation } from '@/lib/invitations'

export type FiltrosHistorial = {
  q: string
  kind: '' | Invitation['kind']
  estado: '' | 'entro' | 'no_entro' | 'anulada'
  soloMias: boolean
}

export type DatosInvitacion = {
  kind: Invitation['kind']
  guestName: string
  guestDoc: string | null
  plate: string | null
  validFrom: string
  validTo: string
  weekdays: number[] | null
  capacity: number
}

type PaginaHistorial = { rows: Invitation[]; total: number; page: number; pageSize: number }

const POR_PAGINA = 20

/*
 * Todas cuelgan de ['invitaciones']: después de cualquier cambio se invalida
 * ese prefijo y la home, el detalle y el historial se ponen al día juntos.
 */
export const claves = {
  todas: ['invitaciones'] as const,
  vigentes: ['invitaciones', 'vigentes'] as const,
  una: (id: string) => ['invitaciones', 'una', id] as const,
  historial: (f: FiltrosHistorial) => ['invitaciones', 'historial', f] as const,
}

export function useInvitaciones() {
  return useQuery({
    queryKey: claves.vigentes,
    queryFn: ({ signal }) => api<Invitation[]>('/invitations', { signal }),
  })
}

export function useInvitacion(id: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: claves.una(id),
    queryFn: ({ signal }) => api<Invitation>(`/invitations/${id}`, { signal }),
    // Si la home ya la tiene, el pase aparece al instante mientras llega la fresca.
    placeholderData: () => qc.getQueryData<Invitation[]>(claves.vigentes)?.find((i) => i.id === id),
  })
}

export function useHistorial(f: FiltrosHistorial) {
  return useInfiniteQuery({
    queryKey: claves.historial(f),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ page: String(pageParam), pageSize: String(POR_PAGINA) })
      if (f.q.trim()) p.set('q', f.q.trim())
      if (f.kind) p.set('kind', f.kind)
      if (f.estado) p.set('estado', f.estado)
      if (f.soloMias) p.set('soloMias', 'true')
      return api<PaginaHistorial>(`/invitations/historial?${p}`, { signal })
    },
    getNextPageParam: (ultima) =>
      ultima.page * ultima.pageSize < ultima.total ? ultima.page + 1 : undefined,
    // Al cambiar un filtro, la lista anterior queda visible (atenuada) en vez
    // de saltar al skeleton en cada tecla.
    placeholderData: keepPreviousData,
  })
}

export function useCrearInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosInvitacion & { unitId: string }) =>
      api<Invitation>('/invitations', {
        method: 'POST',
        // La API valida opcionales con `optional()`: undefined, nunca null.
        body: JSON.stringify({
          ...d,
          guestDoc: d.guestDoc ?? undefined,
          plate: d.plate ?? undefined,
          weekdays: d.weekdays ?? undefined,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

export function useEditarInvitacion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosInvitacion) =>
      api<Invitation>(`/invitations/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

export function useRestaurarInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inv: Invitation) => api(`/invitations/${inv.id}/restore`, { method: 'POST' }),
    onSuccess: (_r, inv) => toast.success(`La invitación de ${inv.guestName} vuelve a estar vigente`),
    onError: () => toast.error('No se pudo volver a habilitar. Probá de nuevo.'),
    onSettled: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}

/**
 * Anular es optimista: la fila se va al toque y vuelve sola si el servidor
 * falla. El toast trae "Deshacer", que es lo que se busca justo después de
 * tocar algo por error.
 */
export function useAnularInvitacion() {
  const qc = useQueryClient()
  const restaurar = useRestaurarInvitacion()
  return useMutation({
    mutationFn: (inv: Invitation) => api(`/invitations/${inv.id}/revoke`, { method: 'POST' }),
    onMutate: async (inv) => {
      await qc.cancelQueries({ queryKey: claves.vigentes })
      const antes = qc.getQueryData<Invitation[]>(claves.vigentes)
      qc.setQueryData<Invitation[]>(claves.vigentes, (l) => l?.filter((i) => i.id !== inv.id))
      return { antes }
    },
    onError: (_e, _inv, ctx) => {
      if (ctx?.antes) qc.setQueryData(claves.vigentes, ctx.antes)
      toast.error('No se pudo anular. Probá de nuevo.')
    },
    onSuccess: (_r, inv) => {
      toast.success(`Anulaste la invitación de ${inv.guestName}`, {
        action: { label: 'Deshacer', onClick: () => restaurar.mutate(inv) },
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: claves.todas }),
  })
}
```

- [ ] **Step 3: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio. Estos hooks todavía no los usa nadie: se prueban de punta a punta en las tareas 6 a 10 y en los e2e.

```bash
git add web/src/lib/queries web/src/lib/use-demora.ts
git commit -m "feat: hooks de invitaciones con cache, historial infinito y anular optimista"
```

---

### Task 4: Acceso (login, alta, olvido y reset)

**Files:**
- Create: `web/src/components/selector-tema.tsx`, `web/src/components/campo-contrasena.tsx`, `web/src/components/dominio/nota.tsx`, `web/src/components/dominio/campo.tsx`, `web/src/app/(auth)/layout.tsx`
- Move + rewrite (con `git mv`): `app/login`, `app/acceso`, `app/olvide`, `app/reset` → `app/(auth)/`
- Modify: `web/src/lib/sesion-contexto.ts` (`abrirSesion`), `web/e2e/sesion.ts`

**Interfaces:**
- Consumes: `Marca` (`@/components/dominio/marca`), `Vacio`, `Button`/`buttonVariants`, `Input`, `Label`, `useTema` (`@/lib/theme`), `homeFor`/`Me` (`@/lib/session`), `claveSesion`.
- Produces:
  - `abrirSesion(qc: QueryClient, yo: Me): void` en `@/lib/sesion-contexto`. Descarta las queries de una sesión anterior **salvo `['marca']`** y deja la sesión nueva en caché.
  - `SelectorTema({ className?: string })`: los tres temas en botones de 44px.
  - `CampoContrasena({ id, value, onChange, autoComplete, medidor?, required? })`: contraseña con mostrar/ocultar y, opcional, un medidor de largo (mínimo 10).
  - `Nota({ tono: 'error' | 'exito' | 'info'; children })`: aviso en línea (`role="alert"` si es error, si no `role="status"`).
  - `Campo({ id, etiqueta, ayuda?, error?, children, accesorio? })`: etiqueta + control + ayuda o error. El error reemplaza a la ayuda. `accesorio` va a la derecha de la etiqueta.

- [ ] **Step 1: `abrirSesion`**

En `web/src/lib/sesion-contexto.ts`, agregar `import type { QueryClient } from '@tanstack/react-query'` y al final:

```ts
/**
 * Lo que hace cada pantalla de acceso al entrar: tira todo lo cacheado de una
 * sesión anterior (otra persona en la misma tablet no ve datos ajenos) MENOS
 * la marca, que es del barrio y no de la persona, y deja la sesión nueva lista
 * para que el layout no la vuelva a pedir.
 */
export function abrirSesion(qc: QueryClient, yo: Me): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'marca' })
  qc.setQueryData(claveSesion, yo)
}
```

- [ ] **Step 2: Componentes compartidos**

Crear `web/src/components/dominio/nota.tsx`:

```tsx
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Un aviso en línea, al lado de lo que lo provocó. Los errores dicen qué
 * hacer, no qué pasó. `role="alert"` para que el lector de pantalla lo diga
 * sin que haya que ir a buscarlo.
 */
export function Nota({ tono, children, className }: {
  tono: 'error' | 'exito' | 'info'
  children: React.ReactNode
  className?: string
}) {
  const Icono = { error: CircleAlert, exito: CircleCheck, info: Info }[tono]
  return (
    <p role={tono === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm animate-in fade-in duration-300', {
        error: 'bg-peligro/10 text-peligro',
        exito: 'bg-marca-suave text-marca-deep dark:text-marca',
        info: 'bg-surface-sunk text-ink',
      }[tono], className)}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
```

Crear `web/src/components/dominio/campo.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/**
 * Etiqueta, control y una línea abajo: la ayuda, o el error si lo hay. El
 * control lo pone quien llama, con `id={id}` y, si hay error,
 * `aria-invalid` y `aria-describedby={`${id}-nota`}`.
 */
export function Campo({ id, etiqueta, ayuda, error, accesorio, children }: {
  id: string
  etiqueta: string
  ayuda?: ReactNode
  error?: string | null
  accesorio?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-semibold">{etiqueta}</Label>
        {accesorio}
      </div>
      {children}
      {error ? (
        <p id={`${id}-nota`} role="alert" className="text-sm text-peligro animate-in fade-in duration-200">{error}</p>
      ) : ayuda ? (
        <p id={`${id}-nota`} className="text-sm text-ink-soft">{ayuda}</p>
      ) : null}
    </div>
  )
}
```

Crear `web/src/components/selector-tema.tsx`:

```tsx
'use client'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema, type Tema } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPCIONES: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
  { valor: 'claro', etiqueta: 'Claro', icono: Sun },
  { valor: 'sistema', etiqueta: 'Automático', icono: Monitor },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
]

/**
 * Tres estados y no dos: "Automático" sigue al celular, que de noche se pone
 * oscuro solo. Botones de 44px: se toca con el pulgar.
 */
export function SelectorTema({ className }: { className?: string }) {
  const [tema, setTema] = useTema()
  return (
    <div role="radiogroup" aria-label="Tema"
      className={cn('inline-flex rounded-full border border-line bg-card p-0.5', className)}>
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <button key={valor} type="button" role="radio" aria-checked={tema === valor}
          title={etiqueta} onClick={() => setTema(valor)}
          className={cn('grid size-11 place-items-center rounded-full transition-colors duration-150',
            tema === valor ? 'bg-marca text-sobre-marca' : 'text-ink-soft hover:text-ink')}>
          <Icono className="size-[18px]" aria-hidden />
          <span className="sr-only">{etiqueta}</span>
        </button>
      ))}
    </div>
  )
}
```

Crear `web/src/components/campo-contrasena.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const MINIMO = 10

/**
 * Contraseña con mostrar/ocultar: en el celular, tipear diez caracteres a
 * ciegas es la principal causa de "no me deja entrar". El medidor cuenta
 * largo, que es la única regla que hay; no pide símbolos raros.
 */
export function CampoContrasena({ id, value, onChange, autoComplete, medidor = false, required, invalido }: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  medidor?: boolean
  required?: boolean
  invalido?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const faltan = Math.max(0, MINIMO - value.length)
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
          required={required} value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalido || undefined} aria-describedby={`${id}-nota`} className="pr-12" />
        <button type="button" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-ink-soft hover:text-ink">
          {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      </div>
      {medidor && (
        <div className="flex items-center gap-3" aria-live="polite">
          <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunk">
            <span className={cn('block h-full rounded-full transition-[width,background-color] duration-300',
              faltan === 0 ? 'bg-marca' : 'bg-ink-soft/50')}
              style={{ width: `${Math.min(100, (value.length / MINIMO) * 100)}%` }} />
          </span>
          <span className="shrink-0 text-xs text-ink-soft tabular">
            {faltan === 0 ? 'Lista' : `Faltan ${faltan}`}
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Layout del grupo**

Crear `web/src/app/(auth)/layout.tsx`:

```tsx
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'

/**
 * Las pantallas de acceso: la marca del barrio arriba y una sola tarjeta. Un
 * halo del color del barrio detrás le da identidad sin meter ruido.
 */
export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96
        bg-[radial-gradient(60%_100%_at_50%_0%,var(--marca-suave),transparent)]" />
      <SelectorTema className="absolute right-4 top-4" />
      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-8 flex justify-center"><Marca variante="grande" /></div>
        <div className="rounded-xl border border-line bg-card p-6 shadow-fila sm:p-8">{children}</div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Mover las páginas**

Run:
```bash
cd web/src/app && mkdir -p "(auth)" && git mv login "(auth)/login" && git mv acceso "(auth)/acceso" && git mv olvide "(auth)/olvide" && git mv reset "(auth)/reset"
```

- [ ] **Step 5: Login**

Reemplazar `web/src/app/(auth)/login/page.tsx` por:

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api, ApiError, apiBase } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { abrirSesion } from '@/lib/sesion-contexto'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { CampoContrasena } from '@/components/campo-contrasena'
import { cn } from '@/lib/utils'

const ERROR_GOOGLE: Record<string, string> = {
  not_in_padron: 'Ese mail no está en el padrón del barrio. Pedile el alta a la administración.',
  email_not_verified: 'Google no confirmó ese mail, así que no podemos vincularlo. Entrá con tu contraseña.',
  // Pestaña vieja o un link de vuelta de Google que no arrancó acá: el
  // remedio es empezar de nuevo desde esta pantalla.
  state_invalido: 'Ese intento de entrar con Google ya venció. Volvé a tocar el botón desde acá.',
  google_not_configured: 'El ingreso con Google no está habilitado. Entrá con tu contraseña.',
  google_failed: 'No se pudo entrar con Google. Probá con tu contraseña.',
}

function IconoGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function Login() {
  const router = useRouter()
  const qc = useQueryClient()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    api<{ enabled: boolean }>('/auth/google/enabled')
      .then((r) => setGoogle(r.enabled))
      .catch(() => {})
  }, [])

  // El error de Google ya está en la URL cuando la página se pinta.
  const errorParam = params.get('error')
  const mensaje = error ?? (errorParam ? ERROR_GOOGLE[errorParam] ?? ERROR_GOOGLE.google_failed : null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? 'Demasiados intentos. Esperá 15 minutos o restablecé tu contraseña.'
        : 'El mail o la contraseña no coinciden. Revisalos e intentá de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Entrá a tu barrio</h1>
        <p className="mt-1 text-sm text-ink-soft">Con el mail con el que te dieron de alta.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <Campo id="mail" etiqueta="Mail">
          <Input id="mail" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="clave" etiqueta="Contraseña"
          accesorio={<Link href="/olvide" className="text-sm font-medium text-marca hover:underline">¿La olvidaste?</Link>}>
          <CampoContrasena id="clave" autoComplete="current-password" required
            value={password} onChange={setPassword} />
        </Campo>
        {mensaje && <Nota tono="error">{mensaje}</Nota>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>

      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
          </div>
          <a href={`${apiBase}/auth/google`} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
            <IconoGoogle />
            Continuar con Google
          </a>
        </>
      )}
    </div>
  )
}

export default function LoginPage() {
  return <Suspense fallback={null}><Login /></Suspense>
}
```

Los colores de Google en `IconoGoogle` no son de la paleta del barrio: son los del logo de Google, que no se puede recolorear.

- [ ] **Step 6: Alta con link**

Reemplazar `web/src/app/(auth)/acceso/page.tsx` por:

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Link2Off, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { abrirSesion } from '@/lib/sesion-contexto'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { CampoContrasena } from '@/components/campo-contrasena'

function Acceso() {
  const router = useRouter()
  const qc = useQueryClient()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [lot, setLot] = useState('')
  const [needsLot, setNeedsLot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // GET solo mira el token: si el escáner de links del mail pasa por acá, no
  // consume nada y la invitación sigue sirviendo.
  useEffect(() => {
    if (!token) return
    api<{ name: string }>(`/auth/invite/${token}`)
      .then((r) => setName(r.name))
      .catch(() => setFallo(true))
    api<{ needsLot: boolean }>(`/auth/invite/${token}/needs-lot`)
      .then((r) => setNeedsLot(r.needsLot))
      .catch(() => {})
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    if (needsLot && !lot.trim()) { setError('Escribí el número de tu lote.'); return }
    setBusy(true)
    setError(null)
    try {
      await api('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ token, password, lot: needsLot ? Number(lot) : undefined }),
      })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch {
      setError('Este link ya se usó o venció. Pedile a la administración que te lo reenvíe.')
      setBusy(false)
    }
  }

  if (!token || fallo) {
    return (
      <Vacio icono={Link2Off} titulo="Este link no sirve"
        detalle="Ya se usó o pasaron los 7 días. Pedile a la administración que te reenvíe la invitación."
        accion={<Link href="/login" className={buttonVariants({ variant: 'outline' })}>Ir a entrar</Link>} />
    )
  }

  if (!name) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Hola, {name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {needsLot
            ? 'Decinos tu lote y elegí una contraseña. Con eso ya podés invitar.'
            : 'Elegí una contraseña y ya podés gestionar las visitas de tu casa.'}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {needsLot && (
          <Campo id="lote" etiqueta="Número de lote" ayuda="Solo el número. Después solo la administración puede cambiarlo.">
            <Input id="lote" required value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142"
              className="tabular" aria-describedby="lote-nota"
              onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
        <Campo id="clave" etiqueta="Contraseña">
          <CampoContrasena id="clave" autoComplete="new-password" medidor required
            value={password} onChange={setPassword} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? 'Entrando…' : 'Crear contraseña y entrar'}
        </Button>
      </form>
    </div>
  )
}

export default function AccesoPage() {
  return <Suspense fallback={null}><Acceso /></Suspense>
}
```

- [ ] **Step 7: Olvido y reset**

Reemplazar `web/src/app/(auth)/olvide/page.tsx` por:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { Vacio } from '@/components/dominio/vacio'

export default function OlvidePage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
    // Mismo mensaje pase lo que pase: no se filtra si el mail está en el padrón.
    setSent(true)
  }

  if (sent) {
    return (
      <Vacio icono={MailCheck} titulo="Revisá tu mail"
        detalle="Si ese mail está en el padrón, te mandamos un link para elegir una contraseña nueva. Vence en 15 minutos."
        accion={<Link href="/login" className={buttonVariants({ variant: 'outline' })}>Volver a entrar</Link>} />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-ink-soft">Te mandamos un link al mail que tenés en el padrón.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Campo id="mail" etiqueta="Mail">
          <Input id="mail" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Enviar link
        </Button>
      </form>
      <Link href="/login" className={buttonVariants({ variant: 'ghost', className: 'self-start' })}>
        <ArrowLeft aria-hidden />Volver
      </Link>
    </div>
  )
}
```

Reemplazar `web/src/app/(auth)/reset/page.tsx` por:

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Link2Off, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { abrirSesion } from '@/lib/sesion-contexto'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { CampoContrasena } from '@/components/campo-contrasena'

function Reset() {
  const router = useRouter()
  const qc = useQueryClient()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Igual que en /acceso: el GET mira, el POST consume.
  useEffect(() => {
    if (!token) return
    api<{ name: string }>(`/auth/reset/${token}`)
      .then((r) => setName(r.name))
      .catch(() => setFallo(true))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    setBusy(true)
    setError(null)
    try {
      await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch {
      setError('Este link ya se usó o venció. Pedí uno nuevo desde "Olvidé mi contraseña".')
      setBusy(false)
    }
  }

  if (!token || fallo) {
    return (
      <Vacio icono={Link2Off} titulo="Este link no sirve"
        detalle="Los links de contraseña duran 15 minutos. Pedí uno nuevo."
        accion={<Link href="/olvide" className={buttonVariants()}>Pedir otro link</Link>} />
    )
  }

  if (!name) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-4 h-11 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Nueva contraseña, {name.split(' ')[0]}</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Campo id="clave" etiqueta="Contraseña">
          <CampoContrasena id="clave" autoComplete="new-password" medidor required
            value={password} onChange={setPassword} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </Button>
      </form>
    </div>
  )
}

export default function ResetPage() {
  return <Suspense fallback={null}><Reset /></Suspense>
}
```

- [ ] **Step 8: El helper de e2e no choca con "Mostrar contraseña"**

En `web/e2e/sesion.ts`, cambiar `page.getByLabel('Contraseña')` por `page.getByLabel('Contraseña', { exact: true })`. Sin `exact`, Playwright también matchea el botón "Mostrar contraseña".

- [ ] **Step 9: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build sigue listando `/login`, `/acceso`, `/olvide` y `/reset`.

Run: `cd .. && docker compose up -d --build web && cd web && npm run e2e`
Expected: 12 passed (los de la fase 1 siguen entrando por el login nuevo).

- [ ] **Step 10: Commit**

```bash
git add -A web/src web/e2e
git commit -m "feat: pantallas de acceso con la marca del barrio, contrasena visible y medidor"
```

---

### Task 5: Encabezado del vecino, barra inferior y perfil

**Files:**
- Create: `web/src/components/dominio/barra-seccion.tsx`, `web/src/components/vecino/chrome.tsx`, `web/src/app/(vecino)/template.tsx`, `web/src/app/(vecino)/perfil/page.tsx`
- Modify: `web/src/app/(vecino)/layout.tsx`

**Interfaces:**
- Consumes: `useSesion` (`@/lib/sesion-contexto`), `Marca`, `SelectorTema` (Tarea 4), `logout` (`@/lib/session`), `EncabezadoPagina`, `buttonVariants`.
- Produces:
  - `type ItemBarra = { href: string; etiqueta: string; icono: LucideIcon; activo: boolean }`
  - `BarraSeccion({ items: ItemBarra[]; central?: ReactNode })`: barra inferior fija en mobile (`sm:hidden`). `central` es un slot para un botón en el medio, que va a usar la garita en la fase 3.
  - `ChromeVecino({ children })`: banda del barrio + navegación + barra inferior + `<main>`.
  - Alto que ocupa la barra inferior: `4.5rem + env(safe-area-inset-bottom)`. Lo flotante que tiene que quedar arriba de la barra usa `bottom-[calc(5.25rem+env(safe-area-inset-bottom))]`.
- Nota: hasta que las tareas 6 a 8 reemplacen las pantallas, la home, el historial y "nueva" muestran dos encabezados (el nuevo y el `Shell` viejo). Es transitorio y no se despliega así.

- [ ] **Step 1: `BarraSeccion`**

Crear `web/src/components/dominio/barra-seccion.tsx`:

```tsx
'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export type ItemBarra = { href: string; etiqueta: string; icono: LucideIcon; activo: boolean }

/**
 * La barra de abajo en el celular: pocos destinos, siempre a la vista y donde
 * llega el pulgar. El indicador de la sección activa se desliza en vez de
 * saltar. `central` deja un lugar en el medio para una acción grande.
 */
export function BarraSeccion({ items, central }: { items: ItemBarra[]; central?: ReactNode }) {
  const mitad = Math.ceil(items.length / 2)
  const render = (item: ItemBarra) => {
    const Icono = item.icono
    return (
      <Link key={item.href} href={item.href} aria-current={item.activo ? 'page' : undefined}
        className={cn('relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
          'transition-colors duration-150', item.activo ? 'text-marca' : 'text-ink-soft')}>
        {item.activo && (
          <motion.span layoutId="barra-activa" aria-hidden
            className="absolute top-0 h-0.5 w-10 rounded-full bg-marca"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
        )}
        <Icono className="size-[22px]" aria-hidden />
        {item.etiqueta}
      </Link>
    )
  }
  return (
    <nav aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {central ? (
        <>
          {items.slice(0, mitad).map(render)}
          <div className="flex flex-1 items-center justify-center">{central}</div>
          {items.slice(mitad).map(render)}
        </>
      ) : items.map(render)}
    </nav>
  )
}
```

- [ ] **Step 2: `ChromeVecino`**

Crear `web/src/components/vecino/chrome.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, Ticket, UserRound } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { Marca } from '@/components/dominio/marca'
import { BarraSeccion, type ItemBarra } from '@/components/dominio/barra-seccion'
import { cn } from '@/lib/utils'

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

/**
 * El marco de la sección del vecino: la banda con el color del barrio arriba,
 * la navegación (arriba en pantalla ancha, abajo en el celular) y el contenido.
 * Se monta una vez para toda la sección: navegar no lo vuelve a dibujar.
 */
export function ChromeVecino({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()

  const items: ItemBarra[] = [
    { href: '/', etiqueta: 'Invitaciones', icono: Ticket,
      activo: path === '/' || path.startsWith('/invitaciones') },
    { href: '/historial', etiqueta: 'Historial', icono: History, activo: path.startsWith('/historial') },
    { href: '/perfil', etiqueta: 'Perfil', icono: UserRound, activo: path.startsWith('/perfil') },
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 bg-marca text-sobre-marca">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="Inicio" className="min-w-0"><Marca variante="banda" /></Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={i.activo ? 'page' : undefined}
                className={cn('rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
                  i.activo ? 'bg-white/20' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                {i.etiqueta}
              </Link>
            ))}
          </nav>

          <Link href="/perfil" className="flex shrink-0 items-center gap-2.5 text-sm sm:hidden" aria-label="Tu perfil">
            <span className="opacity-85">{me.units[0]?.label}</span>
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white/20 text-xs font-bold">
              {iniciales(me.name)}
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">{children}</main>

      <BarraSeccion items={items} />
    </div>
  )
}
```

- [ ] **Step 3: Layout y transición**

Reemplazar `web/src/app/(vecino)/layout.tsx` por:

```tsx
import { SeccionProtegida } from '@/components/seccion-protegida'
import { ChromeVecino } from '@/components/vecino/chrome'

// El admin también puede invitar desde su casa; el guardia no tiene unidades.
export default function LayoutVecino({ children }: { children: React.ReactNode }) {
  return (
    <SeccionProtegida roles={['resident', 'admin']}>
      <ChromeVecino>{children}</ChromeVecino>
    </SeccionProtegida>
  )
}
```

Crear `web/src/app/(vecino)/template.tsx`:

```tsx
'use client'
import { motion } from 'motion/react'

/*
 * Cada pantalla entra con un fundido corto. Solo opacidad, a propósito: un
 * transform en este ancestro rompería `position: fixed` del botón flotante y
 * de la barra de abajo, que quedarían anclados al contenido.
 */
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 4: Perfil**

Crear `web/src/app/(vecino)/perfil/page.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { LogOut, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Button, buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SelectorTema } from '@/components/selector-tema'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{titulo}</h2>
      {children}
    </section>
  )
}

export default function PerfilPage() {
  const me = useSesion()
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina antetitulo="Tu cuenta" titulo={me.name} subtitulo={me.email} />

      <Seccion titulo="Tus unidades">
        {me.units.length === 0 ? (
          <p className="text-ink-soft">Todavía no tenés una unidad. Pedile a la administración que te asigne la tuya.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {me.units.map((u) => (
              <li key={u.id} className="rounded-full bg-surface-sunk px-4 py-2 text-sm font-semibold tabular">{u.label}</li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Apariencia">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-soft">Automático sigue al tema de tu celular.</p>
          <SelectorTema />
        </div>
      </Seccion>

      {me.role === 'admin' && (
        <Seccion titulo="Administración">
          <Link href="/admin" className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
            <Settings2 aria-hidden />Ir a la administración
          </Link>
        </Seccion>
      )}

      <Seccion titulo="Sesión">
        <Button variant="outline" className="self-start text-peligro hover:text-peligro" onClick={logout}>
          <LogOut aria-hidden />Cerrar sesión
        </Button>
      </Seccion>
    </div>
  )
}
```

- [ ] **Step 5: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build lista `/perfil`.

Run: `cd .. && docker compose up -d --build web` y entrar como `vecino.prueba@aromos.test` a http://localhost:3000/perfil en 390 y 1280 px.
Expected: banda del barrio arriba; en 390, barra inferior con Invitaciones, Historial y Perfil (Perfil activo); en 1280, la navegación va en la banda.

```bash
git add -A web/src
git commit -m "feat: marco del vecino con banda del barrio, barra inferior y perfil"
```

---

### Task 6: Home y detalle de la invitación como pase

**Files:**
- Create: `web/src/components/dominio/skeleton-filas.tsx`, `web/src/components/vecino/fila-invitacion.tsx`, `web/src/components/vecino/acciones-pase.tsx`, `web/src/app/(vecino)/invitaciones/[id]/page.tsx`
- Modify: `web/src/components/dominio/skeleton-pantalla.tsx` (usa `SkeletonFilas`), `web/src/app/(vecino)/page.tsx` (reescritura)

**Interfaces:**
- Consumes: `useInvitaciones`, `useInvitacion`, `useAnularInvitacion`, `useRestaurarInvitacion` (Tarea 3); `estadoInvitacion` (Tarea 2); `datosPase`, `urlPublica`, `urlVolverAInvitar`, `vigencia`, `KIND_LABEL` (Tarea 2); `cupoTexto`, `hora`, `hoyISO` (`@/lib/fechas`); `Fila`, `EstadoTag`, `Pase`, `Vacio`, `ErrorConReintento`, `EncabezadoPagina`, `Nota` (Tarea 4); `Dialog*` de `@/components/ui/dialog`; `useMarca`.
- Produces:
  - `SkeletonFilas({ filas?: number })`
  - `FilaInvitacion({ inv: Invitation; mostrarUnidad?: boolean; mostrarCreador?: boolean })`: un link al detalle.
  - `AccionesPase({ inv: Invitation; url: string; onAnular: () => void; onHabilitar: () => void; habilitando: boolean })`
  - Ruta `/invitaciones/[id]`, que acepta `?creada=1` para mostrar "Listo, compartila".

- [ ] **Step 1: `SkeletonFilas`**

Crear `web/src/components/dominio/skeleton-filas.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** La forma de una lista de filas mientras llega: título, meta y etiqueta. */
export function SkeletonFilas({ filas = 4 }: { filas?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line py-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  )
}
```

En `web/src/components/dominio/skeleton-pantalla.tsx`, reemplazar el bloque `<div className="flex flex-col">…</div>` de las filas por `<SkeletonFilas filas={filas} />` (importándolo), y borrar el `role`/`aria-busy`/`sr-only` duplicado del contenedor exterior **solo si** `SkeletonFilas` ya los aporta. Dejar uno solo.

- [ ] **Step 2: `FilaInvitacion`**

Crear `web/src/components/vecino/fila-invitacion.tsx`:

```tsx
'use client'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { KIND_LABEL, vigencia, type Invitation } from '@/lib/invitations'
import { cupoTexto, hora, hoyISO } from '@/lib/fechas'

/** Una invitación en una lista: quién, cuándo y en qué está. Lleva al pase. */
export function FilaInvitacion({ inv, mostrarUnidad = false, mostrarCreador = false }: {
  inv: Invitation
  mostrarUnidad?: boolean
  mostrarCreador?: boolean
}) {
  const estado = estadoInvitacion(inv, hoyISO())
  const meta = [
    KIND_LABEL[inv.kind],
    vigencia(inv),
    cupoTexto(inv),
    mostrarUnidad ? inv.unitLabel : null,
    mostrarCreador ? `por ${inv.creatorName}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Fila href={`/invitaciones/${inv.id}`} titulo={inv.guestName} meta={meta}
      extremo={<EstadoTag estado={estado}
        detalle={estado === 'adentro' && inv.ultimoIngreso ? hora(inv.ultimoIngreso) : undefined} />} />
  )
}
```

- [ ] **Step 3: `AccionesPase`**

Crear `web/src/components/vecino/acciones-pase.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Ban, Check, Copy, Loader2, Pencil, RotateCcw, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { useMarca } from '@/lib/marca-cliente'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { urlVolverAInvitar, type Invitation } from '@/lib/invitations'
import { hoyISO } from '@/lib/fechas'

/**
 * Lo que se puede hacer con un pase. Compartir es lo principal: abre el
 * selector del sistema (WhatsApp incluido) sin librería ni API de Meta.
 */
export function AccionesPase({ inv, url, onAnular, onHabilitar, habilitando }: {
  inv: Invitation
  url: string
  onAnular: () => void
  onHabilitar: () => void
  habilitando: boolean
}) {
  const marca = useMarca()
  const [copiado, setCopiado] = useState(false)
  const estado = estadoInvitacion(inv, hoyISO())

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Mantené apretado el link para copiarlo a mano.')
    }
  }

  async function compartir() {
    const texto = `Hola ${inv.guestName}, te dejo el acceso a ${marca.nombre}: ${url}`
    if (navigator.share) {
      await navigator.share({ title: `Invitación a ${marca.nombre}`, text: texto, url }).catch(() => {})
      return
    }
    await copiar()
  }

  if (estado === 'anulada') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button size="lg" onClick={onHabilitar} disabled={habilitando}>
          {habilitando ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          Volver a habilitar
        </Button>
        <Link href={urlVolverAInvitar(inv)} className={buttonVariants({ variant: 'outline' })}>Invitar de nuevo</Link>
      </div>
    )
  }

  if (estado === 'vencida' || estado === 'salio') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Link href={urlVolverAInvitar(inv)} className={buttonVariants({ size: 'lg' })}>
          <RotateCcw aria-hidden />Volver a invitar
        </Link>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Button size="lg" onClick={compartir}><Share2 aria-hidden />Compartir</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copiar}>
          {copiado ? <Check className="animate-in zoom-in duration-200" aria-hidden /> : <Copy aria-hidden />}
          {copiado ? 'Copiado' : 'Copiar link'}
        </Button>
        <Link href={`/invitaciones/${inv.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil aria-hidden />Editar
        </Link>
      </div>
      <Button variant="ghost" className="text-peligro hover:bg-peligro/10 hover:text-peligro" onClick={onAnular}>
        <Ban aria-hidden />Anular invitación
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: La home**

Reemplazar `web/src/app/(vecino)/page.tsx` por:

```tsx
'use client'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Home as Casa, Plus, Ticket } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { useInvitaciones } from '@/lib/queries/invitaciones'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { FilaInvitacion } from '@/components/vecino/fila-invitacion'
import { cn } from '@/lib/utils'

const NUEVA = '/invitaciones/nueva'

export default function InicioVecino() {
  const me = useSesion()
  const q = useInvitaciones()
  const variasUnidades = me.units.length > 1
  const sinUnidad = me.units.length === 0

  return (
    <div className="flex flex-col gap-7 pb-24 sm:pb-0">
      <EncabezadoPagina
        antetitulo={me.units[0]?.label ?? 'Tu casa'}
        titulo={<>Hola, <em>{me.name.split(' ')[0]}.</em></>}
        acciones={!sinUnidad && (
          <Link href={NUEVA} className={cn(buttonVariants({ size: 'lg' }), 'hidden sm:inline-flex')}>
            <Plus aria-hidden />Nueva invitación
          </Link>
        )} />

      {sinUnidad ? (
        <Vacio icono={Casa} titulo="Todavía no tenés una unidad"
          detalle="Pedile a la administración que te asigne tu lote para poder invitar." />
      ) : q.isPending ? (
        <SkeletonFilas />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : q.data.length === 0 ? (
        <Vacio icono={Ticket} titulo="Todavía no invitaste a nadie"
          detalle="Creá una invitación y compartila por WhatsApp. Le llega el pase con el QR."
          accion={<Link href={NUEVA} className={buttonVariants()}><Plus aria-hidden />Nueva invitación</Link>} />
      ) : (
        <section aria-labelledby="vigentes">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <h2 id="vigentes" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Invitaciones vigentes
            </h2>
            <span className="text-[11px] font-semibold text-ink-soft tabular">{q.data.length}</span>
          </div>
          {/* Entran escalonadas la primera vez; una anulada se va deslizando. */}
          <motion.ul initial="oculto" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}>
            <AnimatePresence initial={false}>
              {q.data.map((inv) => (
                <motion.li key={inv.id} layout
                  variants={{ oculto: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}>
                  <FilaInvitacion inv={inv} mostrarUnidad={variasUnidades}
                    mostrarCreador={inv.createdBy !== me.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </section>
      )}

      {!sinUnidad && (
        <Link href={NUEVA}
          className={cn(buttonVariants({ size: 'lg' }),
            'fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 shadow-flotante sm:hidden')}>
          <Plus aria-hidden />Nueva invitación
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 5: El detalle**

Crear `web/src/app/(vecino)/invitaciones/[id]/page.tsx`:

```tsx
'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { ArrowLeft, Loader2, SearchX } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAnularInvitacion, useInvitacion, useRestaurarInvitacion } from '@/lib/queries/invitaciones'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { datosPase, urlPublica } from '@/lib/invitations'
import { cupoTexto, hoyISO } from '@/lib/fechas'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Pase } from '@/components/dominio/pase'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { AccionesPase } from '@/components/vecino/acciones-pase'

const SELLO = { anulada: 'Anulada', vencida: 'Vencida' } as const

export default function DetalleInvitacion({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ creada?: string }>
}) {
  const { id } = use(params)
  const { creada } = use(searchParams)
  const router = useRouter()
  const q = useInvitacion(id)
  const anular = useAnularInvitacion()
  const restaurar = useRestaurarInvitacion()
  const [confirmando, setConfirmando] = useState(false)

  const volver = (
    <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
      <ArrowLeft aria-hidden />Invitaciones
    </Link>
  )

  if (q.isPending) {
    return (
      <div className="flex flex-col items-center gap-6">
        {volver}
        <Skeleton className="h-[34rem] w-full max-w-sm rounded-xl" />
      </div>
    )
  }

  if (q.isError) {
    const noEsTuya = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403)
    return (
      <div className="flex flex-col gap-6">
        {volver}
        {noEsTuya ? (
          <Vacio icono={SearchX} titulo="No encontramos esta invitación"
            detalle="Puede que no exista o que sea de otra casa." />
        ) : (
          <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
        )}
      </div>
    )
  }

  const inv = q.data
  const estado = estadoInvitacion(inv, hoyISO())
  const sello = estado === 'anulada' || estado === 'vencida' ? SELLO[estado] : undefined
  const url = urlPublica(inv.token)
  const cupo = cupoTexto(inv)

  return (
    <div className="flex flex-col items-center gap-6">
      {volver}
      {creada === '1' && (
        <Nota tono="exito" className="w-full max-w-sm">Listo. Compartila con {inv.guestName}.</Nota>
      )}

      {/* El pase entra con un resorte: es el momento en que la invitación existe. */}
      <motion.div className="w-full max-w-sm"
        initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        <Pase datos={datosPase(inv)} qr={url} apagado={Boolean(sello)} sello={sello} />
      </motion.div>

      <p className="max-w-sm text-center text-sm text-ink-soft">
        {cupo ? `${cupo}. ` : ''}Quien lo reciba tiene que subir el brillo para que el lector lo tome.
      </p>

      <AccionesPase inv={inv} url={url}
        onAnular={() => setConfirmando(true)}
        onHabilitar={() => restaurar.mutate(inv)}
        habilitando={restaurar.isPending} />

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Anular la invitación de {inv.guestName}?</DialogTitle>
            <DialogDescription>No va a poder entrar. Si ya estaba en la barrera, avisale.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={anular.isPending}
              onClick={() => anular.mutate(inv, {
                onSuccess: () => { setConfirmando(false); router.push('/') },
              })}>
              {anular.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 6: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build lista `/invitaciones/[id]`.

Run: `cd .. && docker compose up -d --build web`. Entrar como `vecino.prueba@aromos.test`, abrir una invitación desde la home, copiar el link, anularla y tocar "Deshacer" en el toast.
Expected: la fila vuelve a la home después de deshacer; el pase entra animado; en una anulada se ve el sello y "Volver a habilitar".

```bash
git add -A web/src
git commit -m "feat: home del vecino y detalle de la invitacion como pase"
```

---

### Task 7: Nueva y editar invitación

**Files:**
- Create: `web/src/components/vecino/formulario-invitacion.tsx`, `web/src/app/(vecino)/invitaciones/nueva/page.tsx`, `web/src/app/(vecino)/invitaciones/[id]/editar/page.tsx`
- Modify: `web/next.config.ts`
- Delete: `web/src/app/(vecino)/nueva/`, `web/src/components/invitation-form.tsx`, `web/src/components/invitation-detail.tsx`, `web/src/components/qr-share.tsx`

**Interfaces:**
- Consumes: `useCrearInvitacion`, `useEditarInvitacion`, `useInvitacion`, `DatosInvitacion` (Tarea 3); `Chips`, `ChipsMultiples`, `CampoFecha`, `Campo`, `Nota` (fase 1 y Tarea 4); `Select*` de `@/components/ui/select`; `hoyISO`, `sumarDias` (`@/lib/fechas`); `DIAS`, `KIND_LABEL`, `Invitation`.
- Produces:
  - `FormularioInvitacion({ units, inicial?, invitacion?, onListo })`
  - `inicial?: Partial<{ kind: Invitation['kind']; guestName: string; guestDoc: string; plate: string }>` (lo que llega por query desde "Volver a invitar")
  - `invitacion?: Invitation` (si viene, edita en vez de crear)
  - `onListo: (inv: Invitation) => void`
  - Ruta `/invitaciones/nueva?kind=&guestName=&guestDoc=&plate=` y ruta `/invitaciones/[id]/editar`. `/nueva` redirige permanente a `/invitaciones/nueva`, conservando la query.

- [ ] **Step 1: El formulario**

Crear `web/src/components/vecino/formulario-invitacion.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Campo } from '@/components/dominio/campo'
import { Chips, ChipsMultiples } from '@/components/dominio/chips'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Nota } from '@/components/dominio/nota'
import { DIAS, KIND_LABEL, type Invitation } from '@/lib/invitations'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { useCrearInvitacion, useEditarInvitacion, type DatosInvitacion } from '@/lib/queries/invitaciones'

type Kind = Invitation['kind']

const AYUDA_TIPO: Record<Kind, string> = {
  visita: 'Una persona, un día.',
  frecuente: 'Entra muchas veces en un período: la empleada, el profesor, la niñera.',
  proveedor: 'Un servicio, un día: el técnico, el delivery, el flete.',
}

/** Un año para las frecuentes: no es "para siempre", obliga a revisar la lista. */
function enUnAnio(desde: string): string {
  return sumarDias(desde, 365)
}

export function FormularioInvitacion({ units, inicial, invitacion, onListo }: {
  units: { id: string; label: string }[]
  inicial?: Partial<{ kind: Kind; guestName: string; guestDoc: string; plate: string }>
  invitacion?: Invitation
  onListo: (inv: Invitation) => void
}) {
  const hoy = hoyISO()
  const editando = Boolean(invitacion)
  const crear = useCrearInvitacion()
  const editar = useEditarInvitacion(invitacion?.id ?? '')
  const mutacion = editando ? editar : crear

  const [kind, setKind] = useState<Kind>(invitacion?.kind ?? inicial?.kind ?? 'visita')
  const [unitId, setUnitId] = useState(invitacion?.unitId ?? units[0]?.id ?? '')
  const [guestName, setGuestName] = useState(invitacion?.guestName ?? inicial?.guestName ?? '')
  const [guestDoc, setGuestDoc] = useState(invitacion?.guestDoc ?? inicial?.guestDoc ?? '')
  const [plate, setPlate] = useState(invitacion?.plate ?? inicial?.plate ?? '')
  const [validFrom, setValidFrom] = useState(invitacion?.validFrom ?? hoy)
  const [validTo, setValidTo] = useState(invitacion?.validTo ?? enUnAnio(hoy))
  const [dias, setDias] = useState<string[]>((invitacion?.weekdays ?? []).map(String))
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const frecuente = kind === 'frecuente'

  // Las reglas, en un solo lugar: lo que se muestra al salir de un campo y lo
  // que frena el envío son lo mismo.
  const errores = {
    guestName: guestName.trim() ? null : 'Escribí el nombre de quien viene.',
    validFrom: !editando && validFrom < hoy ? 'No se puede invitar para un día que ya pasó.' : null,
    validTo: frecuente && validTo < validFrom ? 'La fecha de fin tiene que ser igual o posterior al inicio.' : null,
  }
  const mostrar = (campo: keyof typeof errores) => (tocado[campo] ? errores[campo] : null)
  const tocar = (campo: string) => setTocado((t) => ({ ...t, [campo]: true }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTocado({ guestName: true, validFrom: true, validTo: true })
    if (Object.values(errores).some(Boolean)) return
    setErrorGeneral(null)

    const datos: DatosInvitacion = {
      kind,
      guestName: guestName.trim(),
      guestDoc: guestDoc.trim() || null,
      plate: plate.trim().toUpperCase() || null,
      validFrom,
      validTo: frecuente ? validTo : validFrom,
      weekdays: frecuente && dias.length ? dias.map(Number).sort((a, b) => a - b) : null,
      // Una frecuente entra muchas veces dentro de su ventana; el resto, una.
      capacity: frecuente ? 999 : 1,
    }

    try {
      const inv = editando
        ? await editar.mutateAsync(datos)
        : await crear.mutateAsync({ ...datos, unitId })
      onListo(inv)
    } catch {
      setErrorGeneral(editando
        ? 'No se pudo guardar. Si ya entró gente, no podés achicar el período por debajo de esos ingresos.'
        : 'No se pudo crear la invitación. Revisá los datos y probá de nuevo.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        {!editando && (
          <Campo id="tipo" etiqueta="Tipo" ayuda={AYUDA_TIPO[kind]}>
            <Chips etiqueta="Tipo de invitación" valor={kind} onCambio={setKind}
              opciones={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ valor: k, etiqueta: KIND_LABEL[k] }))} />
          </Campo>
        )}

        {!editando && units.length > 1 && (
          <Campo id="unidad" etiqueta="Unidad">
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger id="unidad" className="h-11! w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        )}

        <Campo id="nombre" etiqueta="Nombre del invitado" error={mostrar('guestName')}>
          <Input id="nombre" value={guestName} placeholder="Juan Pérez" autoComplete="off"
            aria-invalid={Boolean(mostrar('guestName')) || undefined} aria-describedby="nombre-nota"
            onChange={(e) => setGuestName(e.target.value)} onBlur={() => tocar('guestName')} />
        </Campo>

        {frecuente ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="desde" etiqueta="Desde" error={mostrar('validFrom')}>
                <CampoFecha id="desde" valor={validFrom} min={editando ? undefined : hoy}
                  onCambio={(v) => { setValidFrom(v); tocar('validFrom') }} />
              </Campo>
              <Campo id="hasta" etiqueta="Hasta" error={mostrar('validTo')}>
                <CampoFecha id="hasta" valor={validTo} min={validFrom}
                  onCambio={(v) => { setValidTo(v); tocar('validTo') }} />
              </Campo>
            </div>
            <Campo id="dias" etiqueta="Días habilitados" ayuda="Sin días marcados, puede entrar todos los días.">
              <ChipsMultiples etiqueta="Días habilitados" valores={dias} onCambio={setDias}
                opciones={DIAS.map((d, i) => ({ valor: String(i), etiqueta: d }))} />
            </Campo>
          </>
        ) : (
          <Campo id="fecha" etiqueta="Fecha" error={mostrar('validFrom')}>
            <CampoFecha id="fecha" valor={validFrom} min={editando ? undefined : hoy}
              onCambio={(v) => { setValidFrom(v); tocar('validFrom') }} />
          </Campo>
        )}
      </section>

      <section className="flex flex-col gap-5 rounded-lg bg-surface-sunk/70 p-4 sm:p-5">
        <div>
          <p className="font-semibold">Para entrar más rápido</p>
          <p className="text-sm text-ink-soft">Opcional. Si lo cargás, el guardia no lo tiene que pedir en la barrera.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="doc" etiqueta="Documento">
            <Input id="doc" value={guestDoc} className="tabular" placeholder="30.123.456"
              onChange={(e) => setGuestDoc(e.target.value)} />
          </Campo>
          <Campo id="patente" etiqueta="Patente">
            <Input id="patente" value={plate} className="uppercase tabular" placeholder="AB 123 CD"
              onChange={(e) => setPlate(e.target.value)} />
          </Campo>
        </div>
      </section>

      {errorGeneral && <Nota tono="error">{errorGeneral}</Nota>}

      <Button type="submit" size="lg" disabled={mutacion.isPending}>
        {mutacion.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {mutacion.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear invitación'}
      </Button>
    </form>
  )
}
```

`select.tsx` fija la altura con `data-[size=default]:h-9`, un selector de atributo que en CSS puede ganarle a una clase plana `h-11`. Por eso el trigger usa `h-11!` (el modificador `!important` de Tailwind v4): así queda determinístico sin tocar `select.tsx`.

- [ ] **Step 2: Rutas nueva y editar**

Crear `web/src/app/(vecino)/invitaciones/nueva/page.tsx`:

```tsx
'use client'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home as Casa } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import type { Invitation } from '@/lib/invitations'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Vacio } from '@/components/dominio/vacio'
import { FormularioInvitacion } from '@/components/vecino/formulario-invitacion'

const KINDS: Invitation['kind'][] = ['visita', 'frecuente', 'proveedor']

export default function NuevaInvitacion({ searchParams }: {
  searchParams: Promise<{ kind?: string; guestName?: string; guestDoc?: string; plate?: string }>
}) {
  const sp = use(searchParams)
  const me = useSesion()
  const router = useRouter()

  // "Volver a invitar" desde el historial llega precargado por la URL.
  const inicial = {
    kind: KINDS.includes(sp.kind as Invitation['kind']) ? (sp.kind as Invitation['kind']) : undefined,
    guestName: sp.guestName,
    guestDoc: sp.guestDoc,
    plate: sp.plate,
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-7">
      <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
        <ArrowLeft aria-hidden />Invitaciones
      </Link>
      <EncabezadoPagina antetitulo="Nueva invitación" titulo={<>¿A quién <em>invitás?</em></>} />
      {me.units.length === 0 ? (
        <Vacio icono={Casa} titulo="Todavía no tenés una unidad"
          detalle="Pedile a la administración que te asigne tu lote para poder invitar." />
      ) : (
        <FormularioInvitacion units={me.units} inicial={inicial}
          onListo={(inv) => router.replace(`/invitaciones/${inv.id}?creada=1`)} />
      )}
    </div>
  )
}
```

Crear `web/src/app/(vecino)/invitaciones/[id]/editar/page.tsx`:

```tsx
'use client'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useSesion } from '@/lib/sesion-contexto'
import { useInvitacion } from '@/lib/queries/invitaciones'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { FormularioInvitacion } from '@/components/vecino/formulario-invitacion'

export default function EditarInvitacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const me = useSesion()
  const router = useRouter()
  const q = useInvitacion(id)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-7">
      <Link href={`/invitaciones/${id}`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
        <ArrowLeft aria-hidden />Volver al pase
      </Link>
      <EncabezadoPagina antetitulo="Editar" titulo={q.data?.guestName ?? 'Invitación'}
        subtitulo="El código no cambia: quien ya tenga el link sigue usando el mismo." />
      {q.isPending ? (
        <SkeletonFilas filas={3} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : (
        <FormularioInvitacion units={me.units} invitacion={q.data}
          onListo={() => { toast.success('Cambios guardados'); router.replace(`/invitaciones/${id}`) }} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Redirección y borrado de lo viejo**

En `web/next.config.ts`, agregar al array de `redirects()`:

```ts
      // "Nueva" pasó a colgar de /invitaciones. La query (Volver a invitar) se conserva sola.
      { source: '/nueva', destination: '/invitaciones/nueva', permanent: true },
```

Antes de borrar, confirmar que nada fuera de lo que se borra los importa:
Run: `cd web && grep -rn "invitation-form\|invitation-detail\|qr-share" src --include=*.tsx --include=*.ts`
Expected: solo aparecen dentro de los archivos que se borran y de `app/(vecino)/nueva/page.tsx`. Si aparece otro importador, reportarlo como NEEDS_CONTEXT en vez de borrar.

Run:
```bash
git rm -r "web/src/app/(vecino)/nueva" web/src/components/invitation-form.tsx web/src/components/invitation-detail.tsx web/src/components/qr-share.tsx
```

- [ ] **Step 4: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build lista `/invitaciones/nueva` y `/invitaciones/[id]/editar`, y ya no `/nueva`.

Run: `cd .. && docker compose up -d --build web`. Como vecino:
- crear una frecuente con días: al terminar se abre su pase con "Listo";
- editarla;
- abrir http://localhost:3000/nueva?kind=proveedor&guestName=Flete.
Expected: el formulario muestra los errores al salir del campo vacío, y la última URL abre el formulario precargado.

```bash
git add -A web/src web/next.config.ts
git commit -m "feat: crear y editar invitaciones con validacion en linea y calendario"
```

---

### Task 8: Historial

**Files:**
- Create: `web/src/components/vecino/filtros-historial.tsx`
- Modify: `web/src/app/(vecino)/historial/page.tsx` (reescritura)

**Interfaces:**
- Consumes: `useHistorial`, `FiltrosHistorial` (Tarea 3); `useDemora` (Tarea 3); `FilaInvitacion`, `SkeletonFilas` (Tarea 6); `Chips`, `Vacio`, `ErrorConReintento`, `EncabezadoPagina`; `Sheet*` de `@/components/ui/sheet`; `Switch`, `Label`.
- Produces: `FiltrosHistorialPanel({ valor: Omit<FiltrosHistorial, 'q'>; onCambio: (v: Omit<FiltrosHistorial, 'q'>) => void })`.

- [ ] **Step 1: El panel de filtros**

Crear `web/src/components/vecino/filtros-historial.tsx`:

```tsx
'use client'
import { Chips } from '@/components/dominio/chips'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { KIND_LABEL } from '@/lib/invitations'
import type { FiltrosHistorial } from '@/lib/queries/invitaciones'

type Filtros = Omit<FiltrosHistorial, 'q'>

const TIPOS: { valor: Filtros['kind']; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos' },
  ...(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ valor: k, etiqueta: KIND_LABEL[k] })),
]

const ESTADOS: { valor: Filtros['estado']; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'entro', etiqueta: 'Entró' },
  { valor: 'no_entro', etiqueta: 'No entró' },
  { valor: 'anulada', etiqueta: 'Anuladas' },
]

/** Los filtros del historial. Uno solo para el panel del celular y la columna de escritorio. */
export function FiltrosHistorialPanel({ valor, onCambio }: { valor: Filtros; onCambio: (v: Filtros) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Tipo</p>
        <Chips etiqueta="Tipo" valor={valor.kind} opciones={TIPOS} onCambio={(kind) => onCambio({ ...valor, kind })} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Estado</p>
        <Chips etiqueta="Estado" valor={valor.estado} opciones={ESTADOS} onCambio={(estado) => onCambio({ ...valor, estado })} />
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <Switch id="solo-mias" checked={valor.soloMias} onCheckedChange={(soloMias) => onCambio({ ...valor, soloMias })} />
        <Label htmlFor="solo-mias">Solo las que creé yo</Label>
      </div>
    </div>
  )
}
```

`Chips` exige `T extends string`. `''` es un string válido, así que `Filtros['kind']` y `Filtros['estado']` sirven tal cual.

- [ ] **Step 2: La pantalla**

Reemplazar `web/src/app/(vecino)/historial/page.tsx` por:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { History, Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { useHistorial, type FiltrosHistorial } from '@/lib/queries/invitaciones'
import { useDemora } from '@/lib/use-demora'
import { useSesion } from '@/lib/sesion-contexto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { FilaInvitacion } from '@/components/vecino/fila-invitacion'
import { FiltrosHistorialPanel } from '@/components/vecino/filtros-historial'
import { cn } from '@/lib/utils'

const SIN_FILTROS: Omit<FiltrosHistorial, 'q'> = { kind: '', estado: '', soloMias: false }

export default function HistorialPage() {
  const me = useSesion()
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const qDemorada = useDemora(q)
  const h = useHistorial({ q: qDemorada, ...filtros })
  const centinela = useRef<HTMLDivElement>(null)

  const filas = h.data?.pages.flatMap((p) => p.rows) ?? []
  const total = h.data?.pages[0]?.total ?? 0
  const activos = Number(Boolean(filtros.kind)) + Number(Boolean(filtros.estado)) + Number(filtros.soloMias)
  const hayFiltro = Boolean(q.trim()) || activos > 0

  // Cargar más al llegar al final, sin botón. El botón queda para quien no
  // hace scroll (teclado, lector de pantalla).
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = h
  useEffect(() => {
    const el = centinela.current
    if (!el || !hasNextPage) return
    const obs = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function limpiar() { setQ(''); setFiltros(SIN_FILTROS) }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina antetitulo="Todo lo que invitaste" titulo="Historial" />

      {/* El buscador queda pegado arriba al hacer scroll: es lo que más se usa. */}
      <div className="sticky top-14 z-20 -mx-4 flex gap-2 bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, documento o patente" aria-label="Buscar en el historial" className="pl-10" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="sm:hidden" aria-label={`Filtros${activos ? ` (${activos} activos)` : ''}`}>
              <SlidersHorizontal aria-hidden />
              {activos > 0 && <span className="grid size-5 place-items-center rounded-full bg-marca text-[11px] text-sobre-marca">{activos}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
            <div className="px-4 pb-8"><FiltrosHistorialPanel valor={filtros} onCambio={setFiltros} /></div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_15rem]">
        <section className="min-w-0">
          <div className="flex items-center justify-between pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft tabular" aria-live="polite">
              {h.isPending ? 'Buscando…' : `${total} ${total === 1 ? 'invitación' : 'invitaciones'}`}
            </p>
            {hayFiltro && (
              <Button variant="ghost" size="sm" onClick={limpiar}><X aria-hidden />Limpiar</Button>
            )}
          </div>

          {h.isPending ? (
            <SkeletonFilas filas={6} />
          ) : h.isError ? (
            <ErrorConReintento onReintentar={() => h.refetch()} reintentando={h.isFetching} />
          ) : filas.length === 0 ? (
            <Vacio icono={History}
              titulo={hayFiltro ? 'No encontramos nada' : 'Todavía no hay invitaciones'}
              detalle={hayFiltro ? 'Probá con otro nombre o sacá algún filtro.' : 'Las invitaciones que crees van a quedar acá.'}
              accion={hayFiltro ? <Button variant="outline" onClick={limpiar}>Limpiar filtros</Button> : undefined} />
          ) : (
            // Al cambiar un filtro, la lista anterior queda atenuada mientras
            // llega la nueva: el salto al skeleton en cada tecla marea.
            <ul className={cn('transition-opacity duration-200', h.isPlaceholderData && 'opacity-50')}>
              {filas.map((inv) => (
                <li key={inv.id}>
                  <FilaInvitacion inv={inv} mostrarUnidad={me.units.length > 1}
                    mostrarCreador={inv.createdBy !== me.id} />
                </li>
              ))}
            </ul>
          )}

          <div ref={centinela} />
          {hasNextPage && (
            <Button variant="outline" className="mt-4 w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
              {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </section>

        <aside className="hidden sm:block">
          <div className="sticky top-32"><FiltrosHistorialPanel valor={filtros} onCambio={setFiltros} /></div>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. Si eslint marca la regla `react-hooks` por el efecto del centinela, corregir el código (por ejemplo, leer `fetchNextPage` desde una ref) sin deshabilitar la regla.

Run: `cd .. && docker compose up -d --build web` y como vecino abrir http://localhost:3000/historial en 390 y 1280 px.
Expected: buscar filtra mientras se escribe; en 390 los filtros abren un panel desde abajo con el contador de activos; en 1280 van en la columna derecha; una fila abre el pase.

```bash
git add -A web/src
git commit -m "feat: historial con busqueda en vivo, filtros en panel y carga continua"
```

---

### Task 9: Página del invitado

**Files:**
- Modify: `web/src/app/i/[token]/page.tsx` (reescritura)
- Delete: `web/src/components/guest-page.tsx`, `web/src/components/tema-flotante.tsx` (si no quedan importadores)

**Interfaces:**
- Consumes: `GET /invitations/public/:token` → `{ guestName, kind, validFrom, validTo, revokedAt, unitLabel, inviterName, neighborhood: { name, address, mapUrl }, hasDoc, hasPlate, frozen }`; `PATCH /invitations/public/:token` con `{ guestDoc?, plate? }`. `Pase`, `Marca`, `SelectorTema`, `Campo`, `Nota`, `Vacio`, `vigencia`, `KIND_LABEL`, `hoyISO`.

- [ ] **Step 1: La página**

Reemplazar `web/src/app/i/[token]/page.tsx` por:

```tsx
'use client'
import { use, useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, SearchX, Sun } from 'lucide-react'
import { api } from '@/lib/api'
import { KIND_LABEL, vigencia, type Invitation } from '@/lib/invitations'
import { hoyISO } from '@/lib/fechas'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Campo } from '@/components/dominio/campo'
import { Marca } from '@/components/dominio/marca'
import { Nota } from '@/components/dominio/nota'
import { Pase } from '@/components/dominio/pase'
import { Vacio } from '@/components/dominio/vacio'
import { SelectorTema } from '@/components/selector-tema'

type Publica = {
  guestName: string
  kind: Invitation['kind']
  validFrom: string
  validTo: string
  revokedAt: string | null
  unitLabel: string
  inviterName: string
  neighborhood: { name: string; address: string | null; mapUrl: string | null }
  hasDoc: boolean
  hasPlate: boolean
  frozen: boolean
}

/** Pide SOLO lo que falta. Los datos se piden una vez. */
function FormularioDatos({ token, faltaDoc, faltaPatente }: { token: string; faltaDoc: boolean; faltaPatente: boolean }) {
  const qc = useQueryClient()
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const guardar = useMutation({
    mutationFn: () => api(`/invitations/public/${token}`, {
      method: 'PATCH',
      body: JSON.stringify({ guestDoc: doc.trim() || undefined, plate: plate.trim() || undefined }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publica', token] }),
  })

  if (guardar.isSuccess) return <Nota tono="exito">Listo. El guardia ya tiene tus datos.</Nota>

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (doc.trim() || plate.trim()) guardar.mutate() }}
      className="flex flex-col gap-5 rounded-xl border border-line bg-card p-5">
      <div>
        <p className="font-display text-lg font-bold tracking-[-0.01em]">Entrá más rápido</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {faltaDoc && faltaPatente
            ? 'Cargá tus datos y el guardia no te los tiene que pedir en la barrera.'
            : faltaDoc
              ? 'Cargá tu documento y el guardia no te lo tiene que pedir en la barrera.'
              : 'Si venís en auto, cargá la patente y no te la piden en la barrera.'}
        </p>
      </div>
      {faltaDoc && (
        <Campo id="doc" etiqueta="Documento" ayuda="DNI, pasaporte o documento del país que sea.">
          <Input id="doc" value={doc} className="tabular" placeholder="30.123.456" aria-describedby="doc-nota"
            onChange={(e) => setDoc(e.target.value)} />
        </Campo>
      )}
      {faltaPatente && (
        <Campo id="patente" etiqueta="Patente">
          <Input id="patente" value={plate} className="uppercase tabular" placeholder="AB 123 CD"
            onChange={(e) => setPlate(e.target.value)} />
        </Campo>
      )}
      {guardar.isError && <Nota tono="error">No se pudo guardar. Probá de nuevo o mostrá el QR igual: vas a poder entrar.</Nota>}
      <Button type="submit" disabled={guardar.isPending}>
        {guardar.isPending && <Loader2 className="animate-spin" aria-hidden />}
        Guardar
      </Button>
    </form>
  )
}

export default function InvitacionPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const q = useQuery({
    queryKey: ['publica', token],
    queryFn: ({ signal }) => api<Publica>(`/invitations/public/${token}`, { signal }),
  })

  const encabezado = (
    <header className="flex items-center justify-between gap-3">
      <Marca />
      <SelectorTema />
    </header>
  )

  if (q.isPending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
        {encabezado}
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[34rem] w-full rounded-xl" />
      </main>
    )
  }

  if (q.isError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
        {encabezado}
        <Vacio icono={SearchX} titulo="Esta invitación no existe"
          detalle="Pedile a quien te invitó que te mande el link de nuevo." />
      </main>
    )
  }

  const inv = q.data
  const anulada = Boolean(inv.revokedAt)
  const vencida = inv.validTo < hoyISO()
  const sello = anulada ? 'Anulada' : vencida ? 'Vencida' : undefined
  const url = typeof window === 'undefined' ? '' : window.location.href
  const { address, mapUrl } = inv.neighborhood

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      {encabezado}

      <p className="text-ink-soft">
        Te invita <strong className="text-ink">{inv.inviterName}</strong> · <span className="tabular">{inv.unitLabel}</span>
      </p>

      {sello && <Nota tono="error">Esta invitación está {sello.toLowerCase()}. Pedile una nueva a quien te invitó.</Nota>}

      <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        <Pase qr={url} apagado={Boolean(sello)} sello={sello} className="mx-auto"
          datos={{
            barrio: inv.neighborhood.name,
            tipo: KIND_LABEL[inv.kind],
            vigencia: vigencia({ validFrom: inv.validFrom, validTo: inv.validTo, weekdays: null }),
            invitado: inv.guestName,
            unidad: inv.unitLabel,
            invita: inv.inviterName,
          }} />
      </motion.div>

      {!sello && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-soft">
          <Sun className="size-4" aria-hidden />Mostrá esta pantalla en la garita con el brillo alto.
        </p>
      )}

      {!sello && !inv.frozen && (!inv.hasDoc || !inv.hasPlate) && (
        <FormularioDatos token={token} faltaDoc={!inv.hasDoc} faltaPatente={!inv.hasPlate} />
      )}

      {(address || mapUrl) && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Cómo llegar</p>
          {address && <p>{address}</p>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
              <MapPin aria-hidden />Abrir en el mapa
            </a>
          )}
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Borrar lo viejo**

Run: `cd web && grep -rn "guest-page\|tema-flotante" src`
Expected: ningún importador. Si `tema-flotante` todavía lo usa alguna pantalla, no borrarlo y anotarlo en el reporte.

Run: `git rm web/src/components/guest-page.tsx web/src/components/tema-flotante.tsx` (solo los que no tengan importadores).

- [ ] **Step 3: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`. Abrir el link de una invitación del vecino de prueba en una ventana sin sesión, en 390 px, en claro y oscuro.
Expected: pase con la marca, el aviso del brillo, el formulario si falta el documento (guardar muestra "Listo") y la tarjeta "Cómo llegar" si el barrio la tiene cargada.

```bash
git add -A web/src
git commit -m "feat: pagina del invitado con el pase, como llegar y datos para la barrera"
```

---

### Task 10: E2E del vecino y del invitado

**Files:**
- Create: `web/e2e/vecino.spec.ts`

**Interfaces:**
- Consumes: `entrar(page, 'vecino')` de `web/e2e/sesion.ts`; la cuenta `e2e.vecino@visitpass.test` con la unidad `Lote 900` (la crea `preparar.ts`).

- [ ] **Step 1: Los recorridos**

Crear `web/e2e/vecino.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

/** Crea una invitación de visita desde la UI y devuelve su nombre. */
async function crearInvitacion(page: import('@playwright/test').Page) {
  const nombre = `Invitado E2E ${Date.now()}`
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
  await expect(page.getByText(nombre).first()).toBeVisible()
  return nombre
}

test('el vecino crea una invitación, copia el link y la anula con deshacer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await entrar(page, 'vecino')
  const nombre = await crearInvitacion(page)

  await page.getByRole('button', { name: 'Copiar link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/i\/[A-Za-z0-9_-]+$/)

  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: new RegExp(nombre) })).toHaveCount(0)

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByRole('link', { name: new RegExp(nombre) })).toBeVisible()
})

test('el formulario no deja crear sin nombre', async ({ page }) => {
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page.getByText('Escribí el nombre de quien viene.')).toBeVisible()
  await expect(page).toHaveURL(/\/invitaciones\/nueva$/)
})

test('el invitado abre su pase y carga el documento', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await entrar(page, 'vecino')
  const nombre = await crearInvitacion(page)
  await page.getByRole('button', { name: 'Copiar link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())

  // Otra ventana, sin la sesión del vecino: como lo abriría el invitado.
  const invitado = await browser.newContext()
  const p = await invitado.newPage()
  await p.goto(link)
  await expect(p.getByText(nombre).first()).toBeVisible()
  await p.getByLabel('Documento').fill('30123456')
  await p.getByRole('button', { name: 'Guardar' }).click()
  await expect(p.getByText('Listo. El guardia ya tiene tus datos.')).toBeVisible()
  await invitado.close()
})

test('/nueva redirige al formulario nuevo conservando los datos', async ({ page }) => {
  await entrar(page, 'vecino')
  await page.goto('/nueva?kind=proveedor&guestName=Flete')
  await expect(page).toHaveURL(/\/invitaciones\/nueva\?kind=proveedor&guestName=Flete$/)
  await expect(page.getByLabel('Nombre del invitado')).toHaveValue('Flete')
})
```

- [ ] **Step 2: Correr**

Run: `cd .. && docker compose up -d --build && cd web && npm run e2e`
Expected: 20 passed (los 12 de la fase 1 y 4 recorridos nuevos × 2 proyectos). Si un recorrido falla por la app y no por el test, reportarlo como DONE_WITH_CONCERNS con la salida, sin debilitar la aserción.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/vecino.spec.ts
git commit -m "test: e2e del vecino (crear, copiar, anular, deshacer) y del invitado"
```

---

### Task 11: Verificación final de la fase

**Files:** ninguno nuevo.

- [ ] **Step 1: Todo en verde**

Run:
```bash
cd api && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build
cd .. && docker compose up -d --build && cd web && npm run e2e
```
Expected: 247 tests de API; check con `nav`, `fechas`, `estado-invitacion` y `colores` en ok; build limpio; 20 e2e en verde.

- [ ] **Step 2: Revisión visual**

Recorrer en 390 y 1280 px, en claro y oscuro, como vecino:
- `/login`, `/olvide`
- `/` (con y sin invitaciones), `/invitaciones/nueva` (visita y frecuente)
- `/invitaciones/[id]` (vigente, anulada y con `?creada=1`)
- `/invitaciones/[id]/editar`, `/historial`, `/perfil`
- `/i/[token]` sin sesión

Expected: sin scroll horizontal; el botón flotante y la barra inferior no tapan el último elemento; nada de "Cargando…" en texto plano; los textos de estado y las etiquetas se leen en los dos temas.

- [ ] **Step 3: Cerrar**

Anotar lo que queda para las fases 3 y 4 y pasar a `superpowers:finishing-a-development-branch`.
