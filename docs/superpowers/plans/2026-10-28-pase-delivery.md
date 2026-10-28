# Pase de delivery: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** el vecino avisa "espero un pedido" en dos toques; la garita deja pasar al repartidor 2 horas, con DNI, seguro del vehículo, egreso y alerta en minutos.

**Architecture:** `kind = 'delivery'` en la misma tabla `invitation`, con `delivery_app` y `expires_at`. `canEnter()` suma el vencimiento por hora. Alta propia (`POST /invitations/delivery`) y en el alta exprés. Spec: [2026-10-28-pase-delivery-design.md](../specs/2026-10-28-pase-delivery-design.md).

**Tech Stack:** Express + Drizzle + Postgres + vitest (api); Next.js 16 + TanStack Query + Playwright (web).

## Global Constraints

- Rama `dev`. Commits `feat:` / `fix:` en español, minúscula.
- Hora de Buenos Aires: `api/src/lib/dates.ts` y `web/src/lib/fechas.ts`. Nunca `new Date()` para calcular un día.
- `canEnter()` sigue puro; el orden testeado de rechazos no cambia. El `FOR UPDATE` de `registerEntry` no se toca.
- Errores: `throw new AppError(status, 'codigo')`; el front los traduce en la mutación.
- Solo tokens de `globals.css`. Textos en voseo. Antes de usar una API de Next, `web/AGENTS.md`.
- Duración fija: `DELIVERY_HORAS = 2`. Apps: `'pedidosya' | 'rappi' | 'mercadolibre' | 'otro'`. "Otro" hasta 40 caracteres.
- Verificar al final de cada tarea: `cd api && npm test && npx tsc --noEmit`; en tareas web, `cd web && npm run check && npm run lint && npx tsc --noEmit`.

**Ajuste al spec:** `POST /gate/entries` ya exige `guestDoc` (`z.string().trim().min(1)`), así que el DNI obligatorio al ingresar ya rige para todos y no hace falta `falta_documento` en `registerEntry`. En el alta exprés también se exige con zod.

---

### Task 1: esquema y `canEnter`

**Files:** Modify `api/src/db/schema.ts`, `api/src/authz.ts`; Create `api/drizzle/0024_*.sql` (generada); Test `api/tests/authz.test.ts`, `api/tests/schema.test.ts`

**Produces:** `invitations.deliveryApp`, `invitations.expiresAt`, `neighborhoods.overstayMinutesDelivery`; `InvitationLike.expiresAt: Date | null`.

- [ ] **Step 1: tests que fallan** en `authz.test.ts` (sumar `expiresAt: null` a `base`):

```ts
describe('delivery: vence por hora', () => {
  const del = { ...base, kind: 'delivery', expiresAt: new Date('2026-09-14T19:00:00Z') } // 16:00 BA
  it('pasa antes de la hora', () => expect(canEnter(del, lunes15h, 0)).toEqual({ ok: true }))
  it('rebota después', () => expect(canEnter(del, new Date('2026-09-14T19:01:00Z'), 0))
    .toEqual({ ok: false, reason: 'expired' }))
  it('cruza la medianoche', () => {
    const tarde = { ...del, validTo: '2026-09-15', expiresAt: new Date('2026-09-15T04:30:00Z') } // 01:30 BA
    expect(canEnter(tarde, new Date('2026-09-15T04:00:00Z'), 0)).toEqual({ ok: true })
  })
  it('anulada gana sobre vencida', () => expect(canEnter({ ...del, revokedAt: new Date() }, new Date('2026-09-15T00:00:00Z'), 0))
    .toEqual({ ok: false, reason: 'revoked' }))
  it('no aplica franjas', () => expect(canEnter(del, lunes15h, 0, solo8a12)).toEqual({ ok: true }))
})
```

En `schema.test.ts`, con `violatedConstraint`: un delivery sin `expires_at` rompe `invitation_delivery_ck`; una visita con `delivery_app` también.

- [ ] **Step 2:** `cd api && npx vitest run tests/authz.test.ts` → FAIL (falta `expiresAt` en el tipo).
- [ ] **Step 3: implementar.** En `schema.ts`, `invitation`:

```ts
  // Solo en un delivery: de dónde viene y cuándo vence exacto (la ventana por día no alcanza para "2 horas").
  deliveryApp: text('delivery_app'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
```

