# Rediseño · Fase 5: Limpieza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el rediseño de VisitPass borrando todo el código y CSS que las fases 1 a 4 dejaron sin uso, sumar el escenario de egreso que faltaba en los e2e de garita, y hacer una pasada de accesibilidad manual sobre los tres flujos de más interacción.

**Architecture:** Fase de higiene pura — no hay pantallas nuevas ni cambios de comportamiento. Se borran archivos y reglas CSS confirmados sin importadores, se sacan dos dependencias npm que quedan sin uso, se agrega un test de Playwright, y se verifica todo (tipos, lint, build, suites, visual) al final.

**Tech Stack:** Next 16.3 (App Router), React 19.2, Tailwind v4, Playwright.

## Global Constraints

- Ningún archivo de los listados en la Tarea 1 tiene importadores vivos hoy — ya verificado con grep sobre todo `web/src` antes de escribir este plan. Si una tarea descubre un importador nuevo (por ejemplo, por un cambio hecho en paralelo), se detiene y se avisa en vez de borrar.
- `cmdk` y `vaul` se sacan de `web/package.json` solo después de borrar `components/ui/command.tsx` y `components/ui/drawer.tsx` (sus únicos consumidores).
- No se cambia el comportamiento de ninguna pantalla existente. Si la pasada de accesibilidad encuentra algo que corregir, se corrige en el mismo componente, sin agregar alcance nuevo.
- Verificación final obligatoria antes de cerrar la fase: `cd api && npx tsc --noEmit && npx vitest run`, `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`, y `npm run e2e` contra el stack de `docker compose up -d --build`.

---

### Tarea 1: Borrar el `Shell` viejo y sus primitivas, y las de shadcn sin usar

**Files:**
- Delete: `web/src/components/shell.tsx`
- Delete: `web/src/components/ui.tsx`
- Delete: `web/src/components/feedback.tsx`
- Delete: `web/src/lib/nav.ts`
- Delete: `web/src/lib/nav.check.ts`
- Delete: `web/src/components/ui/command.tsx`
- Delete: `web/src/components/ui/drawer.tsx`
- Delete: `web/src/components/ui/textarea.tsx`
- Delete: `web/src/components/ui/tooltip.tsx`
- Modify: `web/package.json` (quitar `"check"` del script `nav.check.ts`, quitar `cmdk` y `vaul` de `dependencies`)

**Interfaces:**
- Consumes: nada — estos archivos no tienen importadores vivos (verificado por grep antes de este plan; el Paso 1 de abajo repite esa verificación para dejar constancia en la ejecución).
- Produces: nada que otras tareas usen. La Tarea 2 (CSS) y la Tarea 3 (e2e) no dependen de esta.

- [ ] **Paso 1: Confirmar que ninguno tiene importadores**

Desde `web/src`, correr:

```bash
cd web/src
for f in "@/components/shell" "@/components/feedback" "@/lib/nav" "@/components/ui/command" "@/components/ui/drawer" "@/components/ui/textarea" "@/components/ui/tooltip"; do
  echo "=== $f ==="
  grep -rl -- "$f" . --include="*.ts" --include="*.tsx"
done
grep -rl -- "@/components/ui'" . --include="*.ts" --include="*.tsx"
grep -rl -- '@/components/ui"' . --include="*.ts" --include="*.tsx"
```

Resultado esperado: cada bloque, sin contar el propio archivo que se va a borrar (`shell.tsx` es el único que importa `@/lib/nav`, y se borra en el mismo paso), no devuelve ningún otro archivo. Si aparece un importador que no sea uno de los nueve archivos de esta tarea, DETENERSE y avisar antes de seguir — alguien agregó un uso nuevo.

- [ ] **Paso 2: Borrar los nueve archivos**

```bash
cd web/src
rm components/shell.tsx components/ui.tsx components/feedback.tsx \
   lib/nav.ts lib/nav.check.ts \
   components/ui/command.tsx components/ui/drawer.tsx components/ui/textarea.tsx components/ui/tooltip.tsx
```

- [ ] **Paso 3: Sacar `nav.check.ts` del script `check`**

En `web/package.json`, el script `check` es hoy:

