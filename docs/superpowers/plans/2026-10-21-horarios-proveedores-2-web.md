# Horarios de proveedores 2: web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** panel de rubros y franjas en el admin, rubro y horario para el vecino y el invitado, y veredicto "Fuera de horario" con "Autorizar igual" discreto.
**Architecture:** la lógica pura vive en `web/src/lib/franjas.ts` con su `franjas.check.ts`, y los componentes solo la muestran. Los datos salen de la API del plan 1.
**Tech Stack:** Next.js 16, React 19, Tailwind v4, TanStack Query, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-21-horarios-proveedores-design.md`. **Requiere** el plan 1 mergeado en la rama. Los mockups aprobados están en `.superpowers/brainstorm/1023-1792613019/content/horarios-v1.html` (admin A) y `horarios-v2.html` (veredicto A y frecuente).

## Global Constraints

- Colores solo de los tokens de `globals.css` (`espera`, `espera-tint`, `azul-tint`, `no-pasa`…). Nada de hex.
- Textos en voseo. Admin y garita desktop-first; vecino e invitado mobile-first.
- Hora de Buenos Aires: `lib/fechas.ts` (`TZ`, `hoyISO`). Nunca `new Date()` para calcular un día.
- Next.js 16: leer `web/AGENTS.md` antes de usar una API de Next.
- Verificar: `cd web && npm run check && npm run lint && npx tsc --noEmit`; e2e con `--workers=1` y el stack levantado.

---

### Task 1: `lib/franjas.ts` y su check

**Files:** Create `web/src/lib/franjas.ts`, `web/src/lib/franjas.check.ts` · Modify `web/package.json` (sumar `node src/lib/franjas.check.ts &&` al script `check`)
**Produces:**
- `type Franja` (igual que en la API)
- `textoDias(days): string`
- `textoHorario(f): string`
- `franjasDelRubro(franjas, tradeId): Franja[]`
- `diasSinFranja(franjas, tradeId, dias): number[]`
- `vigentesHoy(franjas, ahora): Franja[]`
- `detalleFueraDeHorario(franjas, tradeName, ahora): string`
- `nombreDiaPlural(dia: number): string` ("Sábados")
- `temporadaRige(season, mmdd): boolean`

- [ ] **Step 1: check que falla** (`franjas.check.ts`):

```ts
/** `node src/lib/franjas.check.ts`. */
import assert from 'node:assert/strict'
import { textoDias, textoHorario, franjasDelRubro, diasSinFranja, vigentesHoy, detalleFueraDeHorario, type Franja } from './franjas.ts'