Checks: `invitation_kind_ck` pasa a `in ('visita','frecuente','proveedor','delivery')`, y

```ts
  check('invitation_delivery_ck', sql`(${t.kind} = 'delivery') = (${t.deliveryApp} is not null and ${t.expiresAt} is not null)`),
  check('invitation_delivery_app_ck', sql`${t.deliveryApp} in ('pedidosya','rappi','mercadolibre','otro')`),
```

En `neighborhood`: `overstayMinutesDelivery: smallint('overstay_minutes_delivery').default(30),` + `check('neighborhood_overstay_delivery_ck', sql\`${t.overstayMinutesDelivery} between 5 and 240\`)`.

En `authz.ts`: `expiresAt: Date | null` en `InvitationLike` y, justo después de `if (today > inv.validTo) ...`:

```ts
  // Un delivery vence por hora, no por día.
  if (inv.expiresAt && now > inv.expiresAt) return { ok: false, reason: 'expired' }
```

`cd api && npx drizzle-kit generate --name delivery`, revisar el SQL generado.

- [ ] **Step 4:** `npm test` → PASS. `tsc` va a marcar dónde falta `expiresAt` (`loadForCheck` en `services/entries.ts`: sumar `expiresAt: invitations.expiresAt`). `registerEntry` usa `select()` entero: ya lo trae.
- [ ] **Step 5:** commit `feat: el esquema y canEnter conocen el pase de delivery`.

### Task 2: alta del pase por el vecino

**Files:** Modify `api/src/services/invitations.ts`, `api/src/routes/invitations.ts`; Create `api/src/lib/delivery.ts`; Test `api/tests/delivery.test.ts`

**Produces:** `createDeliveryPass({ unitId, app, otro?, createdBy }): Promise<Invitation>`; `APP_LABEL`, `DELIVERY_HORAS`, `valoresDeDelivery(app, otro, ahora)` en `lib/delivery.ts`.

- [ ] **Step 1: tests que fallan** (`delivery.test.ts`, escenario como `alta-expres.test.ts`, vecino logueado):
  - `POST /invitations/delivery {unitId, app:'pedidosya'}` → 201, `kind 'delivery'`, `guestName 'PedidosYa'`, `capacity 1`, `expiresAt` ≈ ahora + 2 h, `validTo === todayInBuenosAires(new Date(expiresAt))`.
  - `app:'otro'` sin `otro` → 400 `falta_detalle`; con `otro:'Farmacia'` → `guestName 'Farmacia'`.
  - unidad ajena → 403 (lo que ya tira `assertMemberOfUnit`).
  - `POST /invitations` con `kind:'delivery'` → 400 (zod).
  - Revocar con `POST /invitations/:id/revoke` → 200.
  - Ingreso: `registerEntry` con `vi.setSystemTime` 2 h 1 min después → `AppError 409 'expired'`.
  - Seguro del auto exigido + patente sin seguro → 409 `no_vehicle_insurance`.
- [ ] **Step 2:** `npx vitest run tests/delivery.test.ts` → FAIL (404).
- [ ] **Step 3: implementar.** `lib/delivery.ts`:

```ts
import { todayInBuenosAires } from './dates.js'
import { AppError } from './errors.js'

export const DELIVERY_HORAS = 2
export const APPS = ['pedidosya', 'rappi', 'mercadolibre', 'otro'] as const
export type App = typeof APPS[number]
export const APP_LABEL: Record<Exclude<App, 'otro'>, string> = { pedidosya: 'PedidosYa', rappi: 'Rappi', mercadolibre: 'Mercado Libre' }

/** Lo que tiene de distinto un delivery: el nombre es la app y vence por hora. */
export function valoresDeDelivery(app: App, otro: string | undefined, ahora: Date) {
  const nombre = app === 'otro' ? otro?.trim() : APP_LABEL[app]
  if (!nombre) throw new AppError(400, 'falta_detalle')
  const expiresAt = new Date(ahora.getTime() + DELIVERY_HORAS * 3_600_000)
  return { kind: 'delivery', deliveryApp: app, guestName: nombre, expiresAt,
    validFrom: todayInBuenosAires(ahora), validTo: todayInBuenosAires(expiresAt), capacity: 1 }
}
```

