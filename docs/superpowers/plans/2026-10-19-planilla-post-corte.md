# Planilla post corte: plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o
> superpowers:executing-plans, tarea por tarea. Los pasos usan `- [ ]`.

**Objetivo:** reemplazar la carga manual de a una persona por una planilla
tabular con teclado, que admita gente sin invitación y deje la carga bien
marcada en la auditoría.

**Arquitectura:** `POST /gate/manual` acepta filas con `invitationId` o con
`guest`, exige `guestDoc` y devuelve el índice de la fila que falla. La lógica
pura de la planilla vive en `web/src/lib/carga-manual.ts`, con su check. La
auditoría lee una columna nueva `entry_log.loaded_at`.

**Stack:** Express + Drizzle + Postgres (api), Next.js 16 + TanStack Query
(web), vitest, Playwright.

**Spec:** [2026-10-19-planilla-post-corte-design.md](../specs/2026-10-19-planilla-post-corte-design.md)

## Restricciones globales

- Código y comentarios en español; la UI en voseo.
- Fechas siempre en hora de Buenos Aires (`api/src/lib/dates.ts`, `web/src/lib/fechas.ts`).
- Errores: `throw new AppError(status, 'codigo_en_snake')`.
- Colores: solo los tokens de `globals.css`.
- Commits: `feat:` / `fix:` en minúscula, con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificación final: la de `CLAUDE.md` (api test + tsc, web check + lint + tsc + e2e).

---

### Tarea 1: API de la carga (`guest`, `guestDoc`, `fila`, `loaded_at`)

**Archivos:** `api/src/lib/errors.ts`, `api/src/db/schema.ts`, migración nueva,
`api/src/services/invitations.ts`, `api/src/services/entries.ts:143-230`,
`api/src/routes/gate.ts:84-105`, `api/tests/carga-manual.test.ts`.

**Produce:** `CargaManual = { invitationId?: string; guest?: { name: string; unitId: string }; guestDoc: string; enteredAt: Date; exitedAt: Date | null; note?: string }`
y la respuesta de error `{ error: string, fila?: number }`.

- [ ] **Paso 1: actualizar el helper y escribir los tests que fallan.** En
  `carga-manual.test.ts`, el helper `cargar` agrega un DNI por defecto para que
  los tests existentes sigan valiendo:
  ```ts
  const cargar = (ctx: Awaited<ReturnType<typeof base>>, items: Record<string, unknown>[]) =>
    request(app).post('/gate/manual').set('Cookie', ctx.cookie)
      .send({ items: items.map((i) => ({ guestDoc: '30123456', ...i })) })
  ```
  Tests nuevos:
  - `'carga a alguien sin invitación: crea la invitación de portería del día del ingreso'`:
    con `guest: { name: 'Juan Pérez', unitId: ctx.u.id }` y `enteredAt: haceH(30)`,
    espera 201, una invitación con `createdBy = ctx.quien.id`, `capacity = 1`,
    `kind = 'visita'` y `validFrom = validTo =` el día de `haceH(30)` en
    Buenos Aires (`todayInBuenosAires(new Date(haceH(30)))`, que ya acepta cualquier instante).
  - `'rechaza una unidad de otro barrio para alguien sin invitación'`: 403.
  - `'rechaza un ítem sin DNI'`: con `guestDoc: ''`, espera 400.
  - `'completa el DNI de la invitación que no lo tenía'`: invitación con
    `guestDoc: null`, carga con `'28999111'`, y la invitación y el movimiento quedan con ese DNI.
  - `'si falla una fila no queda nada, tampoco la invitación de portería'`:
    `[guest válido, invitationId inexistente]` → 404, `body.fila === 1`, y la
    cantidad de invitaciones no cambió.
  - `'marca loaded_at en la carga manual'`: `fila.loadedAt` cerca de ahora.
- [ ] **Paso 2:** `cd api && npx vitest run tests/carga-manual.test.ts`. Esperado: FALLAN los nuevos.
- [ ] **Paso 3: `AppError` con fila.** En `errors.ts`, agregar un cuarto
  parámetro opcional `public fila?: number` y en el handler
  `res.status(err.status).json(err.fila === undefined ? { error: err.code } : { error: err.code, fila: err.fila })`.