const P = 'pileta'
const alamo: Franja[] = [
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00', season: { from: '04-01', to: '10-31' }, trades: null },
  { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00', season: { from: '11-01', to: '03-31' }, trades: null },
  { days: [6], from: '08:00', to: '13:00', season: null, trades: [P] },
]
assert.equal(textoDias([1, 2, 3, 4, 5]), 'Lunes a viernes')
assert.equal(textoDias([6]), 'Sábados')
assert.equal(textoDias([0, 1, 2, 3, 4, 5, 6]), 'Todos los días')
assert.equal(textoDias([1, 3, 5]), 'Lun, Mié, Vie')
assert.equal(textoHorario(alamo[0]), 'Lunes a viernes, 8 a 17')
assert.equal(textoHorario({ ...alamo[0], from: '08:30', to: '24:00' }), 'Lunes a viernes, 8:30 a 24')
assert.equal(franjasDelRubro(alamo, 'plomero').length, 2)
assert.equal(franjasDelRubro(alamo, P).length, 3)
assert.equal(franjasDelRubro(alamo, null).length, 2)
// Un día "sin franja" es uno que ninguna franja del rubro cubre, en ninguna temporada.
assert.deepEqual(diasSinFranja(alamo, 'plomero', [1, 3, 6]), [6])
assert.deepEqual(diasSinFranja(alamo, P, [1, 6]), [])
assert.deepEqual(diasSinFranja([], 'plomero', [0, 6]), [])
// 21/10, martes, 17:40 en Buenos Aires.
const martes = new Date('2026-10-21T17:40:00-03:00')
assert.deepEqual(vigentesHoy(alamo, martes), [alamo[0], alamo[2]])
assert.equal(detalleFueraDeHorario(franjasDelRubro(alamo, 'plomero'), 'Plomero', martes),
  'Plomero: lunes a viernes de 8 a 17 · Son las 17:40')
const sabado = new Date('2026-10-24T10:00:00-03:00')
assert.equal(detalleFueraDeHorario(franjasDelRubro(alamo, 'plomero'), 'Plomero', sabado),
  'Su rubro no entra los sábados')
console.log('franjas: ok')
```

- [ ] **Step 2:** `node src/lib/franjas.check.ts`. Falla porque el módulo no existe.
- [ ] **Step 3: implementación.** Usá `TZ` y `hoyISO` de `./fechas.ts`, y para la hora `Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`. El día de la semana sale con `weekday: 'short'` en `en-US`, igual que la API.
  - `temporadaRige` es la misma de la API (from > to cruza el año).
  - `textoDias`:
    - lun a vie → `Lunes a viernes`;
    - los 7 → `Todos los días`;
    - un solo día → el plural (`Sábados`, `Domingos`, `Lunes`…);
    - si no, `DIAS` de `./invitations.ts` unidos con `, `.
  - Hora corta: `'08:00'→'8'`, `'08:30'→'8:30'`, `'24:00'→'24'`.
  - `detalleFueraDeHorario`:
    - con franjas del rubro que hoy rigen por temporada y día: `${tradeName}: ${textoDias(f.days).toLowerCase()} de ${desde} a ${hasta} · Son las HH:MM` (la primera);
    - si no hay ninguna: `Su rubro no entra los ${nombreDiaPlural(hoy).toLowerCase()}`.
- [ ] **Step 4:** `npm run check`: verde.
- [ ] **Step 5:** commit `feat: lógica de franjas en el front`.

### Task 2: panel de proveedores en el admin

**Files:** Create `web/src/components/admin/horarios-proveedores.tsx`, `web/src/components/admin/rubros.tsx` · Modify `web/src/lib/admin.ts` (tipos y llamadas), `web/src/app/(admin)/admin/barrio/page.tsx`
**Consumes:** `GET/POST/PATCH /admin/trades` y `providerWindows` en `/admin/neighborhood` (plan 1); `textoDias`, `textoHorario`, `vigentesHoy`, `franjasDelRubro` (Task 1).

- [ ] **Step 1:** `lib/admin.ts` suma:
  - `type Rubro = { id: string; name: string; archivedAt: string | null }`;
  - `providerWindows: Franja[]` en el tipo del barrio;
  - `rubros()`, `crearRubro(name)` y `editarRubro(id, { name?, archived? })`, con el mismo patrón `api<…>()` que las llamadas que ya existen.
- [ ] **Step 2: `rubros.tsx`** (mockup A, tarjeta "Rubros"):
  - chips con el nombre;
  - un menú con "Renombrar" (input inline, Enter guarda, Esc cancela) y "Archivar" ("Desarchivar" en los archivados, que se muestran con `text-ink-soft` detrás de "Ver archivados");
  - un input "Nuevo rubro" con el botón "Agregar";
  - la nota "Archivar un rubro lo saca de la lista del vecino. Las invitaciones que ya lo usan siguen valiendo."
  - Errores: `rubro_duplicado` → "Ya hay un rubro con ese nombre."
- [ ] **Step 3: `horarios-proveedores.tsx`** (mockup A, tabla):
  - columnas Días (siete toggles L M M J V S D, `bg-ink text-card` cuando está activo), Horario (dos `<input type="time">`; "hasta 24:00" con un checkbox "hasta medianoche" que guarda `'24:00'`), Temporada ("Todo el año", o dos selectores día/mes), Rubros (chips, o "Todos"; se eligen con un popover de checkboxes que tiene "Todos los rubros" arriba) y "Quitar";
  - la franja que rige hoy lleva la badge "Hoy" (`bg-verde-tint text-verde`);
  - "+ Agregar franja" agrega una fila L–V 08:00–17:00, todo el año, todos;
  - "Guardar horarios" hace PATCH con `providerWindows` completo;
  - `franja_invalida` → "Revisá las franjas: cada una necesita al menos un día y un horario de inicio anterior al de fin."
  - El texto de ayuda va arriba de la tabla (copialo del mockup).
- [ ] **Step 4: recuadro "Hoy"** en el `aside` de la página de barrio, solo con la sección Proveedores visible:
  - título "Hoy, {día} {dd/mm}";
  - una línea por franja de `vigentesHoy` que incluya el día de hoy ("Todos los rubros · 8 a 17");
  - las mismas líneas para el próximo sábado y el próximo domingo ("Cerrado" si no hay ninguna);
  - si hay una franja con temporada que empieza en los próximos 30 días: "Desde el 1/11 rige 8 a 18".
- [ ] **Step 5:** en `barrio/page.tsx`, sumá la sección "Proveedores" como en el mockup (pestañas "Datos y marca", "Alertas" y "Proveedores", o una sección más abajo si la página no tiene pestañas: respetá lo que haya). Mirala a 1280 px, en claro y en oscuro.
- [ ] **Step 6:** `npm run lint && npx tsc --noEmit`. Commit `feat: panel de rubros y horarios de proveedores`.

### Task 3: rubro y horario para el vecino y el invitado

**Files:** Modify `web/src/lib/invitations.ts`, `web/src/components/vecino/formulario-invitacion.tsx`, `web/src/components/vecino/fila-invitacion.tsx`, `web/src/app/i/[token]/page.tsx` · Create `web/src/components/dominio/horario-rubro.tsx`
**Consumes:** `GET /invitations/trades`, `tradeId` y `tradeName` en la invitación, `franjas` en la página pública (plan 1); `franjasDelRubro`, `textoHorario`, `diasSinFranja`, `textoDias`, `temporadaRige` (Task 1).

- [ ] **Step 1:** `Invitation` suma `tradeId: string | null; tradeName: string | null`. Agregá `rubrosDelBarrio()` → `GET /invitations/trades`.
- [ ] **Step 2: `horario-rubro.tsx`**, una caja `rounded-md border border-line bg-card` con:
  - el título que recibe por prop ("Puede entrar" o "Horario de ingreso para plomeros");
  - una línea por franja: días a la izquierda y horas a la derecha, con `tabular`;
  - primero las que rigen hoy por temporada; las que no rigen van en `text-ink-soft text-xs` con "Desde el 1/11".
- [ ] **Step 3: formulario.** Con tipo `proveedor`, o `frecuente` + `frecuenteComo === 'proveedor'`, y si `rubrosDelBarrio` trae rubros:
  - un `Select` "Rubro" obligatorio (error "Elegí el rubro.") con `HorarioRubro` debajo;
  - se manda `tradeId` y, si se elige frecuente de visita, se manda `tradeId: null`;
  - **aviso amarillo** (`bg-espera-tint text-espera rounded-md p-3`, no bloquea):
    - proveedor: `diasSinFranja(franjas, tradeId, [díaDe(validFrom)])`;
    - frecuente: lo mismo con `dias` (si no hay días marcados, los 7 días);
    - texto: "Los sábados no entran plomeros: ese día la guardia lo va a rechazar.", con el día en plural, el rubro en minúscula y en plural (`+ 's'`, o `+ 'es'` si termina en consonante distinta de s); usá `nombreDiaPlural` de Task 1;
  - en el selector de días, el día que choca lleva `bg-espera-tint text-espera ring-2 ring-espera`;
  - errores: `rubro_requerido` → "Elegí el rubro."; `rubro_invalido` → "Ese rubro ya no está disponible. Elegí otro."
- [ ] **Step 4: `fila-invitacion.tsx`.** Una frecuente de proveedor muestra el chip con el `tradeName`. Si `diasSinFranja` sobre sus `weekdays` (o los 7 días) no da vacío, suma la línea `text-espera text-xs font-semibold`: "Los sábados no puede entrar". Las franjas salen de `rubrosDelBarrio()`, que ya está en caché.
- [ ] **Step 5: `/i/[token]`.** Si la invitación trae `franjas` no vacías y `tradeName`, va `HorarioRubro` con el título "Horario de ingreso para {rubro en plural}" debajo del pase, y la nota "Fuera de ese horario la guardia no te deja pasar."
- [ ] **Step 6:** mirá el formulario a 390 px, en claro y oscuro: proveedor, frecuente de proveedor y frecuente de visita (esta última sin rubro). Lint y tsc. Commit `feat: el vecino elige el rubro y ve el horario`.

### Task 4: garita

**Files:** Modify `web/src/lib/gate.ts`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, `web/src/components/dominio/tag-tipo.tsx` y sus usos (`grep -rln "TagTipo" src`)
**Consumes:** `check.reason === 'outside_hours'`, `invitation.tradeName` y `franjas` en `/gate/check` (plan 1); `detalleFueraDeHorario` (Task 1).

- [ ] **Step 1:** `MOTIVO.outside_hours = 'Fuera de horario'`. `detalleRechazo` suma el parámetro opcional `extra?: { franjas: Franja[]; tradeName: string | null }`, y para `outside_hours` devuelve `detalleFueraDeHorario(extra.franjas, extra.tradeName ?? 'Proveedor', new Date())`. Pasáselo desde el veredicto.
- [ ] **Step 2: "Autorizar igual" discreto en todos los motivos** (mockup v2 A):
  - va **debajo** de "Volver (Esc)" como `button` con `min-h-11 text-base font-semibold underline underline-offset-4 opacity-80`, con el texto "Autorizar igual…";
  - "Volver (Esc)" pasa a ser el botón principal (`bg-no-pasa-texto text-no-pasa`, `min-h-16`) y conserva el `ref={accionRef}`;
  - las condiciones de cuándo aparece no cambian (nunca en `revoked`).
- [ ] **Step 3:** `TagTipo` suma la prop `tradeName?: string | null`; si es proveedor y viene, el tag dice `Proveedor · {tradeName}`. Pasala en tarjeta, lista, compacta, tablero, buscador, veredicto (fila "Tipo") y auditoría (tabla y tarjetas), que es donde hoy se pasa `frequentAs`. Los tipos `Hit` y `AgendaRow` de `lib/gate.ts` suman `tradeName`.
- [ ] **Step 4:** mirá el veredicto a 1280 px y a 390 px con un proveedor fuera de horario y con una visita sin cupo: los dos tienen el link discreto. Lint y tsc. Commit `feat: la garita rechaza proveedores fuera de horario`.

### Task 5: e2e y cierre

**Files:** Create `web/e2e/horarios-proveedores.spec.ts` · Modify `web/e2e/garita.spec.ts` (si algún test hace clic en "Autorizar igual" por su rol o su texto)

- [ ] **Step 1: el spec.** Usá `preparar.ts` y `sesion.ts` como `permanencia.spec.ts`.
  - El admin entra a Barrio → Proveedores, crea el rubro "Plomero", agrega una franja de **un minuto que ya pasó hoy** (calculada en hora de Buenos Aires desde la página, o vía API en el `beforeAll`) solo con Plomero, y guarda.
  - El vecino crea un proveedor, elige "Plomero" y ve la caja "Puede entrar".
  - La garita abre la invitación y ve "NO PASA", "Fuera de horario" y el link "Autorizar igual…"; al hacer clic, se abre el alta exprés precargada.
  - `afterAll`: deja `providerWindows: []` vía API para no romper otros specs (la base de desarrollo no se limpia).
- [ ] **Step 2:** `docker compose up -d --build` y `cd web && npx playwright test horarios-proveedores garita vecino --workers=1`: verde.
- [ ] **Step 3:** suite completa: `cd api && npm test && npx tsc --noEmit` y `cd web && npm run check && npm run lint && npx tsc --noEmit`.
- [ ] **Step 4:** README: en "Cómo funciona", un párrafo para "Horarios de proveedores": el admin carga rubros y franjas; sin franjas no hay restricción; fuera de horario la garita rechaza y puede autorizar igual. Actualizá el estado del spec a "implementado".
- [ ] **Step 5:** commit `feat: e2e de horarios de proveedores`.