```json
"check": "node src/lib/nav.check.ts && node src/lib/fechas.check.ts && node src/lib/estado-invitacion.check.ts && node src/lib/ultimos-movimientos.check.ts && node scripts/colores.check.mjs"
```

Reemplazar por (sin la parte de `nav.check.ts`):

```json
"check": "node src/lib/fechas.check.ts && node src/lib/estado-invitacion.check.ts && node src/lib/ultimos-movimientos.check.ts && node scripts/colores.check.mjs"
```

- [ ] **Paso 4: Sacar `cmdk` y `vaul` de las dependencias**

En `web/package.json`, bajo `"dependencies"`, borrar las dos líneas:

```json
    "cmdk": "^1.1.1",
```
y
```json
    "vaul": "^1.1.2"
```

(Cuidado con la coma final de la línea anterior a la que se borra, para que el JSON quede válido — `radix-ui` queda inmediatamente después de `qrcode.react`, y `tw-animate-css` queda como la última entrada antes del cierre de `dependencies` si `vaul` era la última.)

- [ ] **Paso 5: Actualizar el lockfile**

```bash
cd web
npm install
```

Expected: termina sin errores; `package-lock.json` queda sin `cmdk` ni `vaul`.

- [ ] **Paso 6: Verificar que el proyecto sigue compilando y pasando todo**

```bash
cd web
npx tsc --noEmit
npx eslint . --max-warnings=0
npm run check
npm run build
```

Expected: las cuatro terminan limpias, sin errores ni warnings. Si `tsc` o `eslint` se quejan de un import roto, significa que el Paso 1 no detectó un importador — revisar y, si corresponde, restaurar el archivo (`git checkout -- <archivo>`) en vez de parchear el import, porque el objetivo de esta tarea es borrar código sin uso, no mantenerlo vivo con cambios nuevos.

- [ ] **Paso 7: Commit**

```bash
cd web
git add -A package.json package-lock.json src/components/shell.tsx src/components/ui.tsx src/components/feedback.tsx src/lib/nav.ts src/lib/nav.check.ts src/components/ui/command.tsx src/components/ui/drawer.tsx src/components/ui/textarea.tsx src/components/ui/tooltip.tsx
git commit -m "$(cat <<'EOF'
chore: borrar el Shell viejo y las primitivas de shadcn sin usar

Ningun archivo de components/shell.tsx, ui.tsx, feedback.tsx, lib/nav.ts
(+ su check), ui/command.tsx, ui/drawer.tsx, ui/textarea.tsx ni
ui/tooltip.tsx tenia importadores tras las fases 1 a 4. Con command.tsx
y drawer.tsx fuera, cmdk y vaul tambien dejan de usarse.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 2: Sacar el CSS huérfano de `globals.css`

**Files:**
- Modify: `web/src/app/globals.css:206-257` (bloque "Legado" completo, con recorte)

**Interfaces:**
- Consumes: nada de la Tarea 1 — el CSS se saca por texto, no por import.
- Produces: nada que otras tareas usen.

- [ ] **Paso 1: Confirmar qué clases del bloque "Legado" siguen vivas**

El bloque `/* Legado: ... */` de `globals.css` (líneas 206-257) tiene estas reglas, en este orden: `.display`, `.eyebrow`, `.filete` (+ `.filete > *`), el selector de `html5-qrcode` (`#reader #qr-shaded-region > div`), `@keyframes surgir`, `@keyframes sello`, `.surgir`, `.sello`, `.escalonar > *` (+ sus 4 reglas `nth-child`), `@keyframes latir`, `.skeleton`, `.con-barra-inferior`, `.con-accion` (+ su media query a 640px).

Correr, desde `web/src`:

```bash
cd web/src
grep -rn "\.display\b" --include="*.tsx" app components | grep -v globals.css
grep -rn "\.eyebrow\b" --include="*.tsx" app components | grep -v globals.css
grep -rln "filete" --include="*.tsx" app components
grep -rln "surgir\|sello\|escalonar" --include="*.tsx" app components
grep -rln '\.skeleton[^-]' --include="*.tsx" app components
grep -rln "con-barra-inferior\|con-accion" --include="*.tsx" app components
```