- [ ] **Paso 4: columna y migración.** En `schema.ts`, debajo de `loadedBy`:
  `loadedAt: timestamp('loaded_at', { withTimezone: true }),` con el comentario
  "Cuándo se cargó a mano. La hora del movimiento es la declarada; esta es la
  real." Después correr `cd api && npx drizzle-kit generate --name carga_cargada_el`
  y revisar que el SQL sea solo `ALTER TABLE "entry_log" ADD COLUMN "loaded_at" timestamp with time zone;`.
- [ ] **Paso 5: la invitación de portería del día.** En `invitations.ts`,
  extraer de `createExpressInvitation` una función
  `valoresDePorteria(input: CreateExpressInvitationInput, dia: string)` que
  devuelva el objeto de `values(...)` con `validFrom: dia, validTo: dia`.
  `createExpressInvitation` la usa con `todayInBuenosAires()`. Se exporta.
- [ ] **Paso 6: `registerManual`.** Recorrer con índice y relanzar los
  `AppError` con la fila:
  ```ts
  for (const [n, it] of items.entries()) {
    try { creadas.push(await cargarUna(tx, neighborhoodId, loaderId, it, ahora, desde)) }
    catch (e) { if (e instanceof AppError) throw new AppError(e.status, e.code, e.message, n); throw e }
  }
  ```
  `cargarUna` es el cuerpo actual, con estos cambios:
  - si `it.guest`: `assertUnitInNeighborhood(it.guest.unitId, neighborhoodId)`
    (usar `tx` si hace falta pasarlo), insertar `valoresDePorteria({ ...it.guest, guestName: it.guest.name, guestDoc: it.guestDoc, createdBy: loaderId, neighborhoodId }, todayInBuenosAires(it.enteredAt))`
    y usar ese id. Sin chequeo de superposición.
  - si no: lo de hoy (con `FOR UPDATE`) y, si `!target.guestDoc`, completar
    `invitations.guestDoc` (como `registerEntry`, línea 134).
  - el insert del movimiento usa `guestDoc: it.guestDoc.trim()` y `loadedAt: ahora`.
  - si no viene ni `invitationId` ni `guest`: `AppError(400, 'tanda_invalida')`.
- [ ] **Paso 7: la ruta.** En el zod de `/gate/manual`, cada ítem pasa a ser
  `z.object({ invitationId: z.string().uuid().optional(), guest: z.object({ name: z.string().trim().min(1).max(120), unitId: z.string().uuid() }).optional(), guestDoc: z.string().trim().min(1).max(20), enteredAt, exitedAt, note }).refine((i) => Boolean(i.invitationId) !== Boolean(i.guest))`.
  Pasar `guest` y `guestDoc` a `registerManual`.
- [ ] **Paso 8:** `cd api && npm test && npx tsc --noEmit`. Esperado: todo PASA.
- [ ] **Paso 9: commit** `feat: la carga manual admite gente sin invitación, exige dni y avisa qué fila falla`.

### Tarea 2: auditoría (detalle y Excel)

**Archivos:** `api/src/services/reports.ts:122-156`, `api/src/routes/gate.ts:169-285`, `api/tests/carga-manual.test.ts`.

**Produce:** `EntryRow` suma `note: string | null`, `loadedAt: Date | null` y `loaderName: string | null`.

- [ ] **Paso 1: test que falla.** `'el detalle de movimientos trae la nota, quién cargó y cuándo'`:
  carga con nota, `GET /gate/audit/:id/entries` y espera `note`, `loaderName === 'Rulo'` y `loadedAt` no nulo.
  `'el excel marca el origen'`: `GET /gate/audit.xlsx`, leer el libro con
  `exceljs` (ya instalado) y esperar en la hoja "Ingresos" las columnas
  `Origen` = "Carga manual", `Cargado el` y `Nota`, y en "Invitaciones" la
  columna `Carga manual` = "Sí".
- [ ] **Paso 2:** correr el archivo. Esperado: FALLA.
- [ ] **Paso 3: `entriesLog`.** Sumar al select `e.note`, `e.loaded_at as "loadedAt"`,
  `lp.name as "loaderName"` con `left join person lp on lp.id = e.loaded_by`.
- [ ] **Paso 4: Excel.** En una función local
  `const guardia = (nombre: string | null, manual: boolean) => manual ? \`Carga manual · ${nombre ?? ''}\` : nombre ?? ''`
  y usarla en las dos hojas para "Guardia ingreso" y "Guardia salida". En
  "Ingresos", agregar `{ header: 'Origen', key: 'origen' }`,
  `{ header: 'Cargado el', key: 'cargado', width: 18, formato: 'fechaHora' }` y
  `{ header: 'Nota', key: 'nota', width: 30 }`. En "Invitaciones", agregar
  `{ header: 'Carga manual', key: 'manual' }` con `r.manual ? 'Sí' : 'No'`.
