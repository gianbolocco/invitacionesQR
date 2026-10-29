# Alta exprés de proveedor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** que "Autorizar sin invitación" y "Autorizar igual" puedan crear un **proveedor** con rubro y seguro, igual que la invitación que arma el vecino.
**Decisión (del dueño, 22/10):**
- Lo que crea la portería ya lo autorizó el guardia: `canEnter` **no evalúa horario ni seguro** en una invitación creada por un guardia.
- Igual queda registrada como proveedor, con su rubro y su seguro si se cargó, para la marca, la permanencia y la auditoría.
- Sigue siendo de un día, una vez y una persona.

**Contexto:**
- Feature mediana: hay plan, sin spec aparte.
- Antecedentes: `2026-10-12-garita-alta-expres-design.md`, `2026-10-21-horarios-proveedores-design.md` y `2026-10-21-seguro-proveedor-design.md`.

## Global Constraints

- `canEnter` sigue puro. El caso de portería entra como un flag `porteria: boolean` que calcula quien llama. **No** se saltean `revoked`, `not_yet`, `expired`, `wrong_weekday` ni `no_capacity`.
- Para validar el rubro y el seguro, reusá `assertRubro` y `assertSeguro` de `services/invitations.ts`. No dupliques la validación.
- Errores: `AppError(status, 'snake')`. Colores: solo tokens. Textos en voseo. Código en español.
- Verificar en la API con `cd api && npm test && npx tsc --noEmit`, y en la web con `cd web && npm run check && npm run lint && npx tsc --noEmit`. El e2e corre con `--workers=1`.

---

### Task 1: API

**Files:** Modify `api/src/authz.ts`, `api/tests/authz.test.ts`, `api/src/services/invitations.ts` (`createExpressInvitation`, `valoresDePorteria`), `api/src/routes/gate.ts`, `api/src/services/entries.ts` (`aLike`, `loadForCheck`, `registerEntry`) · Test `api/tests/alta-expres.test.ts`

- [ ] **Step 1: tests de `canEnter`.**
  - `InvitationLike` suma `porteria: boolean`. En `base`, va en `false`.
  - Los tests: un proveedor con `porteria: true` fuera de franja da `{ok:true}`; con `requiresInsurance: true` y sin seguro, también `{ok:true}`.
  - El cupo sigue rechazando cuando `porteria` es true: `no_capacity`.
- [ ] **Step 2: implementación en `canEnter`.**
  - `outside_hours` exige `!inv.porteria && aplicaFranjas(...) && !dentroDeFranja(...)`.
  - El bloque del seguro va dentro de `if (inv.requiresInsurance && !inv.porteria)`.
  - Comentario del porqué: "lo creó la portería: el guardia ya decidió".
- [ ] **Step 3: `entries.ts`.**
  - `loadForCheck` y `registerEntry` necesitan el rol del creador.
  - `loadForCheck` ya hace join con `people` por `createdBy`: sumá `creatorRole: people.role`. En `registerEntry`, leelo con un select a `people` dentro de la misma tx, **después** del `FOR UPDATE`.
  - `aLike` arma `porteria: creatorRole === 'guard'`.
- [ ] **Step 4: tests de `POST /gate/invitations`** (en `tests/alta-expres.test.ts`, con sus helpers):
  - `{kind:'proveedor', tradeId}` responde 201 y guarda `kind='proveedor'`, `trade_id` y el seguro si viene;
  - con rubros cargados y sin `tradeId`, `400 rubro_requerido`;
  - `insurance` en un rubro que no lo pide, `400 seguro_no_aplica`;
  - sin `kind` crea una visita, como hoy;
  - con una franja que no deja pasar a nadie (`days` todos, de 00:00 a 00:01), un proveedor de portería de un rubro que pide seguro y sin seguro: `GET /gate/invitation/:id` da `check.ok: true` y `POST /gate/entries` responde 201.