Expected: las dos primeras (`.display`, `.eyebrow`) encuentran coincidencias (siguen vivas — las usa `garita/escanear/page.tsx`, visto antes en este plan). Las demás no encuentran nada.

- [ ] **Paso 2: Editar `globals.css`**

Reemplazar el bloque completo (desde el comentario `/* ----... Legado ...` hasta la línea `}` que cierra la media query de `.con-barra-inferior`/`.con-accion`, es decir las líneas 206 a 257 de la versión actual) por esto, que conserva `.display`, `.eyebrow` y el selector de `html5-qrcode`, y saca todo lo demás:

```css
/* ------------------------------------------------------------------------
   Legado: lo que usan las pantallas viejas que no se rediseñaron todavía.
   ------------------------------------------------------------------------ */
.display {
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: -0.03em;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ink-soft);
}

#reader #qr-shaded-region > div { display: none !important; }
```

El archivo completo, de la línea 200 en adelante, queda así:

```css
/* El foco tiene que verse siempre: la garita se opera con teclado. */
:focus-visible {
  outline: 3px solid var(--marca);
  outline-offset: 2px;
}

/* ------------------------------------------------------------------------
   Legado: lo que usan las pantallas viejas que no se rediseñaron todavía.
   ------------------------------------------------------------------------ */
.display {
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: -0.03em;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ink-soft);
}

#reader #qr-shaded-region > div { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Paso 3: Verificar visualmente que nada se rompió**

```bash
cd web
npm run build
```

Expected: build limpio. Después, con el stack levantado (`docker compose up -d --build` desde la raíz del repo), abrir en el navegador `/`, `/garita`, `/garita/escanear`, `/admin` y `/auditoria` en claro y oscuro, y confirmar que no falta ningún estilo (en particular el visor de la garita, que usa `.display`/`.eyebrow`, y los esqueletos de carga, que usan `.skeleton-brillo` — no tocado por este paso).

- [ ] **Paso 4: Commit**

```bash
cd web
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
chore: sacar el CSS huerfano del Shell viejo

.filete, .surgir/.escalonar (+ sus keyframes y nth-child), .sello,
.skeleton suelto (+ @keyframes latir) y .con-barra-inferior/.con-accion
solo los usaban shell.tsx y feedback.tsx, ya borrados. .display y
.eyebrow se quedan: los sigue usando el visor de la garita.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 3: Agregar el escenario de egreso al e2e de garita

**Files:**
- Modify: `web/e2e/garita.spec.ts` (agregar un test nuevo, al final del archivo)

**Interfaces:**
- Consumes: `entrar(page, quien)` de `web/e2e/sesion.ts` (ya existe, sin cambios); `CUENTAS`/`PASS` de ese mismo archivo (indirectamente, vía `entrar`).
- Produces: nada que otras tareas usen.

**Contexto para quien implemente:** `garita.spec.ts` ya tiene un test que registra un ingreso y lo deshace (`'el guardia busca un invitado, registra el ingreso y lo deshace'`), pero nada prueba el egreso. En `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, la pantalla decide sola si el botón dice "Registrar ingreso" o "Registrar egreso": mira si la invitación ya está `adentro` (viene del backend) y, si está, es un egreso — no hay que elegir nada en la UI. Después de registrar, muestra una pantalla de confirmación con el título "INGRESO" o "EGRESO" en `<h1>` y dos botones, "Deshacer" y "Siguiente (N)" (con una cuenta regresiva); "Siguiente" vuelve a `/garita/escanear`. La agenda de "Hoy" (`web/src/components/garita/agenda-dia.tsx`) separa a la gente en dos secciones: "Esperando (N)" (nadie entró todavía) y "Ya entraron (N)" (entró, haya salido o no) — después de un ingreso+egreso completo, el invitado cae en "Ya entraron".

- [ ] **Paso 1: Agregar el test**

Al final de `web/e2e/garita.spec.ts` (después del último test, `'una invitación anulada no pasa'`), agregar:

```ts