- [ ] **Paso 5:** `cd api && npm test && npx tsc --noEmit`. Esperado: PASA.
- [ ] **Paso 6: commit** `feat: la auditoría muestra quién y cuándo cargó a mano, con la nota`.

### Tarea 3: lógica pura de la planilla

**Archivos:** `web/src/lib/carga-manual.ts`, `web/src/lib/carga-manual.check.ts`.

**Produce:**
```ts
export type FilaPlanilla = {
  clave: string
  ingreso: string            // 'HH:MM' o lo que se tipeó
  persona: { invitationId: string; nombre: string; lote: string; dniInvitacion: string | null }
         | { nombre: string; unitId: string; lote: string } | null
  dni: string
  salida: string             // '' = sigue adentro
  nota: string
}
export type Planilla = { fecha: string; filas: FilaPlanilla[] }
export function normalizarHora(texto: string): string            // '2140' → '21:40', '9' → '09:00', inválida → ''
export function momentosDe(fecha: string, f: FilaPlanilla): { entrada: Momento; salida: Momento | null; masUnDia: boolean }
export function errorDeFila(fecha: string, f: FilaPlanilla, todas: FilaPlanilla[], ahora?: Date): string | null
export function aItems(p: Planilla): ItemManual[]               // lo que manda cargarManual
export function leerBorrador(texto: string | null): Planilla | null  // JSON inválido → null
```
`ItemManual = { invitationId?: string; guest?: { name: string; unitId: string }; guestDoc: string; enteredAt: string; exitedAt: string | null; note?: string }`.

- [ ] **Paso 1: checks que fallan,** agregados a `carga-manual.check.ts`:
  ```ts
  assert.equal(normalizarHora('2140'), '21:40')
  assert.equal(normalizarHora('9'), '09:00')
  assert.equal(normalizarHora('21:4'), '21:04')
  assert.equal(normalizarHora('25:00'), '')
  const f = (o: Partial<FilaPlanilla>): FilaPlanilla => ({ clave: 'x', ingreso: '23:30', persona: { nombre: 'Juan', unitId: 'u', lote: 'Lote 1' }, dni: '30123456', salida: '00:40', nota: '', ...o })
  const mo = momentosDe('2026-10-15', f({}))
  assert.equal(mo.masUnDia, true)
  assert.equal(mo.salida!.fecha, '2026-10-16')
  assert.match(errorDeFila('2026-10-15', f({ dni: '' }), [], AHORA)!, /DNI/)
  assert.match(errorDeFila('2026-10-15', f({ persona: null }), [], AHORA)!, /persona/)
  assert.equal(errorDeFila('2026-10-15', f({}), [], AHORA), null)
  assert.deepEqual(aItems({ fecha: '2026-10-15', filas: [f({ nota: 'corte' })] })[0], {
    guest: { name: 'Juan', unitId: 'u' }, guestDoc: '30123456',
    enteredAt: '2026-10-15T23:30:00-03:00', exitedAt: '2026-10-16T00:40:00-03:00', note: 'corte',
  })
  assert.equal(leerBorrador('{roto'), null)
  assert.deepEqual(leerBorrador(JSON.stringify({ fecha: '2026-10-15', filas: [f({})] }))?.filas.length, 1)
  ```
  Borrar los checks de `resumenCarga` y del tipo `Carga` viejo.
- [ ] **Paso 2:** `cd web && node src/lib/carga-manual.check.ts`. Esperado: FALLA.
- [ ] **Paso 3: implementar.** `errorDeFila` reusa `validarCarga` y `pisaOtra`
  (adaptado a `invitationId` de la fila; las filas sin invitación nunca se
  pisan) y suma, en este orden: "Elegí a la persona.", "Falta el DNI: en la
  puerta siempre se pide.". `aItems` hace `trim()` del DNI y omite `note` si
  está vacía. Borrar `Carga` y `resumenCarga`.
- [ ] **Paso 4:** `cd web && npm run check`. Esperado: PASA.
- [ ] **Paso 5: commit** `feat: lógica de la planilla post corte`.

### Tarea 4: la pantalla `/garita/cargar`