`services/invitations.ts`: `createDeliveryPass` = `assertMemberOfUnit` + `insert({ unitId, createdBy, ...valoresDeDelivery(...), token: randomToken(16) })`. Ruta antes de `/:id`:

```ts
invitationRoutes.post('/delivery', async (req, res) => {
  const body = z.object({ unitId: z.string().uuid(), app: z.enum(APPS), otro: z.string().trim().max(40).optional() }).parse(req.body)
  res.status(201).json(await createDeliveryPass({ ...body, createdBy: req.person!.id }))
})
```

`historySchema.kind` suma `'delivery'` (el filtro del historial).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat: el vecino crea un pase de delivery de 2 horas`.

### Task 3: alta exprés con delivery y DNI obligatorio

**Files:** Modify `api/src/routes/gate.ts:62-77`, `api/src/services/invitations.ts:53-104`; Test `api/tests/alta-expres.test.ts`

- [ ] **Step 1: tests que fallan:** alta exprés sin `guestDoc` → 400 (visita, proveedor, delivery); `kind:'delivery', app:'rappi', guestDoc:'30123456'` → 201 con `guestName 'Rappi'` y `expiresAt`. Arreglar los tests existentes que crean altas sin DNI.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar.** Schema de la ruta: `guestDoc: z.string().trim().min(1)`, `kind: z.enum(['visita','proveedor','delivery']).optional()`, `app: z.enum(APPS).optional()`, `otro: z.string().trim().max(40).optional()`, `guestName: z.string().optional()` + `.refine((v) => v.kind === 'delivery' ? !!v.app : !!v.guestName?.trim(), { path: ['guestName'] })`. En `valoresDePorteria`, si `kind === 'delivery'`: `{ ...base, ...valoresDeDelivery(input.app!, input.otro, new Date()) }`. Actualizar el comentario de `createExpressInvitation` (el documento ya no es opcional).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat: el alta exprés suma delivery y pide siempre el documento`.

### Task 4: alerta de permanencia en minutos

**Files:** Modify `api/src/services/entries.ts:656-661`, `api/src/services/neighborhoods.ts`, `api/src/routes/admin.ts:160`; Test `api/tests/permanencia.test.ts`

