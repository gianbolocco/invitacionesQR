# Arreglos de la auditoría (C1, I1, I3, I4): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cerrar los cuatro hallazgos más serios de [auditoria-2026-10.md](../../auditoria-2026-10.md): links de alta reutilizables, el admin cambiando contraseñas ajenas, CSRF entre subdominios y la pantalla Seguros de 22 s.

**Architecture:** cuatro arreglos independientes en la API, cada uno con su test. Sin cambios visibles en la web salvo que dejan de pasar cosas que no debían.

**Tech Stack:** Express + Drizzle + Postgres + vitest.

## Global Constraints

- Rama `auditoria-arreglos` desde `dev`. Commits `fix:` / `perf:` en español, minúscula.
- Errores: `throw new AppError(status, 'codigo_en_snake')`. Códigos nuevos: `no_es_guardia` (409), `deshabilitada` (409, ya existe: reusar), `origen_invalido` (403).
- **Decisión del dueño (I1):** cambiar la contraseña de un guardia dado de baja se rechaza con `deshabilitada`; no lo reactiva.
- Comentarios con el porqué; código en español. Verificar en cada tarea: `cd api && npm test && npx tsc --noEmit`.

---

### Task 1: C1 — usar un link invalida los demás

**Files:** Modify `api/src/services/people.ts:126` (`setPassword`); Test `api/tests/invite-flow.test.ts` (o el archivo de tokens que corresponda)

- [ ] **Step 1: tests que fallan.** (a) Se emiten dos links de alta para el mismo vecino (`inviteLink` dos veces, o `resendInvite` + `inviteLink`); `POST /auth/invite` con el primero → 200; con el segundo → 400 `invalid_token` (el código que ya devuelva un token usado) y la contraseña del primero sigue andando en `/auth/login`. (b) Igual con dos tokens de reset (`/auth/forgot` dos veces, tomar los dos del log/DB): usar uno invalida el otro. (c) El reset del admin (`setGuardPassword` de un guardia) también invalida los tokens pendientes del guardia.
- [ ] **Step 2:** `npx vitest run <archivo>` → FAIL.
- [ ] **Step 3: implementar** en `setPassword`, porque por ahí pasan alta, reset y reset del admin:

```ts
export async function setPassword(personId: string, plain: string): Promise<void> {
  await db.update(people).set({ passwordHash: await hashPassword(plain) }).where(eq(people.id, personId))
  // Un link viejo sin usar (el del mail y el copiado por WhatsApp son dos tokens)
  // no puede servir para pisar una contraseña recién elegida. Igual que crearAdmin al reemitir.
  await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.personId, personId), isNull(authTokens.usedAt)))
  await revokeAllSessions(personId)
}
```

Revisar `people.ts:173`: si ese bloque queda redundante con este, sacarlo.
- [ ] **Step 4:** PASS + suite completa. **Step 5:** commit `fix: usar un link de alta o de reset invalida los demás`.

### Task 2: I1 — el admin solo cambia contraseñas de guardias

**Files:** Modify `api/src/services/people.ts:230` (`setGuardPassword`); Test `api/tests/admin.test.ts`

- [ ] **Step 1: tests que fallan:** `POST /admin/people/:id/password` sobre un vecino → 409 `no_es_guardia`; sobre otro admin → 409 `no_es_guardia`; sobre un guardia dado de baja → 409 `deshabilitada` y sigue `disabled`; sobre un guardia activo → 200 (como hoy); sobre una persona de otro barrio → 404.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar:**

```ts
export async function setGuardPassword(personId: string, plain: string, actorId: string, neighborhoodId: string): Promise<void> {
  const [p] = await db.select({ role: people.role, status: people.status }).from(people)
    .where(and(eq(people.id, personId), eq(people.neighborhoodId, neighborhoodId))).limit(1)
  if (!p) throw new AppError(404, 'not_found')
  // Con la contraseña de un vecino o de otro admin, el admin entraría como esa persona.
  if (p.role !== 'guard') throw new AppError(409, 'no_es_guardia')
  // Reactivar es un paso aparte (enablePerson), con su propia auditoría.
  if (p.status === 'disabled') throw new AppError(409, 'deshabilitada')
  await setPassword(personId, plain)
  await db.update(people).set({ status: 'active' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'guard.password_reset', 'person', personId)
}
```

Si la web traduce errores de esta mutación (`web/src/lib/queries/admin.ts` o la pantalla de guardias), sumar `deshabilitada` → "Está dado de baja: reactivalo primero." y `no_es_guardia` → "Solo se cambia la contraseña de un guardia.".
- [ ] **Step 4:** PASS + suite. **Step 5:** commit `fix: el admin solo cambia la contraseña de un guardia activo`.

### Task 3: I3 — rechazar escrituras de otro origen

**Files:** Create `api/src/middleware/origen.ts`; Modify `api/src/app.ts` (montar después de `cors`, antes de las rutas); Test `api/tests/origen.test.ts`