- [ ] **Step 5: implementación del alta.**
  - `CreateExpressInvitationInput` suma `kind?: 'visita'|'proveedor'`, `tradeId?: string|null` e `insurance?: Seguro|null`.
  - `createExpressInvitation` llama a `assertRubro(neighborhoodId, kind, null, tradeId)` y a `assertSeguro(...)`, como `createInvitation`.
  - `valoresDePorteria` usa `kind ?? 'visita'`, `tradeId ?? null` y las columnas del seguro (con el mapper `columnasSeguro` que ya existe).
  - La ruta suma `kind: z.enum(['visita','proveedor']).optional()`, `tradeId: z.string().uuid().nullable().optional()` e `insurance: zSeguro.optional()`.
  - Fijate si `carga-manual` usa `valoresDePorteria`. Si la usa, no tiene que cambiar su comportamiento: sin `kind`, sigue siendo visita.
- [ ] **Step 6:** `npm test` y `tsc` en verde. Commit `feat: la portería da de alta proveedores con rubro y seguro`.

### Task 2: web

**Files:** Modify `web/src/components/garita/alta-expres.tsx` (y el tipo `InicialAlta`), `web/src/lib/gate.ts` (el llamado del alta), `web/src/app/(garita)/garita/invitacion/[id]/page.tsx` (la precarga de "Autorizar igual"), `web/src/components/auditoria/tabla.tsx`, `web/src/components/auditoria/tarjetas.tsx` · Test `web/e2e/garita.spec.ts`

- [ ] **Step 1: el formulario del alta.**
  - Arriba de todo, el selector **Visita / Proveedor**. Usá el mismo componente de chips que el formulario del vecino (`Chips` en `components/vecino` o donde viva). Por defecto, Visita.
  - Con **Proveedor**:
    - el campo **Rubro**, obligatorio si hay rubros. Los rubros salen de `GET /invitations/trades` con el hook del vecino: buscá `useRubrosDelBarrio`;
    - si el rubro pide seguro, el bloque **Seguro (opcional)** con `CamposSeguro` y `erroresSeguro`: los tres campos o ninguno;
    - la nota en `text-ink-soft`: "Lo autorizás vos: no se controla el horario ni el seguro."
  - El payload manda `kind`, `tradeId` e `insurance` (solo si está completo).
  - Errores: `rubro_requerido` → "Elegí el rubro."; `seguro_no_aplica` → "Este rubro no pide seguro.".
- [ ] **Step 2: "Autorizar igual".**
  - `InicialAlta` suma `kind`, `tradeId` y `seguro`.
  - La precarga desde el veredicto rechazado pasa `kind: 'proveedor'` si la invitación era proveedor, o frecuente con `frequentAs === 'proveedor'`. También pasa su `tradeId` (si sigue activo en la lista) y su seguro.
- [ ] **Step 3: auditoría.**
  - Con la etiqueta "Proveedor · Rubro", el nombre del invitado se corta ("Hugo P…").
  - En `tabla.tsx` (~61), poné el nombre en su propia línea (`block`, con `break-words` y sin `truncate`) y las etiquetas debajo con `mt-1 flex flex-wrap gap-1`. Hacé lo mismo en `tarjetas.tsx` si pasa ahí.
  - Mirala a 1280 px.
- [ ] **Step 4: e2e en `garita.spec.ts`.**
  - "Autorizar sin invitación" → Proveedor → elegir un rubro creado por API en el test → el veredicto muestra "Proveedor · {rubro}" y registra el ingreso aunque haya una franja cerrada.
  - En el `finally`, archivá el rubro y dejá `providerWindows: []`.
- [ ] **Step 5:** mirá el alta a 1280 y 390 px. `docker compose up -d --build` y `npx playwright test garita --workers=1`. Corré check, lint y tsc. README: en el párrafo del alta exprés de la garita, sumá que puede ser visita o proveedor, y que a un proveedor autorizado por la portería no se le controla horario ni seguro. Commit `feat: la garita autoriza proveedores sin invitación`.
