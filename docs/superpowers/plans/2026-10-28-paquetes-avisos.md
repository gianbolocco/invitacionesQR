# Paquetes y avisos al vecino: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la garita avisa "llegó un paquete" a una unidad y los vecinos lo reciben por web push y, con la app abierta, al instante; lo ven 30 días en el inicio.

**Architecture:** tabla `package` con `notify_at` (5 s para deshacer); `services/avisos.ts` despacha a un hub SSE en memoria y a `web-push`. La web suma un service worker estático, `EventSource('/events')`, la tarjeta del inicio, `/paquetes` y la hoja de la garita. Spec: [2026-10-28-paquetes-avisos-design.md](../specs/2026-10-28-paquetes-avisos-design.md).

**Tech Stack:** Express + Drizzle + Postgres + vitest + `web-push` (api); Next.js 16 + TanStack Query + Playwright (web).

## Global Constraints

- Rama `paquetes` desde `dev`. Commits `feat:` / `fix:` / `test:` / `docs:` en español, minúscula.
- `DESHACER_SEGUNDOS = 5`. `DIAS_PAQUETES = 30`. Nota: null o 1–80 caracteres.
- Se avisa a los vecinos **activos** (`status = 'active'`) de la unidad. Sin mail.
- Errores: `paquetes_apagados` (403), `ya_avisado` (409). Textos: "Los avisos de paquetes están apagados." / "Ya se avisó."
- Hora de Buenos Aires con `api/src/lib/dates.ts` / `web/src/lib/fechas.ts`; nunca `new Date()` para calcular un día.
- Solo tokens de `globals.css`; sin borde lateral de color en tarjetas. Textos en voseo. `web/AGENTS.md` antes de usar una API de Next.
- `ponytail:` en el timer y en el hub en memoria (techo: un proceso por barrio; con réplicas, cola o `pg` LISTEN/NOTIFY).
- Verificar en cada tarea: `cd api && npm test && npx tsc --noEmit`; web: `cd web && npm run check && npm run lint && npx tsc --noEmit`.

---

### Task 1: esquema y switch del admin

**Files:** Modify `api/src/db/schema.ts`, `api/src/services/neighborhoods.ts`, `api/src/routes/admin.ts`, `api/tests/helpers/db.ts` (truncate); Create `api/drizzle/0025_paquetes.sql` (generada); Test `api/tests/schema.test.ts`, `api/tests/admin.test.ts`

**Produces:** `packages` (`id, unitId, note, createdBy, createdAt, notifyAt, notifiedAt, canceledAt`), `pushSubscriptions` (`id, personId, endpoint, p256dh, auth, createdAt`), `people.packagesSeenAt`, `neighborhoods.packagesEnabled`; `getNeighborhood` devuelve `packagesEnabled`.

- [ ] **Step 1: tests que fallan.** `schema.test.ts` con `violatedConstraint`: nota de 81 → `package_note_ck`; nota `''` → `package_note_ck`; `notified_at` y `canceled_at` juntos → `package_estado_ck`; dos suscripciones con el mismo endpoint → `push_subscription_endpoint_uq`. `admin.test.ts`: `PATCH /admin/neighborhood { packagesEnabled: false }` → 200 y `GET` lo devuelve en false; default true.
- [ ] **Step 2:** `npx vitest run tests/schema.test.ts tests/admin.test.ts` → FAIL.
- [ ] **Step 3: implementar** en `schema.ts`:

```ts
export const packages = pgTable('package', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  note: text('note'),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Se avisa a esta hora, no al cargar: el guardia tiene unos segundos para deshacer.
  notifyAt: timestamp('notify_at', { withTimezone: true }).notNull(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
}, (t) => [
  index('package_unit_idx').on(t.unitId, t.createdAt),
  check('package_note_ck', sql`${t.note} is null or char_length(${t.note}) between 1 and 80`),
  check('package_estado_ck', sql`${t.notifiedAt} is null or ${t.canceledAt} is null`),
])

export const pushSubscriptions = pgTable('push_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('push_subscription_endpoint_uq').on(t.endpoint)])
```

`people`: `packagesSeenAt: timestamp('packages_seen_at', { withTimezone: true })`. `neighborhoods`: `packagesEnabled: boolean('packages_enabled').notNull().default(true)`. Sumar `package, push_subscription` al `truncate` de `tests/helpers/db.ts`. `getNeighborhood`/`updateNeighborhood`/ruta: `packagesEnabled: z.boolean().optional()`. `cd api && npx drizzle-kit generate --name paquetes`.
- [ ] **Step 4:** `npm test` + tsc → PASS. **Step 5:** commit `feat: el esquema de paquetes y suscripciones push`.