- [ ] **Step 1: tests que fallan** (sobre una ruta POST real que no necesite body, p. ej. `POST /auth/logout` y `POST /invitations/:id/revoke` con sesión):
  - `Origin: https://otro.pazzit.com` → 403 `origen_invalido` y la invitación sigue sin anular.
  - `Sec-Fetch-Site: same-site` sin `Origin` → 403.
  - `Origin: <WEB_ORIGIN>` → pasa (aunque `Sec-Fetch-Site` sea `same-site`, que es el caso de desarrollo :3000 → :8080).
  - `Sec-Fetch-Site: same-origin` → pasa.
  - Sin ninguno de los dos headers (curl, supertest) → pasa.
  - `GET` con `Origin` ajeno → pasa (no escribe).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar** `middleware/origen.ts`:

```ts
import type { RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

const LECTURA = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * SameSite=Lax no alcanza: qa.pazzit.com, la landing y cada barrio son el mismo
 * "sitio", así que un fetch POST sin preflight desde otro subdominio viaja con la
 * cookie. Se acepta solo lo que el navegador declara del mismo origen, o del
 * origen de la web (en desarrollo la web y la API son orígenes distintos). Sin
 * esos headers no es un navegador: no hay cookie ajena que aprovechar.
 */
export const mismoOrigen: RequestHandler = (req, _res, next) => {
  if (LECTURA.has(req.method)) return next()
  const origin = req.get('origin')
  const sitio = req.get('sec-fetch-site')
  const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  if (origin === web) return next()
  if (origin && origin !== web) return next(new AppError(403, 'origen_invalido'))
  if (sitio && sitio !== 'same-origin' && sitio !== 'none') return next(new AppError(403, 'origen_invalido'))
  next()
}
```

Montarlo en `app.ts` después de `cors(...)` y antes de las rutas. Revisar que nada legítimo quede afuera: el callback de Google es GET; el link público del invitado (`/invitations/public/...`) sale de la misma web; el e2e corre contra la web real.
- [ ] **Step 4:** PASS + suite; `docker compose up -d --build` y `cd web && npm run e2e -- --workers=1` completo (cubre login, alta, vecino, garita y admin con el middleware puesto) → reportar números.
- [ ] **Step 5:** commit `fix: la api rechaza escrituras que vienen de otro origen`.

### Task 4: I4 — índices para el último ingreso por DNI y patente

**Files:** Modify `api/src/db/schema.ts` (índices de expresión en `entry_log` e `invitation`), `api/src/services/seguros.ts:57,84,99`, `api/src/services/reports.ts:78,83`; Create `api/drizzle/0026_*.sql` (generada); Test `api/tests/indices-padron.test.ts`

- [ ] **Step 1: test que falla:** con `set local enable_seqscan = off` dentro de una transacción, `EXPLAIN` de la consulta de último ingreso por DNI (la misma expresión que usa `listarProveedores`) y por patente menciona los índices nuevos por nombre (`entry_log_doc_idx`, `entry_log_plate_idx`, `invitation_doc_idx`). Prueba que la expresión del código coincide con la del índice; sin eso, Postgres no lo usa.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar.** En `schema.ts`, con la misma expresión que `docSql` (`api/src/lib/padron.ts:16`):

```ts
// El último ingreso de un DNI o de una patente se busca por la clave normalizada:
// sin índice era un seq scan de entry_log por cada fila del padrón (22 s en Seguros).
index('entry_log_doc_idx').on(sql`upper(regexp_replace(coalesce(${t.guestDoc}, ''), '[^0-9A-Za-z]', '', 'g'))`, t.enteredAt.desc()),
index('entry_log_plate_idx').on(sql`upper(regexp_replace(coalesce(${t.plate}, ''), '[^0-9A-Za-z]', '', 'g'))`, t.enteredAt.desc()),
```

y `invitation_doc_idx` sobre `guest_doc` de `invitation`. Reemplazar en `seguros.ts` y `reports.ts` la expresión copiada a mano por `docSql(...)` (si el SQL es crudo, interpolar `${docSql(sql.raw('e.guest_doc'))}` o la forma que `docSql` acepte), para que no se desfase del índice (M12). `cd api && npx drizzle-kit generate --name indices_padron`.
- [ ] **Step 4:** PASS + suite. Medir antes/después con `EXPLAIN ANALYZE` de `listarProveedores` sobre la base de desarrollo y anotarlo en el reporte (si `auditoria_perf` ya no existe, alcanza con la de desarrollo).
- [ ] **Step 5:** commit `perf: índices para buscar el último ingreso por dni y patente`.

### Cierre

- [ ] Marcar C1, I1, I3 e I4 como resueltos en `docs/auditoria-2026-10.md` (una línea "Resuelto en <commit>" bajo cada título) y commitear con `docs: la auditoría marca los cuatro arreglos`.
