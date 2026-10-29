# Auditoría: fila liviana, panel de detalle y Excel completo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** que en la auditoría las etiquetas no tapen el nombre y que el detalle de cada invitación (proveedor, seguro, invitación y movimientos) se vea en un **panel lateral**. Que todo salga en el Excel, y que se saque del tablero del admin la tabla de seguros.

**Decisiones del dueño (22/10):**
- Opción B del mockup (`.superpowers/brainstorm/8273-1792643319/content/auditoria-v1.html`): panel lateral.
- **Sin contador de días** en la auditoría ("en 5 días"): se muestran el estado y la fecha. El aviso de la garita no cambia.
- Se saca de `admin/page.tsx` el bloque "Seguros de proveedores", y con él `GET /admin/insurance`, que queda sin uso.

## Global Constraints

- Colores solo de los tokens de `globals.css`. Textos en voseo. La garita, desktop-first. Código en español.
- El panel es el `Sheet` que ya existe (`web/src/components/ui/sheet.tsx`), con foco, Esc y título accesible.
- El estado del seguro sale de `estadoSeguro` (`web/src/lib/seguro.ts`) en el front y de `seguroVigente` en la API. No dupliques la regla.
- Verificar la API con `cd api && npm test && npx tsc --noEmit`, y la web con `cd web && npm run check && npm run lint && npx tsc --noEmit`. El e2e, con `--workers=1`.

---

### Task 1: API

**Files:**
- Modify: `api/src/services/entries.ts` (`auditInvitations` y lo que alimenta el Excel), `api/src/routes/gate.ts` (las hojas del Excel), `api/src/routes/admin.ts`, `api/src/services/trades.ts` (o donde viva la consulta de `/admin/insurance`).
- Test: `api/tests/seguro-proveedor.test.ts`, `api/tests/audit.test.ts` y `api/tests/reports.test.ts`, según dónde estén hoy los tests del Excel.

- [ ] **Step 1: sacar la lista del admin.** Borrá `GET /admin/insurance`, su función de servicio y sus dos tests. Con `grep` confirmá que no queda nada que la use: el front se limpia en la Task 2.
- [ ] **Step 2: las filas de `auditInvitations`** suman `frequentAs` (si no está), `weekdays`, `note` (la del vecino), `requiresInsurance`, los tres campos del seguro, y `porteria` (creador con rol guard). También el `insuranceWarnDays` del barrio, una sola vez en la respuesta si el endpoint devuelve un objeto; si devuelve un array, por fila. Mirá el endpoint del front (`/gate/audit`) y respetá su forma.
- [ ] **Step 3: Excel, hoja Invitaciones.**
  - Reemplazá la columna `Seguro` por **Compañía**, **Póliza**, **Vence seguro** (`formato: 'fecha'`) y **Estado seguro**. Los valores de Estado seguro son `Vigente`, `Por vencer`, `Vencido`, `Sin cargar` y `No aplica`, calculados con `seguroVigente` y los días de aviso.
  - Sumá **Frecuente como** (`Visita` / `A trabajar` / vacío), **Días** (por ejemplo "Lun, Mié, Vie"; vacío si no tiene), **Nota del vecino** y **Autorizó portería** (`Sí` / vacío).
  - En la hoja Ingresos, sumá **Rubro**.
- [ ] **Step 4: test del Excel.** Generá el xlsx de un proveedor con seguro, leelo con la librería que ya usa el proyecto (mirá `lib/excel.ts`) y verificá los encabezados nuevos y los valores de Compañía, Estado seguro y Rubro en las dos hojas.
- [ ] **Step 5:** `npm test` y `tsc` en verde. Commit: `feat: la auditoría y el Excel traen todo el detalle del proveedor`.

### Task 2: web

**Files:**
- Modify: `web/src/components/auditoria/tabla.tsx`, `web/src/components/auditoria/tarjetas.tsx`, el tipo de la fila de auditoría (en `lib/gate.ts` o donde esté), `web/src/app/(admin)/admin/page.tsx`, `web/src/lib/queries/admin.ts`.
- Create: `web/src/components/auditoria/detalle.tsx`.
- Delete: `web/src/components/admin/seguros-vencimientos.tsx`.