### Task 2: hub SSE y `/events`

**Files:** Create `api/src/lib/eventos.ts`, `api/src/routes/events.ts`; Modify `api/src/app.ts`, `api/src/server.ts`; Test `api/tests/eventos.test.ts`

**Produces:** `emitir(personId: string, evento: string, datos: unknown): void`, `cerrarTodo(): void`.

- [ ] **Step 1: tests que fallan:** `GET /events` sin sesión → 401. Con sesión de vecino: levantar `buildApp().listen(0)`, abrir con `fetch(url, { headers: { cookie } })`, leer el stream; `emitir(personId, 'package', { id: 'x' })` → el texto incluye `event: package\ndata: {"id":"x"}`. `emitir` a otra persona no llega. Al cortar la conexión, el hub la suelta (`conexionesDe(personId) === 0`, exportado solo para el test).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar** `lib/eventos.ts`:

```ts
import type { Response } from 'express'

// ponytail: hub en memoria, alcanza con un proceso por barrio; con réplicas, pg LISTEN/NOTIFY.
const conexiones = new Map<string, Set<Response>>()

export function suscribir(personId: string, res: Response) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write(': hola\n\n')
  const set = conexiones.get(personId) ?? new Set()
  set.add(res); conexiones.set(personId, set)
  // Un comentario cada 25 s: sin tráfico, los proxies cortan la conexión.
  const latido = setInterval(() => res.write(': latido\n\n'), 25_000)
  res.on('close', () => { clearInterval(latido); set.delete(res); if (!set.size) conexiones.delete(personId) })
}

export function emitir(personId: string, evento: string, datos: unknown) {
  for (const res of conexiones.get(personId) ?? []) res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)
}

export const conexionesDe = (personId: string) => conexiones.get(personId)?.size ?? 0

/** Al apagar: sin esto `server.close` espera a que el navegador corte. */
export function cerrarTodo() { for (const set of conexiones.values()) for (const res of set) res.end() }
```