- [ ] **Step 1: tests que fallan:** delivery adentro hace 31 min con umbral 30 → `alertaDesde` = ingreso + 30 min en `insideNow`; `PATCH /admin/neighborhood { overstayMinutes: { delivery: 4 } }` → 400; `null` → sin alerta.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementar.** En el `case` de `alertaDesde`: `when 'delivery' then abiertas.primero + make_interval(mins => n.overstay_minutes_delivery)`. `getNeighborhood` devuelve `overstayMinutes: { delivery }`; `updateNeighborhood` acepta `overstayMinutes?.delivery`; ruta: `overstayMinutes: z.object({ delivery: z.number().int().min(5).max(240).nullable().optional() }).optional()`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat: la alerta de permanencia del delivery va en minutos`.

### Task 5: lógica web

**Files:** Modify `web/src/lib/invitations.ts`, `web/src/lib/estado-invitacion.ts`; Test `web/src/lib/estado-invitacion.check.ts`

**Produces:** `Invitation['kind']` incluye `'delivery'`; `Invitation.expiresAt: string | null`; `KIND_LABEL.delivery = 'Delivery'`; `APPS_DELIVERY: { valor, etiqueta }[]`.

- [ ] **Step 1: check que falla:** `estadoInvitacion({ kind:'delivery', expiresAt: <hace 1 min>, validTo: hoy, usedCount: 0, adentro: false, revokedAt: null }, hoy, ahora)` → `'vencida'`; con `expiresAt` en el futuro → `'esperando'`. Mismo caso para `estadoEnAgenda`.
- [ ] **Step 2:** `npm run check` → FAIL.
- [ ] **Step 3:** sumar el parámetro `ahora: Date = new Date()` a las dos funciones y, antes del `validTo < hoy`: `if (inv.expiresAt && new Date(inv.expiresAt) < ahora) return 'vencida'`. (Comparar instantes con `new Date()` está bien; la regla es no usarlo para *calcular un día*.) Agregar `expiresAt` a `AgendaRow` y al `select` de `agendaForDay`/`insideNow` en la API (`i.expires_at as "expiresAt"`), y confirmar que `listForUnits` y `getInvitation` (`services/invitations.ts`) lo devuelven: si arman el `select` a mano, sumarlo.
- [ ] **Step 4:** PASS + `tsc` (cada `Record<Invitation['kind'], …>` que rompa suma su entrada `delivery`). **Step 5:** commit `feat: la web conoce el pase de delivery`.

### Task 6: vecino: "Espero un pedido"

**Files:** Create `web/src/components/vecino/espero-pedido.tsx`; Modify `web/src/app/(vecino)/page.tsx`, `web/src/components/vecino/fila-invitacion.tsx`, `web/src/lib/queries/` (mutación `useCrearDelivery`)

- [ ] **Step 1:** `espero-pedido.tsx`: `Sheet` con `side="bottom"` (`components/ui/sheet.tsx`) con título "¿De dónde viene?", bajada "La garita lo deja pasar las próximas 2 horas.", `Chips` en grilla 2×2 con `APPS_DELIVERY`, `Input` "¿Qué esperás?" solo si es Otro (max 40), `Select` de lote solo si `me.units.length > 1`, botón primario "Avisar a la garita". La mutación traduce `falta_detalle` → "Contanos de dónde viene el pedido." y cualquier otro → "No pudimos avisar. Probá de nuevo."
- [ ] **Step 2:** en el inicio, botón `variant="outline"` con ícono `Bike` ("Espero un pedido") debajo de "Nueva invitación", en mobile y desktop.
- [ ] **Step 3:** `fila-invitacion.tsx`: un delivery vigente no linkea al detalle; meta "Delivery · vence {hora(expiresAt)}" y acción "Anular" (la mutación existente). Orden: vigentes de delivery primero.
- [ ] **Step 4:** probar en el navegador (skill `run`) en 390 px: crear, ver la fila, anular. **Step 5:** commit `feat: el vecino avisa que espera un pedido desde el inicio`.

### Task 7: garita y admin

**Files:** Modify `web/src/components/dominio/tag-tipo.tsx`, `web/src/components/garita/alta-expres.tsx`, `web/src/components/garita/datos-agenda.ts`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, `web/src/app/(admin)/admin/barrio/page.tsx`, `web/src/lib/queries/admin.ts`, filtros de `components/auditoria/`

- [ ] **Step 1:** `TagTipo`: delivery lleva tag con `Bike` y fondo `bg-espera-tint text-espera`. `metaDe`: suma `vence {hora(expiresAt)}` si es delivery.
- [ ] **Step 2:** veredicto: título "{guestName} → {unitLabel}", etiqueta "Documento del repartidor" y "Patente (vacío = a pie o en bici)" cuando `kind === 'delivery'`.
- [ ] **Step 3:** alta exprés: tercera opción `{ valor: 'delivery', etiqueta: 'Delivery' }`; con delivery, los chips de app reemplazan al nombre; documento `required` con asterisco en los tres tipos.
- [ ] **Step 4:** admin *Barrio → Alertas*: campo numérico "Delivery: avisar a los __ minutos" (5–240, vacío = sin alerta). Auditoría: "Delivery" en el filtro de tipo.
- [ ] **Step 5:** probar en el navegador a 1280 px. Commit `feat: la garita y el admin muestran el pase de delivery`.

### Task 8: e2e y README

**Files:** Create `web/e2e/delivery.spec.ts`; Modify los e2e de alta exprés que no cargan DNI (`garita.spec.ts`, `buscador.spec.ts`: buscar `Autorizar sin invitación`), `README.md`

- [ ] **Step 1:** `delivery.spec.ts`: vecino → "Espero un pedido" → PedidosYa → "Avisar a la garita" → ve "Delivery · vence"; guardia busca "900" → abre → carga DNI → "Registrar ingreso" → aparece en Adentro → egreso.
- [ ] **Step 2:** `docker compose up -d --build && cd web && npm run e2e -- --workers=1` → todo PASS.
- [ ] **Step 3:** README: párrafo **Delivery** debajo de "Un evento no es nada especial" (qué crea el vecino, 2 h, DNI en la garita, seguro del vehículo, minutos de alerta, alta exprés con DNI obligatorio).
- [ ] **Step 4:** commit `docs: el pase de delivery en el readme`.