- [ ] **Step 1: la fila (tabla y tarjetas).**
  - El **nombre**, entero y en negrita, sin `truncate`. A su lado, solo **iconos** de 20 px con `aria-label` y `title`: Frecuente (`Repeat`, `bg-azul-tint text-azul-text`) y Proveedor (`Truck`, `bg-surface-sunk text-ink-soft`). `TagManual` se deja como está.
  - Debajo, en la línea secundaria `text-xs text-ink-soft`:
    - si es proveedor: el rubro, y después el estado del seguro cuando importa: "· seguro por vencer" (`text-espera font-semibold`), "· seguro vencido" (`text-alto font-semibold`) o "· sin seguro" (`text-alto font-semibold`). **Sin días ni fechas en la fila.**
    - luego, DNI · patente, como hoy.
  - Toda la fila es clickeable: un `button` invisible que cubre la celda del nombre, o la fila con `role="button"`, `tabIndex=0` y Enter/Espacio, según lo que sea accesible en una tabla. Al final de la fila va una columna angosta con un chevron (`ChevronRight`) que abre el panel. El botón "×N / Detalle" de movimientos que hay hoy **se saca**: los movimientos pasan al panel.
- [ ] **Step 2: `detalle.tsx`.** Un `Sheet` lateral (en el celular, de abajo, como los otros sheets) titulado con el nombre del invitado, con bloques en tarjetas `rounded-md border border-line bg-card p-4`, en este orden:
  1. **Proveedor** (solo si es proveedor o frecuente a trabajar): Rubro, Compañía, Póliza, Vence (dd/mm/aaaa, coloreado por estado, **sin "en N días"**), Estado ("Vigente", "Por vencer", "Vencido" o "Sin cargar", con el mismo color) y Horario del rubro (`textoHorario` de las franjas, si el front las tiene a mano por `useRubrosDelBarrio`; si no, se omite).
  2. **Invitación:** Tipo ("Frecuente · viene a trabajar", "Proveedor", "Visita"); Días (si tiene); Vigencia; Nota del vecino (si tiene); "Invitó" (o "Autorizado por portería"); Estado; motivo de anulación (si tiene).
  3. **Movimientos:** reusá `Movimientos` (`components/auditoria/movimientos.tsx`) tal cual.
- [ ] **Step 3: tablero.** Sacá `SegurosVencimientos` de `admin/page.tsx`. Borrá el componente, `useSegurosVencimientos`, `claveSeguros` y sus invalidaciones. Lo de `insuranceWarnDays` en Barrio se queda: lo usa la garita.
- [ ] **Step 4: verificación visual.** `docker compose up -d --build web`. Mirá la auditoría como guardia a 1280 px (tabla) y a 390 px (tarjetas), en claro y en oscuro, con el panel abierto en Hugo (frecuente, proveedor, por vencer), en Lucía (sin seguro) y en una visita. Bajá el Excel desde la pantalla y abrilo con la librería para confirmar las columnas. Guardá las capturas en `…/scratchpad/auditoria-*.png`.
- [ ] **Step 5:** e2e. Si algún spec (`buscador`, `anulacion-guardia`, `carga-manual`) usaba el botón "×N" o "Detalle" de la auditoría, actualizá el selector para que abra el panel. Corré `npx playwright test --workers=1` sobre los specs que tocan la auditoría, más check, lint y tsc.
- [ ] **Step 6: README y spec.**
  - README: el párrafo de auditoría dice que el detalle se abre en un panel, y el del seguro ya no menciona la lista del tablero.
  - En `docs/superpowers/specs/2026-10-21-seguro-proveedor-design.md`, la regla 6 (lista del admin) pasa a "se sacó el 22/10: los vencimientos se ven en la auditoría y en el Excel".
  - Commit: `feat: auditoría con panel de detalle`.