`routes/events.ts`: `eventRoutes.get('/', requireAuth, (req, res) => suscribir(req.person!.id, res))`; `app.use('/events', eventRoutes)`. En `server.ts`, dentro del SIGTERM, `cerrarTodo()` antes de `server.close`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: eventos en vivo por sse`.

### Task 3: suscripciones push

**Files:** Create `api/src/lib/push.ts`, `api/src/routes/push.ts`; Modify `api/src/app.ts`, `api/package.json` (`web-push` + `@types/web-push`), `api/.env.example`, `docker-compose.coolify.yml`; Test `api/tests/push.test.ts`

**Produces:** `enviarPush(sub: { endpoint, p256dh, auth }, payload: { titulo, cuerpo, url }): Promise<'ok' | 'vencida' | 'error'>`, `clavePublica(): string | null`.

- [ ] **Step 1: tests que fallan** (`vi.mock('web-push')`): `GET /push/public-key` → `{ key }` (con `VAPID_PUBLIC_KEY` seteada en el test). `POST /push/subscriptions` crea; el mismo endpoint desde otra persona lo reasigna (upsert); `DELETE` lo borra; sin sesión → 401. `enviarPush` devuelve `'vencida'` si `sendNotification` rechaza con `statusCode` 404 o 410, `'error'` con 500.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar.** `lib/push.ts`: lee `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; si están, `webpush.setVapidDetails(...)`. Con `NODE_ENV=production` y alguna faltante: `throw new Error('En producción hacen falta VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT')` (como `lib/mail.ts`). Sin claves en dev: `enviarPush` loguea `-- PUSH a <endpoint> --` y devuelve `'ok'`. Ruta: `GET /public-key` sin auth; el resto con `requireAuth`; upsert con `onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { personId, p256dh, auth } })`. `.env.example`: bloque VAPID con `npx web-push generate-vapid-keys`. Coolify: `VAPID_*: ${VAPID_*:?falta VAPID_*}` y comentario arriba como el de Resend.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: suscripciones a notificaciones push`.

### Task 4: paquetes y el aviso

**Files:** Create `api/src/services/packages.ts`, `api/src/services/avisos.ts`, `api/src/routes/packages.ts`; Modify `api/src/routes/gate.ts`, `api/src/app.ts`, `api/src/server.ts`; Test `api/tests/paquetes.test.ts`

**Produces:** `crearPaquete({ unitId, note?, guardId, neighborhoodId }) → { id, notifyAt }`, `deshacerPaquete(id, neighborhoodId)`, `avisarPaquete(id): Promise<void>`, `avisarPendientes(): Promise<number>`, `paquetesDe(personId) → { id, unitLabel, note, notifiedAt, sinVer }[]`, `marcarVistos(personId)`, `paquetesDeHoy(neighborhoodId)`.

- [ ] **Step 1: tests que fallan** (`vi.mock('../src/lib/push.js')` para contar envíos; espiar `emitir`):
  - `POST /gate/packages` (guardia): 201 con `notifyAt` ≈ ahora + 5 s; unidad de otro barrio → 403 `not_your_neighborhood` (o el código que ya use `assertUnitInNeighborhood`); nota de 81 → 400; feature apagada → 403 `paquetes_apagados`; vecino → 403.
  - `POST /gate/packages/:id/cancel` antes del aviso → 200 y `avisarPaquete` no envía nada; después → 409 `ya_avisado`; dos veces → 200.
  - `avisarPaquete`: envía push a cada suscripción de los vecinos **activos** de la unidad (no a uno `disabled` ni a otra unidad), emite `package` por SSE, marca `notifiedAt`; una suscripción `'vencida'` se borra; llamado dos veces no reenvía.
  - `avisarPendientes`: avisa los vencidos sin `notifiedAt` ni `canceledAt` y devuelve cuántos.
  - `GET /packages` (vecino): solo sus unidades, sin deshechos ni pendientes, últimos 30 días, `sinVer` según `packagesSeenAt`; `POST /packages/seen` los deja en `sinVer: false`.
  - `GET /gate/packages/hoy`: los avisados hoy (BA) del barrio con `unitLabel`, `note`, `notifiedAt`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar.** `crearPaquete` inserta con `notifyAt = new Date(Date.now() + DESHACER_SEGUNDOS * 1000)` y programa:

```ts
// ponytail: timer en memoria; si la API se reinicia en esos segundos, avisarPendientes() lo recupera al arrancar.
setTimeout(() => { avisarPaquete(pkg.id).catch((e) => console.error('No se pudo avisar el paquete', pkg.id, e)) }, DESHACER_SEGUNDOS * 1000).unref()
```

`avisarPaquete`: transacción con `FOR UPDATE` sobre el paquete; si `canceledAt || notifiedAt` → return; `update notifiedAt = now()`; después de commitear, busca destinatarios (`unit_member` + `person.status = 'active'`), emite SSE `{ id, unitLabel, note, notifiedAt }` y manda `enviarPush` a cada suscripción con `{ titulo: 'Llegó un paquete', cuerpo: [unitLabel, note].filter(Boolean).join(' · '), url: '/' }` (`Promise.allSettled`); borra las `'vencida'`. Ruta de deshacer: `update ... set canceled_at = now() where id and notified_at is null` → si no actualizó y está avisado, 409. `server.ts`: `avisarPendientes()` después de `listen`. En tests, `vi.useFakeTimers({ toFake: ['setTimeout'] })` o llamar `avisarPaquete` directo.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: la garita avisa que llegó un paquete`.

### Task 5: lógica web y service worker

**Files:** Create `web/src/lib/avisos.ts`, `web/src/lib/avisos.check.ts`, `web/public/sw.js`; Modify `web/src/proxy.ts`, `web/src/lib/ultimos-movimientos.ts` (+ su check)

**Produces:** `estadoBanner({ habilitado, soportaPush, permiso, standalone, esIos, ahoraNo }): 'oculto' | 'activar' | 'instalar'`; `sinVerCount(paquetes)`; `ultimosMovimientos(filas, paquetes?, tope)` acepta paquetes como `tipo: 'paquete'`.

- [ ] **Step 1: checks que fallan:** `estadoBanner` → `'oculto'` si deshabilitado, permiso `granted` o `denied`, o `ahoraNo`; `'instalar'` si `esIos && !standalone`; `'activar'` si soporta y permiso `default`. `ultimosMovimientos` con un paquete más reciente lo pone primero.
- [ ] **Step 2:** `npm run check` → FAIL. **Step 3:** implementar. `sw.js`:

```js
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {}
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    // Con la app a la vista, el aviso en vivo ya se mostró: no duplicar.
    if (ws.some((w) => w.visibilityState === 'visible')) return
    return self.registration.showNotification(d.titulo, { body: d.cuerpo, icon: '/icon/192', data: { url: d.url || '/' } })
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => ws[0] ? ws[0].focus() : self.clients.openWindow(e.notification.data.url)))
})
```

