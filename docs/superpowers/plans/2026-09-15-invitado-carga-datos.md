# Datos cargados por el invitado + eventos con anotación — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Que el invitado cargue su propio documento desde el link, y que en los
eventos cada invitado se anote y se lleve su propio QR con su nombre.

**Architecture:** Una columna `parent_id` en `invitation` convierte a cada anotado
en una invitación hija normal — la garita no cambia. El cupo pasa a contarse por
familia. Un endpoint público sin sesión escribe solo campos seguros.

**Spec:** `docs/superpowers/specs/2026-09-14-invitaciones-qr-design.md`, secciones
5 (modelo), 6 (canEnter), 8 (página pública).

## Global Constraints

Rigen las mismas que en el plan de v1. Además:

- **El endpoint público escribe solo `guest_doc` y `plate`** (o crea una hija).
  Nunca nombre, fechas, cupo ni unidad.
- **Nada bloquea al invitado.** Si no completa, todo sigue funcionando como antes.
- **El documento es texto libre.** Sin validar formato argentino.
- **El QR del evento sigue vivo** como camino para el que no se anotó.

---

### Task 1: Migración — `parent_id` y datos del barrio

**Files:** `api/src/db/schema.ts`, `api/drizzle/0002_*.sql`
**Test:** `api/tests/schema.test.ts`

- [ ] `invitation.parent_id` uuid nullable, FK a `invitation(id)`.
- [ ] `neighborhood.address` text, `neighborhood.map_url` text, ambos nullable.
- [ ] Índice `invitation (parent_id)`.
- [ ] Único parcial: `CREATE UNIQUE INDEX invitation_event_doc_uq ON invitation
      (parent_id, lower(guest_doc)) WHERE parent_id IS NOT NULL AND guest_doc IS NOT NULL`.
      Drizzle no expresa bien el índice parcial con `lower()`; va en SQL a mano
      dentro de la migración generada.
- [ ] Test: dos hijas del mismo evento con el mismo documento violan
      `invitation_event_doc_uq`.
- [ ] Commit.

### Task 2: `canEnter` con uso por familia

**Files:** `api/src/services/entries.ts`
**Test:** `api/tests/gate.test.ts`

`canEnter` no cambia de firma: sigue recibiendo `usedCount`. Lo que cambia es
quién lo calcula.

- [ ] `familyUsage(invitationId, parentId)` cuenta ingresos de
      `invitation_id IN (raíz, todas sus hijas)` y devuelve `{ usedCount, lastEntryAt }`.
- [ ] `buildCheck` de una hija compara contra la **capacidad del padre**, y además
      rechaza si la hija ya tiene un ingreso propio.
- [ ] `registerEntry` toma el `FOR UPDATE` sobre **la raíz del evento**, no sobre
      la hija: es la fila que serializa el cupo compartido.
- [ ] Tests: evento cupo 2 con dos hijas → ambas entran, una tercera hija no;
      un ingreso directo contra el padre también descuenta del cupo; una hija no
      puede entrar dos veces.
- [ ] Commit.

### Task 3: Endpoints públicos

**Files:** `api/src/services/invitations.ts`, `api/src/routes/invitations.ts`
**Test:** `api/tests/public-invite.test.ts`

- [ ] `GET /invitations/public/:token` amplía la respuesta: `inviterName`,
      `unitLabel`, `neighborhood {name, address, mapUrl}`, `kind`, `isEvent`,
      `spotsLeft`, `hasDetails`. Sin mail, sin ids internos.
- [ ] `PATCH /invitations/public/:token` con `{ guestDoc?, plate? }`. Solo escribe
      campos **hoy vacíos**; ignora el resto del body. 404 si no existe, 409 si la
      invitación ya tiene ingresos registrados (congelada).
- [ ] `POST /invitations/public/:token/join` con `{ guestName, guestDoc? }`:
      valida que el padre sea `kind='evento'`, vigente y no revocado; cuenta
      hijas + ingresos dentro de una transacción con `FOR UPDATE` sobre el padre;
      si hay cupo crea la hija (`capacity: 1`, mismas fechas, misma unidad, mismo
      `created_by`) y devuelve su token. Si el documento ya se anotó, devuelve la
      hija existente en vez de crear otra.
- [ ] `revokeInvitation` revoca también las hijas.
- [ ] Rate limit por token en los dos endpoints de escritura.
- [ ] Tests: enriquecer datos; no pisar lo que cargó el vecino; no aceptar nombre
      ni fechas; anotarse; cupo lleno; documento duplicado devuelve la misma hija;
      revocar el evento deja a las hijas revocadas.
- [ ] Commit.

### Task 4: Admin — dirección y mapa del barrio

**Files:** `api/src/routes/admin.ts`, `api/src/services/neighborhoods.ts`,
`web/src/app/admin/barrio/page.tsx`, `web/src/components/shell.tsx`
**Test:** `api/tests/admin.test.ts`

- [ ] `GET /admin/neighborhood` y `PATCH /admin/neighborhood` con `{ name?, address?, mapUrl? }`.
- [ ] Pantalla `/admin/barrio` con los tres campos, más un ítem en la navegación.
- [ ] Test: un vecino no puede editar el barrio.
- [ ] Commit.

### Task 5: Front — la página pública en sus tres modos

**Files:** `web/src/app/i/[token]/page.tsx`, `web/src/components/guest-form.tsx`,
`web/src/app/page.tsx`

- [ ] Encabezado común: quién invita, unidad, y "Cómo llegar" (dirección + link
      de mapas) cuando el barrio los tenga cargados.
- [ ] Modo **visita/frecuente/proveedor**: QR arriba, formulario de documento y
      patente debajo. Si ya están cargados, no se muestra el formulario.
- [ ] Modo **evento sin anotar**: formulario de nombre + documento, cupo restante
      visible. Al anotarse, redirige a `/i/<tokenDeLaHija>`.
- [ ] Modo **hija / ya anotado**: su QR con su nombre. El navegador recuerda la
      anotación (`localStorage`, clave por token del evento) para que reabrir el
      link no muestre el formulario de nuevo.
- [ ] La tarjeta de evento del vecino muestra "N de M anotados".
- [ ] `npm run build` y `eslint --max-warnings=0` limpios.
- [ ] Commit.

## Cobertura

| Decisión del spec | Tarea |
|---|---|
| `parent_id`, dedupe por documento, datos del barrio | 1 |
| Cupo por familia, red del QR del evento | 2 |
| Escritura pública acotada, anotación, cascada | 3 |
| Cómo llegar configurable | 4 |
| Tres modos de la página pública | 5 |