test('el guardia registra el ingreso y después el egreso del mismo invitado', async ({ page, browser }) => {
  const nombre = `Egreso E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  // Ingreso.
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()

  // Vuelve a "Hoy" y busca al mismo invitado: ahora tiene que ofrecer el egreso.
  await g.goto('/garita')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByText('EGRESO', { exact: true })).toBeVisible()
  await g.getByRole('button', { name: 'Registrar egreso' }).click()
  await expect(g.getByRole('button', { name: /^Siguiente/ })).toBeVisible()

  // La agenda lo deja afuera, en "ya entraron".
  await g.goto('/garita')
  await expect(g.getByText(/^Ya entraron/)).toBeVisible()
  await expect(g.getByText(nombre)).toBeVisible()

  await guardia.close()
})
```

- [ ] **Paso 2: Levantar el stack y correr el test nuevo solo**

Desde la raíz del repo:

```bash
docker compose up -d --build
```

Esperar a que `web` (puerto 3000) y `api` (puerto 8080) respondan. Después:

```bash
cd web
npx playwright test garita.spec.ts -g "registra el ingreso y después el egreso"
```

Expected: 1 passed.

- [ ] **Paso 3: Correr la suite completa de e2e**

```bash
cd web
npm run e2e
```

Expected: todos los tests pasan (33, los 32 que había más este nuevo).

- [ ] **Paso 4: Commit**

```bash
cd web
git add e2e/garita.spec.ts
git commit -m "$(cat <<'EOF'
test: agregar el escenario de egreso a los e2e de garita

garita.spec.ts probaba ingreso y deshacer, pero no el egreso del mismo
invitado - lo pedia la spec madre del rediseno desde la fase 3 y quedo
sin escribir. Registra el ingreso, vuelve a Hoy, busca al mismo
invitado y confirma que ahora ofrece egreso, lo registra, y confirma
que la agenda lo deja en "Ya entraron".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 4: Pasada de accesibilidad y cierre de fase

**Files:**
- Potentially modify: cualquiera de `web/src/components/dominio/campo.tsx`, `web/src/app/(vecino)/invitaciones/nueva/page.tsx`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, `web/src/components/admin/sheet-alta.tsx`, `web/src/components/admin/menu-fila.tsx` — solo si la pasada manual encuentra algo roto en ellos. No hay cambios garantizados de antemano en esta tarea: es una verificación, no una reescritura.

**Interfaces:**
- Consumes: nada de las tareas anteriores (son independientes entre sí).
- Produces: nada — es la última tarea de la fase y de todo el rediseño.

**Contexto para quien implemente:** esto es una pasada manual con teclado, sin herramienta de escaneo nueva, sobre tres flujos. El stack tiene que estar levantado (`docker compose up -d --build` desde la raíz) y se prueba en un navegador real, no con el harness de capturas (los diálogos de Radix necesitan eventos de puntero/teclado reales).

- [ ] **Paso 1: Crear invitación sin mouse**

Loguearse como vecino (`e2e.vecino@visitpass.test` / `e2e-contrasena-larga` en `/login`, o la cuenta de `docker compose`: `vecino.prueba@aromos.test`). Ir a `/invitaciones/nueva`. Sin tocar el mouse: `Tab` hasta el campo "Nombre del invitado", escribir, `Tab` por el resto del formulario, `Enter` o `Tab` hasta el botón "Crear invitación" y activarlo con `Enter`/`Espacio`. Si algún campo requerido queda vacío, confirmar que el error aparece anunciado (atributo `role="alert"` ya presente en el componente `Campo`) y que el foco no se pierde en un elemento no interactivo.

Expected: se puede completar y enviar el formulario entero sin mouse; un error de validación es perceptible sin mirar (announced).

Si algo falla: corregirlo en el componente de formulario correspondiente (lo más probable, `web/src/components/dominio/campo.tsx` o la página de `invitaciones/nueva`), y volver a probar este paso.

- [ ] **Paso 2: Escanear y veredicto con teclado**

Loguearse como guardia. Desde `/garita`, buscar cualquier invitado vigente y abrir su veredicto (o simular llegando directo a `/garita/invitacion/<id>` con un id real). Confirmar:
- El foco cae solo en el botón de acción ("Registrar ingreso"/"Registrar egreso"/"Volver") apenas carga el resultado, sin tocar nada.
- `Enter` activa ese botón.
- Tras registrar, en la pantalla de confirmación, `Tab` alcanza "Deshacer" y "Siguiente", y ambos responden a `Enter`.
- `Escape` en cualquier momento del veredicto (antes de registrar) vuelve a `/garita/escanear`.

Expected: todo lo anterior funciona sin mouse. Esto ya está construido desde la fase 3 (`web/src/app/(garita)/garita/invitacion/[id]/page.tsx:100-110`, el `useEffect` del foco y el de Escape) — este paso es confirmar que sigue así, no construirlo.

Si algo falla: corregirlo en ese mismo archivo y volver a probar.

- [ ] **Paso 3: Altas del admin con teclado**

Loguearse como admin. En `/admin/vecinos`, abrir "Dar de alta" con `Enter`/`Espacio` (sin mouse). Confirmar:
- El foco entra al primer campo del `Sheet` automáticamente.
- `Tab` no se escapa del `Sheet` hacia la página de atrás (focus trap).
- `Escape` cierra el `Sheet` y devuelve el foco al botón "Dar de alta" que lo abrió.

Repetir la misma verificación en `/admin/guardias` (alta de guardia) y en un diálogo de confirmación (por ejemplo, "Dar de baja" desde el `MenuFila` de un vecino).

Expected: los tres (`Sheet` de alta de vecino, `Sheet` de alta de guardia, `Dialog` de confirmación) atrapan el foco, cierran con Escape y devuelven el foco al disparador — comportamiento que da Radix por defecto (`Sheet`/`Dialog` de `components/ui/`), así que lo normal es que los tres pasen sin tocar nada.

Si algo falla: casi seguro que algún código custom está peleando con el focus trap de Radix (por ejemplo, un `autoFocus` manual en un campo interno) — corregirlo donde aparezca y volver a probar.

- [ ] **Paso 4: Verificación final completa**

Correr, en orden:

```bash
cd api
npx tsc --noEmit
npx vitest run
```

Expected: tsc limpio; vitest en 261/261 (o más, si alguna corrección de los pasos 1-3 agregó un test — no es obligatorio agregar uno, solo si la corrección lo amerita).

```bash
cd web
npx tsc --noEmit
npx eslint . --max-warnings=0
npm run check
npm run build
```

Expected: las cuatro limpias.

```bash
# Desde la raíz del repo, con el stack levantado
docker compose up -d --build
cd web
npm run e2e
```

Expected: 33/33 (los 32 de siempre más el del Tarea 3).

Capturas manuales en el navegador, en 390px, 768px y 1280px, claro y oscuro, de: `/` (vecino), `/garita` (guardia), `/admin` (admin), `/auditoria` (cualquiera de los dos roles). Confirmar que ninguna pantalla perdió un estilo por la limpieza de CSS de la Tarea 2.

- [ ] **Paso 5: Commit (solo si los pasos 1-3 encontraron algo para corregir)**

Si algún paso anterior requirió un cambio de código:

```bash
cd web
git add -A
git commit -m "$(cat <<'EOF'
fix: <describir la correccion encontrada en la pasada de accesibilidad>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Si ningún paso encontró nada para corregir, no hay commit en este paso — la fase queda cerrada con los commits de las Tareas 1 a 3.

---

## Self-Review

**Cobertura de la spec:** dead-file list → Tarea 1. CSS huérfano → Tarea 2. E2e de egreso → Tarea 3. Pasada de accesibilidad → Tarea 4, Pasos 1-3. Verificación final (tsc/eslint/check/build, api+e2e, capturas) → Tarea 4, Paso 4. Nada de la spec queda sin tarea.

**Placeholders:** ninguno — cada paso tiene el comando o el código exacto, salvo el mensaje de commit del Paso 5 de la Tarea 4, que depende de un hallazgo que todavía no existe (correctamente condicional, no un placeholder de pereza).

**Consistencia:** los nombres de botones/labels usados en la Tarea 3 (`'Buscar invitado'`, `'Crear invitación'`, `'Registrar ingreso'`, `'Registrar egreso'`, `/^Siguiente/`, `/^Ya entraron/`) se tomaron literalmente del código fuente (`invitacion/[id]/page.tsx`, `agenda-dia.tsx`, `buscar-invitado.tsx`), no inventados.