CSP: `worker-src 'self'`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: la web sabe cuándo pedir avisos y tiene su service worker`.

### Task 6: vecino

**Files:** Create `web/src/lib/queries/paquetes.ts`, `web/src/lib/push-cliente.ts`, `web/src/components/vecino/tarjeta-paquete.tsx`, `web/src/components/vecino/banner-avisos.tsx`, `web/src/components/vecino/eventos-en-vivo.tsx`, `web/src/app/(vecino)/paquetes/page.tsx`; Modify `web/src/app/(vecino)/page.tsx`, `web/src/app/(vecino)/layout.tsx`, `web/src/app/(vecino)/perfil/page.tsx`

- [ ] **Step 1:** `push-cliente.ts`: `activarPush()` registra `/sw.js`, pide permiso, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` con la clave de `/push/public-key`, y `POST /push/subscriptions`; `desactivarPush()` desuscribe y `DELETE`.
- [ ] **Step 2:** `eventos-en-vivo.tsx` (montado en el layout del vecino): `new EventSource(BASE + '/events', { withCredentials: true })`; con `package` → toast "Llegó un paquete" con `[unitLabel, note]` e invalida la query de paquetes; cierra al desmontar.
- [ ] **Step 3:** inicio: `TarjetaPaquete` arriba de las invitaciones si `sinVerCount > 0` (fondo `bg-azul-tint`, "Te llegó un paquete", hora y nota del último, link "Ver paquetes (N)"); `BannerAvisos` según `estadoBanner` (activar / guía de 3 pasos de iPhone / "Ahora no" en `localStorage`, con try/catch). `/paquetes`: lista de 30 días con hora (`fechas.ts`), nota y "Lo recibió la garita"; al montar, `POST /packages/seen`; vacío: "No llegó ningún paquete en los últimos 30 días." Perfil: switch "Notificaciones en este dispositivo" (texto de ayuda si el permiso está denegado). Con `packagesEnabled` false no aparecen el banner ni el switch de Perfil; la tarjeta y `/paquetes` siguen mostrando lo ya avisado (spec). El flag lo trae lo que ya exponga el barrio al vecino (`/branding` o la sesión); si no hay nada, sumarlo a `GET /auth/me`.
- [ ] **Step 4:** rebuild web, capturas 390×844: tarjeta, `/paquetes`, banner (Android y la guía de iPhone forzando el estado), perfil. **Step 5:** commit `feat: el vecino ve sus paquetes y activa los avisos`.

### Task 7: garita y admin

**Files:** Create `web/src/components/garita/llego-paquete.tsx`; Modify `web/src/app/(garita)/garita/page.tsx`, `web/src/lib/gate.ts` (o `queries/garita.ts`), `web/src/app/(admin)/admin/barrio/page.tsx`, `web/src/lib/queries/admin.ts`

- [ ] **Step 1:** botón "Llegó un paquete" (ícono `Package`) al lado de "Autorizar sin invitación", solo con `packagesEnabled`. Hoja: "Llegó un paquete", "Le avisamos a la casa al instante.", buscador de lote (el componente del alta exprés), nota (max 80), botón "Avisar al {lote}".
- [ ] **Step 2:** al guardar, toast con cuenta regresiva "Avisando al {lote} en N s · Deshacer" (N de 5 a 0); Deshacer → `cancel`; `ya_avisado` → "Ya se avisó."; `paquetes_apagados` → su texto. "Últimos movimientos" suma `GET /gate/packages/hoy` como "Paquete".
- [ ] **Step 3:** admin, *Configuración → Garita*: switch "Paquetes" con "La garita avisa al vecino cuando llega un paquete."
- [ ] **Step 4:** capturas 1280×800: botón, hoja, toast, movimientos, admin. **Step 5:** commit `feat: la garita carga paquetes y el admin los prende o apaga`.

### Task 8: e2e y README

**Files:** Create `web/e2e/paquetes.spec.ts`; Modify `README.md`, `web/e2e/preparar.ts` (dejar `packages_enabled = true`)

- [ ] **Step 1:** e2e con dos contextos: vecino en `/` → guardia avisa al Lote 900 con nota única → en ≤ 10 s el vecino ve el toast y la tarjeta **sin recargar**; guardia avisa otro y toca Deshacer → el vecino no lo ve (esperar 7 s y verificar); admin apaga la feature → la garita no muestra el botón (y volver a prenderla en `finally`).
- [ ] **Step 2:** `docker compose up -d --build` y `cd web && npm run e2e -- --workers=1` completo → reportar números.
- [ ] **Step 3:** README: párrafo **Paquetes** (qué carga la garita, 5 s para deshacer, push + en vivo, 30 días, switch del admin, iPhone necesita la app instalada) y en *Correr en desarrollo* cómo generar las claves VAPID. Verificar que Caddy no bufferee `/events` en qa (`curl -N https://qa…/api/events` con cookie); si lo hace, `flush_interval -1` en el `reverse_proxy` de `/api/*`.
- [ ] **Step 4:** commit `test: e2e de paquetes` y `docs: los paquetes en el readme`.