**Archivos:** `web/src/app/(garita)/garita/cargar/page.tsx` (reescrito), nuevo
`web/src/components/garita/renglon-planilla.tsx`, `web/src/lib/gate.ts:112-125`,
`web/src/lib/api.ts`.

**Consume:** todo lo de la Tarea 3; `useBusqueda`, `useAgenda(fecha)` y `useCargarManual` de `lib/queries/garita.ts`; `useBuscarUnidades` (la misma búsqueda de lote del alta exprés, `alta-expres.tsx`).

- [ ] **Paso 1: `ApiError` con fila.** En `api.ts`, `ApiError` suma
  `public fila?: number` y el `throw` pasa `body.fila`. `cargarManual` recibe `ItemManual[]`.
  `mensajeCargaManual` suma `tanda_invalida` y `not_your_neighborhood`: "Ese lote no es de este barrio.".
- [ ] **Paso 2: `RenglonPlanilla` (componente).** Una `<tr>` en escritorio (≥ 640px)
  y una tarjeta en el celular, con estos campos en orden de Tab: Ingreso
  (`Input` con `inputMode="numeric"`, normaliza en `onBlur`), Persona
  (buscador: sugiere primero la agenda del día que contenga el texto y
  después `useBusqueda`; al final, "Cargar «texto» sin invitación"), DNI,
  Lote (texto bloqueado si hay invitación; si no, buscador con `useBuscarUnidades`),
  Salida (igual que Ingreso, con "+1 día" al lado si `masUnDia`) y Nota. Un
  botón × para quitar. El error de la fila va debajo, con `role="alert"`, en
  `text-alto`. Enter en Nota llama a `onEnterFinal()`.
- [ ] **Paso 3: la página.** El estado es una `Planilla`. Se inicializa con
  `leerBorrador(localStorage.getItem('pazzit.garita.planilla'))` o con una fila
  vacía, y se guarda en cada cambio (con `try/catch`). Arriba: `CampoFecha` de la planilla y
  el subtítulo actual. Abajo: "Agregar fila" y "Guardar N movimientos",
  deshabilitado si hay filas con error. Al guardar bien: toast, borrar el
  borrador y dejar una fila vacía. Si la API devuelve `fila`, mostrar ese
  error en esa fila (con `mensajeCargaManual`) y hacer foco en su Ingreso.
- [ ] **Paso 4:** `cd web && npm run check && npm run lint && npx tsc --noEmit`. Esperado: PASA.
- [ ] **Paso 5: commit** `feat: la carga post corte es una planilla con teclado`.

### Tarea 5: detalle de la auditoría y e2e

**Archivos:** `web/src/lib/queries/auditoria.ts:37-47`,
`web/src/components/auditoria/movimientos.tsx`, `web/e2e/carga-manual.spec.ts`.

- [ ] **Paso 1: e2e que falla** (reemplaza los dos tests actuales):
  - El guardia abre `/garita/cargar` y, en la fila 1, escribe `0000` en Ingreso,
    busca la invitación del vecino y la elige, completa el DNI y escribe la nota `corte de luz`.
    "Agregar fila" y, en la fila 2, escribe `0000` y `Juan Sinvite ${Date.now()}`, elige
    "Cargar … sin invitación", carga el DNI y elige el lote `Lote 900`.
  - Recarga la página: las dos filas siguen ahí.
  - "Guardar 2 movimientos" y aparece el toast.
  - En `/auditoria`, la búsqueda de cada nombre muestra "Manual", la segunda
    muestra "Autorizado por portería", y al desplegar se ve `corte de luz` y "Cargado a mano por".
- [ ] **Paso 2:** `cd web && npx playwright test e2e/carga-manual.spec.ts`. Esperado: FALLA en el detalle.
- [ ] **Paso 3:** `Movimiento` suma `note`, `loadedAt` y `loaderName`. En
  `Movimientos`, si `m.manual`: los nombres de guardia se muestran como
  "Carga manual · {nombre}", y debajo va una línea `text-ink-soft` con
  "Cargado a mano por {loaderName} el {fechaHora(loadedAt)}" (se omite si
  `loadedAt` es null) y la nota si hay.
- [ ] **Paso 4:** rebuild (`docker compose up -d --build web api`) y correr toda
  la verificación de `CLAUDE.md`. Esperado: PASA.
- [ ] **Paso 5: commit** `feat: el detalle de la auditoría muestra la carga manual completa`.
