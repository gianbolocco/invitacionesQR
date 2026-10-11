# Rediseño · Fase 1 (Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar armada la base del rediseño —tokens, tipografías, primitivas, componentes de dominio, capa de datos, sesión única con layouts por sección, marca en vivo, PWA— con las pantallas viejas funcionando adentro.

**Architecture:** Next 16 App Router con grupos de rutas `(vecino)`, `(garita)` y `(admin)`, cada uno con un layout que resuelve la sesión una vez y verifica el rol. TanStack Query es la capa de datos (sesión, marca y, en las fases siguientes, todo lo demás). Las primitivas son de shadcn/ui sobre Radix, restilizadas con los tokens de `globals.css`; encima van componentes de dominio propios. Las pantallas viejas no se tocan salvo para corregir bugs puntuales: se reemplazan en las fases 2 a 4.

**Tech Stack:** Next 16.3, React 19.2, Tailwind v4, shadcn/ui (CLI 4.x, estilo new-york), radix-ui, TanStack Query v5, motion, sonner, vaul, cmdk, react-day-picker v9 + date-fns, lucide-react, qrcode.react, Playwright. API: Express 5 + Drizzle + Vitest.

Spec: `docs/superpowers/specs/2026-10-11-rediseno-ui-design.md`.

## Global Constraints

- Textos de interfaz en español rioplatense con voseo, como el resto de la app. Comentarios en español, explicando el porqué.
- Objetivos táctiles de al menos 44px (`h-11`) en todo lo que se toca.
- Ningún color de marca escrito a mano: solo tokens. Los hex de la paleta y del default solo pueden aparecer en `web/src/app/globals.css` y `web/src/lib/marca.ts`.
- Toda URL de la API sale de `apiBase` (`web/src/lib/api.ts`). Nunca `/api/...` escrito a mano.
- `prefers-reduced-motion`: nada se desplaza; quedan solo fundidos.
- Al cerrar cada tarea: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check` limpio. Si la tarea toca `api/`: `cd api && npx vitest run` verde.
- El login conserva las etiquetas "Mail", "Contraseña" y el botón "Entrar": los tests e2e de la Tarea 12 dependen de ellas hasta que la fase 2 los actualice.
- Commits con el formato del repo (`feat:`, `fix:`, `docs:`, `test:`) y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- El stack de desarrollo corre con `docker compose up -d --build` desde la raíz (web en :3000, api en :8080). Después de cambiar `web/`, reconstruir con `docker compose up -d --build web`.

## Mapa de archivos

```
api/src/db/schema.ts                    + logoUpdatedAt
api/drizzle/0008_*.sql                  migración generada
api/src/services/branding.ts            logoVersion
api/src/lib/slug.ts                     nuevo: slug para nombres de archivo
api/src/routes/gate.ts                  nombre del Excel
api/tests/branding.test.ts              tests de logoVersion
api/tests/audit.test.ts                 test del nombre del Excel

web/components.json                     config de shadcn
web/src/lib/utils.ts                    cn()
web/src/app/globals.css                 tokens nuevos + capa legado
web/src/app/layout.tsx                  fuentes, proveedores, metadata y viewport dinámicos
web/src/components/ui/*.tsx             primitivas shadcn (generadas y ajustadas)
web/src/app/kit/{page.tsx,kit.tsx}      catálogo visual, solo en desarrollo
web/src/lib/fechas.ts (+ .check.ts)     fechas y horas en un solo lugar, cupoTexto
web/src/components/proveedores.tsx      QueryClient, marca, toasts
web/src/lib/marca-cliente.tsx           useMarca con TanStack, logoUrl, AplicarMarca
web/src/lib/marca.ts                    Marca + logoVersion
web/src/components/dominio/*.tsx        Marca, EstadoTag, Fila, EncabezadoPagina, Vacio,
                                        ErrorConReintento, Chips, Kpi, CampoFecha,
                                        RangoFechas, Pase, Arranque, SkeletonPantalla
web/src/lib/sesion-contexto.ts          contexto de sesión + claveSesion
web/src/components/seccion-protegida.tsx
web/src/app/(vecino)/  (garita)/  (admin)/   layouts, loading, error; páginas movidas
web/src/app/not-found.tsx
web/src/app/manifest.ts  icon.tsx  apple-icon.tsx
web/scripts/colores.check.mjs
web/playwright.config.ts  web/e2e/*
```

---

### Task 1: API · versión del logo y nombre del Excel

**Files:**
- Create: `api/src/lib/slug.ts`
- Modify: `api/src/db/schema.ts` (tabla `neighborhoods`), `api/src/services/branding.ts`, `api/src/routes/gate.ts:174`
- Test: `api/tests/branding.test.ts`, `api/tests/audit.test.ts`

**Interfaces:**
- Produces: `GET /branding` → `{ nombre: string, color: string, tieneLogo: boolean, logoVersion: number | null }`. `logoVersion` es `logo_updated_at` en milisegundos, o `null` sin logo.
- Produces: `slug(texto: string): string` en `api/src/lib/slug.ts`.

- [ ] **Step 1: Tests que fallan**

En `api/tests/branding.test.ts`, dentro de `describe('el logo del barrio', …)`, agregar al final:

```ts
  it('la marca informa una versión del logo que cambia al reemplazarlo', async () => {
    await barrio()
    const { cookie } = await admin()
    expect((await request(app).get('/branding')).body.logoVersion).toBeNull()

    await subir(cookie, PNG).expect(200)
    const v1 = (await request(app).get('/branding')).body.logoVersion
    expect(typeof v1).toBe('number')

    // Sin esto el navegador sigue mostrando el logo viejo durante la hora de
    // caché: la versión va en la URL y tiene que moverse.
    await new Promise((r) => setTimeout(r, 5))
    await subir(cookie, JPEG, 'image/jpeg').expect(200)
    const v2 = (await request(app).get('/branding')).body.logoVersion
    expect(v2).toBeGreaterThan(v1)

    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(200)
    expect((await request(app).get('/branding')).body.logoVersion).toBeNull()
  })
```

En `api/tests/audit.test.ts`, después del test `'exporta un .xlsx de verdad, …'`, agregar:

```ts
  it('el Excel se llama como el barrio, no como el de la demo', async () => {
    const ctx = await base()
    await db.update(neighborhoods).set({ name: 'Los Aromos' })
    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
    expect(res.headers['content-disposition']).toContain('los-aromos-auditoria.xlsx')
  })
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd api && npx vitest run tests/branding.test.ts tests/audit.test.ts`
Expected: FAIL. `logoVersion` llega `undefined` y el header dice `alamo-alto-auditoria.xlsx`.

- [ ] **Step 3: Columna nueva y migración**

En `api/src/db/schema.ts`, dentro de `neighborhoods`, después de `logo: bytea('logo'),`:

```ts
  // Cuándo se cambió el logo por última vez. Viaja como versión en la URL del
  // logo: la respuesta se cachea una hora y sin esto se vería el anterior.
  logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
```

Run: `cd api && npx drizzle-kit generate --name logo_version`
Expected: se crea `api/drizzle/0008_logo_version.sql` con `ALTER TABLE "neighborhood" ADD COLUMN "logo_updated_at" timestamp with time zone;`

- [ ] **Step 4: `logoVersion` en el servicio de branding**

En `api/src/services/branding.ts`:

En `getBranding`, el select pasa a:

```ts
  const [row] = await db.select({
    name: neighborhoods.name,
    brandColor: neighborhoods.brandColor,
    logoMime: neighborhoods.logoMime,
    logoUpdatedAt: neighborhoods.logoUpdatedAt,
  }).from(neighborhoods).limit(1)
```

y el objeto devuelto suma:

```ts
    tieneLogo: Boolean(row?.logoMime),
    logoVersion: row?.logoMime && row.logoUpdatedAt ? row.logoUpdatedAt.getTime() : null,
```

En `guardarLogo`, el update pasa a:

```ts
  await db.update(neighborhoods)
    .set({ logo: bytes, logoMime: mime, logoUpdatedAt: new Date() })
    .where(eq(neighborhoods.id, id))
```

En `borrarLogo`, el update pasa a:

```ts
  await db.update(neighborhoods)
    .set({ logo: null, logoMime: null, logoUpdatedAt: null })
    .where(eq(neighborhoods.id, id))
```

- [ ] **Step 5: `slug` y nombre del Excel**

Crear `api/src/lib/slug.ts`:

```ts
/**
 * "Álamo Alto" → "alamo-alto". Para nombres de archivo: sin tildes, sin
 * espacios y sin nada que un sistema de archivos o un header pueda romper.
 */
export function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

En `api/src/routes/gate.ts`, agregar `import { slug } from '../lib/slug.js'` y reemplazar la línea 174:

```ts
  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-auditoria.xlsx`).send(buffer)
```

- [ ] **Step 6: Correr toda la suite**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: PASS, 240 tests (los 238 de antes y los 2 nuevos).

- [ ] **Step 7: Commit**

```bash
git add api/src/db/schema.ts api/drizzle api/src/services/branding.ts api/src/lib/slug.ts api/src/routes/gate.ts api/tests/branding.test.ts api/tests/audit.test.ts
git commit -m "feat: version del logo en la marca y Excel con el nombre del barrio"
```

---

### Task 2: Fundaciones del front (dependencias, tokens, tipografías)

**Files:**
- Create: `web/src/lib/utils.ts`, `web/components.json`
- Modify: `web/package.json` (deps), `web/src/app/globals.css` (reescritura), `web/src/app/layout.tsx` (fuentes)

**Interfaces:**
- Produces: `cn(...clases)` en `@/lib/utils`.
- Produces: utilidades de Tailwind `bg-background text-foreground bg-card bg-popover bg-primary text-primary-foreground bg-secondary bg-muted text-muted-foreground bg-accent bg-destructive border-border border-input ring-ring` (las que esperan las primitivas de shadcn) y las propias `bg-marca text-marca bg-marca-deep bg-marca-suave text-sobre-marca text-ink text-ink-soft bg-surface bg-surface-sunk border-line bg-peligro text-peligro font-display shadow-fila shadow-flotante ease-salida`.
- Produces: variante `dark:` atada a `data-theme` y a la preferencia del sistema.
- Las clases viejas (`filete`, `eyebrow`, `display`, `tabular`, `surgir`, `sello`, `escalonar`, `skeleton`, `con-barra-inferior`, `con-accion`) siguen existiendo en la capa "legado" hasta la fase 5.

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
cd web && npm install @tanstack/react-query motion clsx tailwind-merge class-variance-authority lucide-react tw-animate-css
```
Expected: se agregan a `dependencies` sin errores de peer deps.

- [ ] **Step 2: `cn` y `components.json`**

Crear `web/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta clases y resuelve choques de Tailwind: la última gana. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Crear `web/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 3: Reescribir `globals.css`**

Reemplazar todo `web/src/app/globals.css` por:

```css
@import 'tailwindcss';
@import 'tw-animate-css';

/*
  Sistema de VisitPass · "Editorial cálido".
  Estructura editorial (títulos grandes, filas con línea fina, estados en
  etiqueta) sobre neutros cálidos. El color es del barrio: entra por
  --marca-base desde el servidor y todo lo demás se deriva de él.
  El veredicto de la garita NO usa la marca: se separa por luminancia, que
  sobrevive al daltonismo y a las pantallas malas.
*/

/*
  `dark:` sigue al tema elegido (data-theme) y, si no se eligió ninguno, al
  del sistema. Es la misma regla que los tokens de más abajo: si la variante
  y los tokens no coincidieran, un componente quedaría claro sobre oscuro.
*/
@custom-variant dark {
  &:where([data-theme='dark'], [data-theme='dark'] *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme='light']) *) {
      @slot;
    }
  }
}

@theme {
  --color-pass-field: #eaf5ec;
  --color-pass-ink: #0d3d28;
  --color-deny-field: #7a1420;
  --color-deny-ink: #fff1f0;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 22px;

  --shadow-fila: 0 1px 0 rgb(20 19 15 / 0.05), 0 8px 18px -12px rgb(20 19 15 / 0.25);
  --shadow-flotante: 0 18px 40px -16px rgb(20 19 15 / 0.35);

  --ease-salida: cubic-bezier(0.2, 0.8, 0.2, 1);

  --animate-brillo: brillo 1.6s ease-in-out infinite;
  @keyframes brillo {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
}

/* `inline`: las utilidades leen la variable en tiempo de ejecución, así el
   color del barrio cambia sin recompilar y sin recargar. */
@theme inline {
  /* Los nombres que esperan las primitivas de shadcn. */
  --color-background: var(--surface);
  --color-foreground: var(--ink);
  --color-card: var(--card);
  --color-card-foreground: var(--ink);
  --color-popover: var(--card);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--marca);
  --color-primary-foreground: var(--sobre-marca);
  --color-secondary: var(--surface-sunk);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--surface-sunk);
  --color-muted-foreground: var(--ink-soft);
  --color-accent: var(--surface-sunk);
  --color-accent-foreground: var(--ink);
  --color-destructive: var(--peligro);
  --color-border: var(--line);
  --color-input: var(--line);
  --color-ring: var(--marca);

  /* Los nombres propios. */
  --color-marca: var(--marca);
  --color-marca-deep: var(--marca-deep);
  --color-marca-suave: var(--marca-suave);
  --color-marca-line: var(--marca-line);
  --color-sobre-marca: var(--sobre-marca);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-surface: var(--surface);
  --color-surface-sunk: var(--surface-sunk);
  --color-line: var(--line);
  --color-peligro: var(--peligro);
  --color-escaner-fondo: var(--escaner-fondo);
  --color-escaner-texto: var(--escaner-texto);

  --font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-bricolage), var(--font-geist), ui-sans-serif, sans-serif;
}

:root {
  color-scheme: light;
  /* El servidor pisa esto con el color del barrio, y AplicarMarca lo vuelve a
     pisar en vivo cuando el admin lo cambia. */
  --marca-base: #1e6b47;

  /* Las variantes mueven SOLO la luminosidad: `oklch(from X L c h)` conserva
     croma y tono. Con color-mix contra blanco el color sale grisáceo. */
  --marca: var(--marca-base);
  --marca-deep: oklch(from var(--marca-base) 0.32 c h);
  --marca-suave: color-mix(in oklab, var(--marca-base) 10%, var(--surface));
  --marca-line: color-mix(in oklab, var(--marca-base) 8%, white);
  /* Texto sobre la marca. La paleta cerrada está elegida para que el blanco
     se lea encima en el tema claro. */
  --sobre-marca: #ffffff;

  --surface: #f6f3ee;
  --surface-sunk: #ece7df;
  --card: #ffffff;
  --line: #e6e0d6;
  --ink: #14130f;
  /* 5,3:1 sobre el fondo y 5,9:1 sobre las tarjetas: pasa AA en texto chico. */
  --ink-soft: #6b645a;
  --peligro: #a3202f;

  /* El escáner es un visor de cámara: oscuro SIEMPRE, no sigue el tema. */
  --escaner-fondo: oklch(from var(--marca-base) 0.27 c h);
  --escaner-texto: #f2f0e8;
}

/*
  Tema oscuro, escrito dos veces a propósito: una para la elección explícita y
  otra para la preferencia del sistema. CSS no tiene mixins, y encadenar los
  selectores haría que el toggle no le pueda ganar al sistema.
  En oscuro la marca SUBE de luminosidad (el color de la paleta sobre fondo
  oscuro no llega a contraste) y el texto sobre ella pasa a ser oscuro.
*/
:root[data-theme='dark'] {
  color-scheme: dark;
  --marca: oklch(from var(--marca-base) 0.74 c h);
  --marca-deep: oklch(from var(--marca-base) 0.84 c h);
  --marca-suave: color-mix(in oklab, var(--marca-base) 22%, var(--surface));
  --marca-line: color-mix(in oklab, var(--marca-base) 6%, white);
  --sobre-marca: #12110e;
  --surface: #12110e;
  --surface-sunk: #1c1a16;
  --card: #201e19;
  --line: #ffffff1a;
  --ink: #f2eee6;
  --ink-soft: #a8a195;
  --peligro: #f2727e;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --marca: oklch(from var(--marca-base) 0.74 c h);
    --marca-deep: oklch(from var(--marca-base) 0.84 c h);
    --marca-suave: color-mix(in oklab, var(--marca-base) 22%, var(--surface));
    --marca-line: color-mix(in oklab, var(--marca-base) 6%, white);
    --sobre-marca: #12110e;
    --surface: #12110e;
    --surface-sunk: #1c1a16;
    --card: #201e19;
    --line: #ffffff1a;
    --ink: #f2eee6;
    --ink-soft: #a8a195;
    --peligro: #f2727e;
  }
}

body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
  transition: background-color 200ms var(--ease-salida), color 200ms var(--ease-salida);
}

/* Los inputs van a 16px: con menos, iOS hace zoom al enfocarlos. */
input, select, textarea { font-size: 16px; }

/* Títulos display: la única voz grande de la interfaz. La palabra en <em> va
   en el color del barrio ("Hola, <em>Lucía.</em>"). */
.titulo-display {
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 0.95;
}
.titulo-display em { font-style: normal; color: var(--marca); }

.tabular { font-variant-numeric: tabular-nums; }

/* Skeleton con brillo que recorre: se lee como "está llegando", no como un
   bloque gris roto. */
.skeleton-brillo {
  background: linear-gradient(90deg,
    var(--surface-sunk) 0%,
    color-mix(in oklab, var(--surface-sunk) 55%, var(--card)) 50%,
    var(--surface-sunk) 100%);
  background-size: 200% 100%;
  animation: var(--animate-brillo);
}

/* El foco tiene que verse siempre: la garita se opera con teclado. */
:focus-visible {
  outline: 3px solid var(--marca);
  outline-offset: 2px;
}

/* ------------------------------------------------------------------------
   Legado: lo que usan las pantallas viejas. Se borra en la fase 5, cuando ya
   no quede ninguna.
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
.filete {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.filete > * { border-radius: var(--radius-lg); }

#reader #qr-shaded-region > div { display: none !important; }

@keyframes surgir {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes sello {
  0% { opacity: 0; transform: scale(1.12); }
  60% { opacity: 1; transform: scale(0.98); }
  100% { opacity: 1; transform: none; }
}
.surgir { animation: surgir 200ms ease-out both; }
.sello { animation: sello 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both; }
.escalonar > * { animation: surgir 200ms ease-out both; }
.escalonar > *:nth-child(2) { animation-delay: 40ms }
.escalonar > *:nth-child(3) { animation-delay: 80ms }
.escalonar > *:nth-child(4) { animation-delay: 120ms }
.escalonar > *:nth-child(n+5) { animation-delay: 160ms }
@keyframes latir { 50% { opacity: 0.45 } }
.skeleton {
  animation: latir 1.4s ease-in-out infinite;
  background: color-mix(in srgb, var(--ink) 14%, transparent);
  border-radius: 4px;
}
.con-barra-inferior { padding-bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px)); }
.con-accion { padding-bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px)); }
@media (min-width: 640px) {
  .con-barra-inferior, .con-accion { padding-bottom: 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Tipografías nuevas en el layout**

En `web/src/app/layout.tsx`, reemplazar el import y las dos constantes de fuentes (`Archivo`, `Playfair_Display`) por:

```tsx
import { Geist, Bricolage_Grotesque } from 'next/font/google'

// Geist para toda la interfaz; Bricolage solo para títulos, el saludo, el
// nombre en el pase y el veredicto. Dos familias, una para cada voz.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' })
```

y en el `<html>` cambiar `className={`${archivo.variable} ${playfair.variable}`}` por `className={`${geist.variable} ${bricolage.variable}`}`.

En `web/src/components/ui.tsx`, dentro de `Wordmark`, reemplazar `font-[family-name:var(--font-playfair)] text-xl italic` por `font-display text-xl font-extrabold tracking-tight` (la variable de Playfair deja de existir).

- [ ] **Step 5: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: compila sin errores.

Run: `cd .. && docker compose up -d --build web`, abrir http://localhost:3000/login.
Expected: fondo crema `#f6f3ee`, tipografía Geist, el login funciona.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/components.json web/src/lib/utils.ts web/src/app/globals.css web/src/app/layout.tsx web/src/components/ui.tsx
git commit -m "feat: tokens del rediseno, Geist y Bricolage, base para shadcn"
```

---

### Task 3: Primitivas de shadcn y catálogo visual

**Files:**
- Create (CLI): `web/src/components/ui/{button,input,label,textarea,select,dialog,sheet,drawer,dropdown-menu,tabs,popover,calendar,command,tooltip,skeleton,sonner,switch,badge}.tsx`
- Modify: `web/src/components/ui/button.tsx`, `input.tsx`, `skeleton.tsx`, `calendar.tsx`, `sonner.tsx` (ajustes)
- Create: `web/src/app/kit/page.tsx`, `web/src/app/kit/kit.tsx`

**Interfaces:**
- Consumes: `cn` y los tokens de la Tarea 2.
- Produces: `Button` con variantes `default | destructive | outline | secondary | ghost | link` y tamaños `default (h-11) | sm (h-9) | lg (h-12) | icon (size-11) | icon-sm (size-9)`; `Input` de `h-11`; `Skeleton` con brillo; `Toaster` sin `next-themes`.
- Ojo: el archivo viejo `web/src/components/ui.tsx` convive con la carpeta nueva `web/src/components/ui/`. `@/components/ui` resuelve al archivo `ui.tsx` (las pantallas viejas lo siguen importando así). Las primitivas nuevas se importan **siempre** con su archivo: `@/components/ui/button`.

- [ ] **Step 1: Generar las primitivas**

Run:
```bash
cd web && npx shadcn@latest add button input label textarea select dialog sheet drawer dropdown-menu tabs popover calendar command tooltip skeleton sonner switch badge --yes
```
Expected: 18 archivos en `src/components/ui/`. Se instalan `radix-ui`, `vaul`, `sonner`, `cmdk`, `react-day-picker`, `date-fns` y `next-themes`.

- [ ] **Step 2: Ajustar tamaños y peso del botón**

En `web/src/components/ui/button.tsx`:
- En la clase base, reemplazar `rounded-md text-sm font-medium whitespace-nowrap transition-all` por `rounded-md text-[15px] font-semibold whitespace-nowrap transition-all active:scale-[0.98]`.
- Reemplazar el bloque `size: { … }` por:

```ts
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
```

- [ ] **Step 3: Ajustar input, skeleton y calendario**

En `web/src/components/ui/input.tsx`, en la primera clase, reemplazar `h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs` por `h-11 w-full min-w-0 rounded-md border border-input bg-card px-3.5 py-1 text-base shadow-xs`, y borrar ` md:text-sm` (los inputs quedan en 16px).

En `web/src/components/ui/skeleton.tsx`, reemplazar `"animate-pulse rounded-md bg-accent"` por `"skeleton-brillo rounded-md"`.

En `web/src/components/ui/calendar.tsx`, reemplazar `[--cell-size:--spacing(8)]` por `[--cell-size:--spacing(10)]` (celdas de 40px, tocables).

- [ ] **Step 4: Toaster sin `next-themes`**

Reemplazar todo `web/src/components/ui/sonner.tsx` por:

```tsx
"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * Sin next-themes: el tema lo decide `data-theme` en el <html>, y los colores
 * salen de los tokens. "system" deja que sonner siga la preferencia del
 * sistema para sus detalles internos; el fondo y el texto son nuestros.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
```

Run: `cd web && npm uninstall next-themes`

- [ ] **Step 5: Catálogo visual (solo en desarrollo)**

Crear `web/src/app/kit/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { Kit } from './kit'

/** Catálogo de componentes para revisarlos a ojo. No existe en producción. */
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Kit />
}
```

Crear `web/src/app/kit/kit.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line pb-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{titulo}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

export function Kit() {
  const [on, setOn] = useState(true)
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <Toaster />
      <h1 className="titulo-display text-[40px]">Kit <em>VisitPass.</em></h1>

      <Bloque titulo="Botones">
        <Button><Plus />Nueva invitación</Button>
        <Button variant="outline">Copiar link</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Fantasma</Button>
        <Button variant="destructive"><Trash2 />Anular</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Chico</Button>
        <Button size="lg">Grande</Button>
        <Button disabled>Deshabilitado</Button>
      </Bloque>

      <Bloque titulo="Campos">
        <div className="flex w-72 flex-col gap-1.5">
          <Label htmlFor="k-nombre">Nombre del invitado</Label>
          <Input id="k-nombre" placeholder="Juan Pérez" />
        </div>
        <div className="flex items-center gap-2"><Switch checked={on} onCheckedChange={setOn} id="k-sw" /><Label htmlFor="k-sw">Solo las mías</Label></div>
        <Badge>Etiqueta</Badge>
      </Bloque>

      <Bloque titulo="Skeletons">
        <div className="flex w-80 flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-52" />
        </div>
      </Bloque>

      <Bloque titulo="Tabs">
        <Tabs defaultValue="esperando" className="w-96">
          <TabsList>
            <TabsTrigger value="esperando">Esperando 2</TabsTrigger>
            <TabsTrigger value="adentro">Adentro 1</TabsTrigger>
            <TabsTrigger value="frecuentes">Frecuentes</TabsTrigger>
          </TabsList>
          <TabsContent value="esperando" className="text-ink-soft">Lista de esperando</TabsContent>
          <TabsContent value="adentro" className="text-ink-soft">Lista de adentro</TabsContent>
          <TabsContent value="frecuentes" className="text-ink-soft">Frecuentes</TabsContent>
        </Tabs>
      </Bloque>

      <Bloque titulo="Superposiciones">
        <Dialog>
          <DialogTrigger asChild><Button variant="outline">Abrir diálogo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Anular la invitación de Sofía?</DialogTitle>
              <DialogDescription>No va a poder entrar. Si ya estaba en la barrera, avisale.</DialogDescription>
            </DialogHeader>
            <DialogFooter><Button variant="destructive">Anular</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline">Abrir panel</Button></SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Dar de alta un vecino</SheetTitle>
              <SheetDescription>Le llega un link para crear su contraseña.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <Button variant="outline" onClick={() => toast.success('Invitación anulada', {
          action: { label: 'Deshacer', onClick: () => toast('Restaurada') },
        })}>Toast</Button>
      </Bloque>
    </main>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. Si eslint marca reglas de React en archivos generados por shadcn, corregir en el archivo (no deshabilitar la regla en el config).

Run: `cd .. && docker compose up -d --build web` y abrir http://localhost:3000/kit en claro y en oscuro (cambiar el tema del sistema o poner `localStorage.tema = 'oscuro'` y recargar).
Expected: botones de 44px con el color del barrio, diálogo y panel animados con foco atrapado, toast arriba al centro, skeletons con brillo.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/components/ui web/src/app/kit
git commit -m "feat: primitivas de shadcn con los tokens del barrio y catalogo /kit"
```

---

### Task 4: Fechas en un solo lugar y `cupoTexto`

**Files:**
- Create: `web/src/lib/fechas.ts`, `web/src/lib/fechas.check.ts`
- Modify: `web/package.json` (script `check`), `web/src/lib/invitations.ts`, `web/src/lib/gate.ts`, `web/src/components/agenda.tsx`, `web/src/components/guest-page.tsx`, `web/src/app/auditoria/page.tsx`, `web/src/app/page.tsx`, `web/src/components/invitation-detail.tsx`

**Interfaces:**
- Produces (en `@/lib/fechas`):
  - `TZ: string`
  - `hoyISO(ahora?: Date): string` → `'YYYY-MM-DD'` en Buenos Aires
  - `sumarDias(iso: string, n: number): string`
  - `fechaCorta(iso: string): string` → `'14 sep'`
  - `fechaNumerica(iso: string): string` → `'14/09'`
  - `hora(instante: string): string` → `'14:02'` en Buenos Aires
  - `fechaHora(instante: string): string` → `'14/09, 14:02'`
  - `tituloDia(iso: string, hoy?: string): string` → `'Hoy' | 'Mañana' | 'Ayer' | 'sábado 11 de octubre'`
  - `cupoTexto(inv: { kind: string; capacity: number; usedCount: number }): string | null`

- [ ] **Step 1: El chequeo que falla**

Crear `web/src/lib/fechas.check.ts`:

```ts
/** `node src/lib/fechas.check.ts`. Node 24 corre TypeScript solo. */
import assert from 'node:assert/strict'
import {
  hoyISO, sumarDias, fechaCorta, fechaNumerica, hora, fechaHora, tituloDia, cupoTexto,
} from './fechas.ts'

// Las 23:30 del 10 de octubre en Buenos Aires ya son el 11 en UTC: el día
// tiene que salir en hora local, que es cuando más gente entra al barrio.
assert.equal(hoyISO(new Date('2026-10-11T02:30:00Z')), '2026-10-10')

assert.equal(sumarDias('2026-10-11', 1), '2026-10-12')
assert.equal(sumarDias('2026-10-01', -1), '2026-09-30')
assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')

assert.equal(fechaCorta('2026-09-14'), '14 sept')
assert.equal(fechaNumerica('2026-09-04'), '04/09')
assert.equal(hora('2026-10-11T17:02:00Z'), '14:02')
assert.equal(fechaHora('2026-10-11T17:02:00Z'), '11/10, 14:02')

assert.equal(tituloDia('2026-10-11', '2026-10-11'), 'Hoy')
assert.equal(tituloDia('2026-10-12', '2026-10-11'), 'Mañana')
assert.equal(tituloDia('2026-10-10', '2026-10-11'), 'Ayer')
assert.equal(tituloDia('2026-10-14', '2026-10-11'), 'miércoles 14 de octubre')

// Bug: una frecuente mostraba "0 de 999 entraron". 999 es un centinela, no
// un cupo: para las frecuentes se cuentan ingresos.
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 0 }), 'Sin ingresos todavía')
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 1 }), '1 ingreso')
assert.equal(cupoTexto({ kind: 'frecuente', capacity: 999, usedCount: 7 }), '7 ingresos')
assert.equal(cupoTexto({ kind: 'visita', capacity: 4, usedCount: 2 }), '2 de 4 entraron')
assert.equal(cupoTexto({ kind: 'visita', capacity: 1, usedCount: 0 }), null)

console.log('fechas: ok')
```

En `web/package.json`, el script `check` pasa a:

```json
    "check": "node src/lib/nav.check.ts && node src/lib/fechas.check.ts",
```

Run: `cd web && npm run check`
Expected: FAIL, `Cannot find module './fechas.ts'`.

- [ ] **Step 2: Implementar `fechas.ts`**

Crear `web/src/lib/fechas.ts`:

```ts
/**
 * Fechas y horas, en un solo lugar.
 *
 * Antes `fechaCorta` estaba escrita tres veces y `hora` dos, con formatos
 * apenas distintos. Todo en hora de Buenos Aires, igual que la API.
 */
export const TZ = 'America/Argentina/Buenos_Aires'

/** 'YYYY-MM-DD' de hoy en Buenos Aires. `en-CA` ya produce ese formato. */
export function hoyISO(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/** Corre una fecha `n` días. Se calcula al mediodía UTC: ningún huso la cambia de día. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function local(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "14 sept": corto, para filas y tarjetas. */
export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
    .format(local(iso)).replace('.', '')
}

/** "04/09": para tablas, donde las columnas no tienen que bailar. */
export function fechaNumerica(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(local(iso))
}

/** "14:02" de un instante, en Buenos Aires. */
export function hora(instante: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(instante))
}

/** "11/10, 14:02". */
export function fechaHora(instante: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(instante))
}

/** "Hoy", "Mañana", "Ayer" o "miércoles 14 de octubre". */
export function tituloDia(iso: string, hoy: string = hoyISO()): string {
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, 1)) return 'Mañana'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(local(iso))
}

/**
 * Qué decir del cupo de una invitación, o null si no hay nada que decir.
 *
 * Las frecuentes se crean con cupo 999, que es un centinela y no un cupo: de
 * ellas se cuentan ingresos. Una visita de una sola persona no muestra nada.
 */
export function cupoTexto(inv: { kind: string; capacity: number; usedCount: number }): string | null {
  if (inv.kind === 'frecuente') {
    if (inv.usedCount === 0) return 'Sin ingresos todavía'
    return inv.usedCount === 1 ? '1 ingreso' : `${inv.usedCount} ingresos`
  }
  if (inv.capacity > 1) return `${inv.usedCount} de ${inv.capacity} entraron`
  return null
}
```

Run: `cd web && npm run check`
Expected: `nav: ok` y `fechas: ok`. Si `fechaCorta` sale `'14 sep'` en vez de `'14 sept'` (depende de la versión de ICU de Node), ajustar **solo el valor esperado** del check a lo que produce `Intl` y dejar la función como está.

- [ ] **Step 3: Borrar las copias y usar `fechas.ts`**

- `web/src/lib/invitations.ts`: borrar `hoyISO` y `fechaCorta`, y agregar arriba `import { hoyISO, fechaCorta } from './fechas'` y `export { hoyISO, fechaCorta } from './fechas'` (las pantallas viejas los importan desde acá).
- `web/src/lib/gate.ts`: borrar la función `hora` y agregar `export { hora } from './fechas'`.
- `web/src/components/agenda.tsx`: borrar las funciones locales `hora`, `corrido` y `titulo`. Importar `import { hoyISO, hora, sumarDias, tituloDia } from '@/lib/fechas'`. Reemplazar `titulo(fecha)` por `tituloDia(fecha)`.
- `web/src/components/guest-page.tsx`: borrar `fechaCorta` y su `export`, e importarla de `@/lib/fechas`. En `web/src/app/i/[token]/page.tsx`, cambiar el import de `fechaCorta` para que salga de `@/lib/fechas`.
- `web/src/app/auditoria/page.tsx`: borrar `haceDias` y `fechaCorta` locales. Importar `import { hoyISO, sumarDias, fechaNumerica } from '@/lib/fechas'`. Reemplazar `haceDias(30)` por `sumarDias(hoyISO(), -30)` y cada `fechaCorta(` por `fechaNumerica(`.

- [ ] **Step 4: Corregir los dos bugs de la agenda (spec #7 y #8)**

En `web/src/components/agenda.tsx`:

Los botones de día se mueven desde la fecha **elegida**. Reemplazar:

```tsx
        <button onClick={() => setFecha(corrido(-1))}
```
por
```tsx
        <button onClick={() => setFecha((f) => sumarDias(f, -1))}
```
y
```tsx
        <button onClick={() => setFecha(corrido(1))}
```
por
```tsx
        <button onClick={() => setFecha((f) => sumarDias(f, 1))}
```

Las secciones se arman con `adentro` primero, la misma regla de la etiqueta. Reemplazar:

```tsx
  const esperando = personas.filter((r) => r.enteredCount === 0)
  const entraron = personas.filter((r) => r.enteredCount > 0)
```
por
```tsx
  // `adentro` primero, igual que la etiqueta de cada fila: quien entró ayer y
  // sigue adentro tiene enteredCount 0 hoy y no es alguien que falta.
  const esperando = personas.filter((r) => !r.adentro && r.enteredCount === 0)
  const entraron = personas.filter((r) => r.adentro || r.enteredCount > 0)
```

- [ ] **Step 5: Corregir "0 de 999" (spec #1)**

En `web/src/app/page.tsx`, importar `import { cupoTexto } from '@/lib/fechas'` y reemplazar:

```tsx
                        {inv.capacity > 1 && ` · ${inv.usedCount} de ${inv.capacity} entraron`}
```
por
```tsx
                        {cupoTexto(inv) && ` · ${cupoTexto(inv)}`}
```

En `web/src/components/invitation-detail.tsx`, importar `cupoTexto` y reemplazar:

```tsx
        {inv.capacity > 1 && <Dato label="Entraron">{inv.usedCount} de {inv.capacity}</Dato>}
```
por
```tsx
        {cupoTexto(inv) && <Dato label="Ingresos">{cupoTexto(inv)}</Dato>}
```

- [ ] **Step 6: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio. Además, `grep -rn "function fechaCorta\|function hora\|function hoyISO" src` muestra solo `src/lib/fechas.ts`.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/src/lib web/src/components web/src/app
git commit -m "fix: fechas en un solo lugar; agenda relativa a la fecha elegida; frecuentes sin 0 de 999"
```

---

### Task 5: Capa de datos y marca en vivo

**Files:**
- Create: `web/src/components/proveedores.tsx`
- Modify: `web/src/lib/marca.ts`, `web/src/lib/marca-cliente.tsx` (reescritura), `web/src/app/layout.tsx`, `web/src/app/admin/barrio/page.tsx`

**Interfaces:**
- Consumes: `GET /branding` con `logoVersion` (Tarea 1). `ApiError` y `apiBase` de `@/lib/api`.
- Produces (en `@/lib/marca`): `type Marca = { nombre: string; color: string; tieneLogo: boolean; logoVersion: number | null }`, `MARCA_DEFAULT: Marca`, `leerMarca(): Promise<Marca>`.
- Produces (en `@/lib/marca-cliente`): `claveMarca = ['marca'] as const`, `MarcaProvider({ marca, children })`, `useMarca(): Marca`, `logoUrl(m: Marca): string | null`, `AplicarMarca()`.
- Produces (en `@/components/proveedores`): `Proveedores({ marca, children })`, que monta `QueryClientProvider`, `MarcaProvider`, `AplicarMarca` y `Toaster`.
- Regla del 401: una query que falla con 401 y código `no_session` o `invalid_session` manda a `/login`, **salvo** la query `['sesion']`, que la maneja su layout (Tarea 7).

- [ ] **Step 1: `Marca` con versión**

Reemplazar `web/src/lib/marca.ts` por:

```ts
/**
 * La marca del barrio, leída en el servidor.
 *
 * OJO con la URL: el navegador le pega a `/api` relativo, pero esto corre
 * adentro del contenedor y tiene que salir por la red de Docker.
 *
 * Si la API no contesta, devuelve los valores del producto y la página se
 * dibuja igual: el color es decoración y no puede voltear la app.
 */
export type Marca = { nombre: string; color: string; tieneLogo: boolean; logoVersion: number | null }

export const MARCA_DEFAULT: Marca = { nombre: 'VisitPass', color: '#1e6b47', tieneLogo: false, logoVersion: null }

export async function leerMarca(): Promise<Marca> {
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
  try {
    // Sin caché: si no, el admin cambia el color y el HTML nuevo sale viejo.
    const res = await fetch(`${base}/branding`, { cache: 'no-store' })
    if (!res.ok) return MARCA_DEFAULT
    return { ...MARCA_DEFAULT, ...(await res.json() as Partial<Marca>) }
  } catch (e) {
    // Pasa de verdad al levantar el stack: Next atiende antes de que la API
    // termine de migrar. Se registra porque es "arrancó" contra "está roto".
    console.error('[marca] no se pudo leer la marca desde', base, (e as Error).message)
    return MARCA_DEFAULT
  }
}
```

- [ ] **Step 2: `useMarca` sobre TanStack y `AplicarMarca`**

Reemplazar `web/src/lib/marca-cliente.tsx` por:

```tsx
'use client'
import { createContext, useContext, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiBase } from './api'
import { MARCA_DEFAULT, type Marca } from './marca'

export const claveMarca = ['marca'] as const

/*
 * La marca llega ya resuelta desde el layout del servidor y entra como dato
 * inicial de la query: la primera pintada no espera ningún request. Después,
 * cuando el admin guarda un cambio, se invalida ['marca'] y toda la app la
 * vuelve a leer sin recargar.
 */
const Inicial = createContext<Marca>(MARCA_DEFAULT)

export function MarcaProvider({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  return <Inicial.Provider value={marca}>{children}</Inicial.Provider>
}

export function useMarca(): Marca {
  const inicial = useContext(Inicial)
  const { data } = useQuery({
    queryKey: claveMarca,
    queryFn: ({ signal }) => api<Marca>('/branding', { signal }),
    initialData: inicial,
    staleTime: 5 * 60_000,
  })
  return data
}

/**
 * La URL del logo, con su versión. La respuesta se cachea una hora: sin la
 * versión, reemplazar el logo seguía mostrando el anterior. Es el único lugar
 * que arma esta URL.
 */
export function logoUrl(m: Marca): string | null {
  return m.tieneLogo ? `${apiBase}/branding/logo?v=${m.logoVersion ?? 0}` : null
}

/**
 * Lleva la marca al documento: el color como variable CSS (todo lo demás se
 * deriva de ella), el color de la barra del navegador y el título. No dibuja
 * nada.
 */
export function AplicarMarca() {
  const marca = useMarca()

  useEffect(() => {
    document.documentElement.style.setProperty('--marca-base', marca.color)
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
      .forEach((m) => { m.content = marca.color })
  }, [marca.color])

  useEffect(() => { document.title = marca.nombre }, [marca.nombre])

  return null
}
```

- [ ] **Step 3: `Proveedores`**

Crear `web/src/components/proveedores.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { AplicarMarca, MarcaProvider } from '@/lib/marca-cliente'
import type { Marca } from '@/lib/marca'
import { Toaster } from '@/components/ui/sonner'

const SESION_VENCIDA = new Set(['no_session', 'invalid_session'])

/*
 * Un solo cliente de datos para toda la app.
 *
 * - Los 4xx no se reintentan: un "no encontrado" no se arregla insistiendo.
 * - Una sesión vencida a mitad de uso manda al login, desde acá y una sola
 *   vez, en vez de que cada pantalla lo resuelva a su manera. La query de la
 *   sesión queda afuera: la maneja el layout de cada sección.
 */
function crearCliente() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] === 'sesion') return
        if (error instanceof ApiError && error.status === 401 && SESION_VENCIDA.has(error.code)) {
          window.location.href = '/login'
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (fallos, error) =>
          !(error instanceof ApiError && error.status < 500) && fallos < 2,
      },
    },
  })
}

export function Proveedores({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  const [cliente] = useState(crearCliente)
  return (
    <QueryClientProvider client={cliente}>
      <MarcaProvider marca={marca}>
        <AplicarMarca />
        {children}
        <Toaster />
      </MarcaProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: Layout raíz con proveedores, metadata y viewport dinámicos**

En `web/src/app/layout.tsx`:
- Reemplazar `import { MarcaProvider } from '@/lib/marca-cliente'` por `import { Proveedores } from '@/components/proveedores'`.
- Reemplazar `export const metadata` y `export const viewport` por:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const marca = await leerMarca()
  return {
    title: marca.nombre,
    description: 'Invitaciones y control de acceso para barrios cerrados',
    applicationName: marca.nombre,
    appleWebApp: { capable: true, title: marca.nombre, statusBarStyle: 'default' },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const marca = await leerMarca()
  return {
    // El claro lleva el color del barrio; AplicarMarca lo actualiza en vivo.
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: marca.color },
      { media: '(prefers-color-scheme: dark)', color: '#12110e' },
    ],
    width: 'device-width',
    initialScale: 1,
    // Sin maximumScale: el vecino tiene que poder hacer zoom.
  }
}
```

- En el `<body>`, reemplazar `<MarcaProvider marca={marca}>{children}</MarcaProvider>` por `<Proveedores marca={marca}>{children}</Proveedores>`.

En `web/src/app/kit/kit.tsx`, borrar `<Toaster />` y su import: ahora lo monta `Proveedores` para toda la app, y dos toasters mostrarían cada aviso dos veces.

- [ ] **Step 5: El logo con versión en el encabezado viejo (spec #3)**

En `web/src/components/ui.tsx`, dentro de `Wordmark`, agregar `'use client'` como primera línea del archivo, importar `import { logoUrl, useMarca } from '@/lib/marca-cliente'` y reemplazar:

```tsx
        <img src="/api/branding/logo" alt={nombre}
```
por
```tsx
        <img src={logoUrl(marca) ?? ''} alt={nombre}
```
agregando `const marca = useMarca()` como primera línea del cuerpo de `Wordmark`.

- [ ] **Step 6: Barrio sin "recargá la página" (spec #2 y #4)**

En `web/src/app/admin/barrio/page.tsx`:
- Importar `import { useQueryClient } from '@tanstack/react-query'` y `import { claveMarca, logoUrl, useMarca } from '@/lib/marca-cliente'`.
- Al principio del componente: `const queryClient = useQueryClient()` y `const marca = useMarca()`.
- Borrar el estado `tieneLogo` y su efecto `api<{ tieneLogo: boolean }>('/branding')`. Donde se lea `tieneLogo`, usar `marca.tieneLogo`.
- En `guardar`, después de `setBarrio(b)`: `await queryClient.invalidateQueries({ queryKey: claveMarca })` y el aviso pasa a `'Guardado.'`.
- En la subida del logo, reemplazar `setTieneLogo(true)` y su aviso por `await queryClient.invalidateQueries({ queryKey: claveMarca })` y `setAviso('Logo actualizado.')`.
- En "Quitar el logo", reemplazar `setTieneLogo(false)` y su aviso por `await queryClient.invalidateQueries({ queryKey: claveMarca })` y `setAviso('Logo quitado.')`.
- El `<img>` del logo pasa a `src={logoUrl(marca) ?? ''}`.

- [ ] **Step 7: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web api`. Entrar como admin (`admin@aromos.test`) a http://localhost:3000/admin/barrio, elegir otro color y guardar.
Expected: el encabezado cambia de color **sin recargar**. Subir un logo: aparece en el encabezado en el acto. Reemplazarlo por otro: se ve el nuevo, no el anterior.

- [ ] **Step 8: Commit**

```bash
git add web/src
git commit -m "feat: TanStack Query y marca en vivo; logo versionado y sin recargar"
```

---

### Task 6: Componentes de dominio (base)

**Files:**
- Create: `web/src/components/dominio/marca.tsx`, `estado-tag.tsx`, `fila.tsx`, `encabezado-pagina.tsx`, `vacio.tsx`, `error-con-reintento.tsx`, `chips.tsx`, `arranque.tsx`, `skeleton-pantalla.tsx`
- Modify: `web/src/components/ui.tsx` (`Wordmark` delega en `Marca`), `web/src/app/kit/kit.tsx`

**Interfaces:**
- Consumes: `useMarca`, `logoUrl` (Tarea 5); `Button`, `Skeleton` (Tarea 3); `cn`.
- Produces:
  - `Marca({ variante?: 'normal' | 'banda' | 'grande'; className?: string })`
  - `type Estado = 'esperando' | 'adentro' | 'salio' | 'concluida' | 'anulada' | 'vencida' | 'invitado' | 'activo' | 'deshabilitado'`
  - `EstadoTag({ estado: Estado; detalle?: string; className?: string })`
  - `Fila({ titulo: ReactNode; meta?: ReactNode; extremo?: ReactNode; href?: string; onClick?: () => void; className?: string })`
  - `EncabezadoPagina({ titulo: ReactNode; antetitulo?: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; className?: string })`
  - `Vacio({ icono: LucideIcon; titulo: string; detalle?: string; accion?: ReactNode })`
  - `ErrorConReintento({ titulo?: string; detalle?: string; onReintentar: () => void; reintentando?: boolean })`
  - `Chips<T extends string>({ opciones: { valor: T; etiqueta: string; contador?: number }[]; valor: T; onCambio: (v: T) => void; etiqueta: string })` y `ChipsMultiples<T extends string>({ opciones; valores: T[]; onCambio: (v: T[]) => void; etiqueta: string })`
  - `Arranque()`: pantalla de arranque con la marca.
  - `SkeletonPantalla({ filas?: number })`: forma genérica de una pantalla de lista.

- [ ] **Step 1: `Marca`**

Crear `web/src/components/dominio/marca.tsx`:

```tsx
'use client'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import { cn } from '@/lib/utils'

/**
 * El logo o el nombre del barrio. Es el único componente que sabe cómo se
 * pinta la marca: si hay logo lo muestra, si no, el nombre en display.
 *
 * - normal: sobre el fondo, el nombre va en el color del barrio.
 * - banda: sobre la banda de color; el logo va en una pastilla blanca para
 *   que uno oscuro no desaparezca sobre el fondo.
 * - grande: arranque y pantallas de acceso.
 */
export function Marca({ variante = 'normal', className }: {
  variante?: 'normal' | 'banda' | 'grande'
  className?: string
}) {
  const marca = useMarca()
  const url = logoUrl(marca)

  if (url) {
    const alto = { normal: 'h-8', banda: 'h-6', grande: 'h-14' }[variante]
    return (
      <span className={cn('inline-flex shrink-0 items-center',
        variante === 'banda' && 'rounded-md bg-white px-2 py-1', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={marca.nombre} className={cn(alto, 'w-auto max-w-48 object-contain')} />
      </span>
    )
  }

  return (
    <span className={cn('truncate font-display font-extrabold tracking-[-0.02em]', {
      normal: 'text-xl text-marca',
      banda: 'text-[15px] text-sobre-marca',
      grande: 'text-[32px] text-marca',
    }[variante], className)}>
      {marca.nombre}
    </span>
  )
}
```

- [ ] **Step 2: `EstadoTag`**

Crear `web/src/components/dominio/estado-tag.tsx`:

```tsx
import { cn } from '@/lib/utils'

export type Estado =
  | 'esperando' | 'adentro' | 'salio' | 'concluida' | 'anulada' | 'vencida'
  | 'invitado' | 'activo' | 'deshabilitado'

/*
 * La diferencia entre estados es de RELLENO y PESO, no de tono: se lee igual
 * en escala de grises, con daltonismo y a dos metros en la barrera.
 * Macizo = está pasando ahora; contorno = espera o ya terminó; apagado =
 * fuera de juego; peligro = anulado.
 */
const LOOK: Record<Estado, string> = {
  adentro: 'bg-ink text-surface',
  activo: 'bg-ink text-surface',
  esperando: 'border-[1.5px] border-ink text-ink',
  invitado: 'border-[1.5px] border-ink text-ink',
  concluida: 'border-[1.5px] border-ink/50 text-ink-soft',
  salio: 'border-[1.5px] border-ink/50 text-ink-soft',
  vencida: 'bg-surface-sunk text-ink-soft',
  deshabilitado: 'bg-surface-sunk text-ink-soft',
  anulada: 'bg-peligro text-white',
}

const ETIQUETA: Record<Estado, string> = {
  adentro: 'Adentro', activo: 'Activo', esperando: 'Esperando', invitado: 'Invitado',
  concluida: 'Concluida', salio: 'Salió', vencida: 'No llegó',
  deshabilitado: 'De baja', anulada: 'Anulada',
}

export function EstadoTag({ estado, detalle, className }: {
  estado: Estado
  detalle?: string
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1',
      'text-[10.5px] font-bold uppercase leading-none tracking-[0.05em]',
      LOOK[estado], className,
    )}>
      {(estado === 'adentro' || estado === 'activo') && (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {ETIQUETA[estado]}
      {detalle && <span className="tabular font-semibold normal-case tracking-normal">{detalle}</span>}
    </span>
  )
}
```

- [ ] **Step 3: `Fila` y `EncabezadoPagina`**

Crear `web/src/components/dominio/fila.tsx`:

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * La fila de lista del sistema: título, meta, y algo al extremo (estado o
 * acción). Una línea fina abajo, sin caja. Si tiene destino es un link; si
 * tiene acción, un botón; si no, un div.
 */
export function Fila({ titulo, meta, extremo, href, onClick, className }: {
  titulo: ReactNode
  meta?: ReactNode
  extremo?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
}) {
  const interactiva = Boolean(href || onClick)
  const clases = cn(
    'flex w-full min-h-14 items-center gap-3 border-b border-line py-3 text-left',
    interactiva && '-mx-2 rounded-md px-2 transition-colors duration-150 hover:bg-surface-sunk/70 active:bg-surface-sunk',
    className,
  )
  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{titulo}</span>
        {meta && <span className="mt-0.5 block truncate text-[13px] text-ink-soft tabular">{meta}</span>}
      </span>
      {extremo && <span className="shrink-0">{extremo}</span>}
    </>
  )

  if (href) return <Link href={href} className={clases}>{contenido}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clases}>{contenido}</button>
  return <div className={clases}>{contenido}</div>
}
```

Crear `web/src/components/dominio/encabezado-pagina.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * El encabezado de cada pantalla: un antetítulo chico, el título display y las
 * acciones a la derecha. La palabra en <em> del título va en el color del
 * barrio: `titulo={<>Hola, <em>Lucía.</em></>}`.
 */
export function EncabezadoPagina({ titulo, antetitulo, subtitulo, acciones, className }: {
  titulo: ReactNode
  antetitulo?: ReactNode
  subtitulo?: ReactNode
  acciones?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {antetitulo && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            {antetitulo}
          </p>
        )}
        <h1 className="titulo-display text-[34px] sm:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="mt-2 text-ink-soft">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
    </header>
  )
}
```

- [ ] **Step 4: `Vacio` y `ErrorConReintento`**

Crear `web/src/components/dominio/vacio.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * "No hay nada" como invitación a hacer algo. Se usa SOLO cuando la consulta
 * salió bien y vino vacía: un error tiene su propio componente.
 */
export function Vacio({ icono: Icono, titulo, detalle, accion }: {
  icono: LucideIcon
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-surface-sunk text-ink-soft">
        <Icono className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-display text-[19px] font-bold tracking-[-0.01em]">{titulo}</p>
        {detalle && <p className="mx-auto mt-1 max-w-sm text-ink-soft">{detalle}</p>}
      </div>
      {accion}
    </div>
  )
}
```

Crear `web/src/components/dominio/error-con-reintento.tsx`:

```tsx
'use client'
import { CloudOff, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Lo que se muestra cuando algo no cargó. Antes los errores se veían como
 * listas vacías ("no tenés invitaciones") y nadie sabía que tenía que
 * reintentar.
 */
export function ErrorConReintento({
  titulo = 'No pudimos cargar esto',
  detalle = 'Revisá la conexión y probá de nuevo.',
  onReintentar,
  reintentando = false,
}: {
  titulo?: string
  detalle?: string
  onReintentar: () => void
  reintentando?: boolean
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-peligro/10 text-peligro">
        <CloudOff className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-display text-[19px] font-bold tracking-[-0.01em]">{titulo}</p>
        <p className="mx-auto mt-1 max-w-sm text-ink-soft">{detalle}</p>
      </div>
      <Button variant="outline" onClick={onReintentar} disabled={reintentando}>
        <RotateCw className={cn(reintentando && 'animate-spin')} />
        Reintentar
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: `Chips`**

Crear `web/src/components/dominio/chips.tsx`:

```tsx
'use client'
import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

type Opcion<T extends string> = { valor: T; etiqueta: string; contador?: number }

function Pastilla({ activa, children, onClick, grupo }: {
  activa: boolean
  children: React.ReactNode
  onClick: () => void
  grupo: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={cn(
        'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
        'transition-colors duration-150',
        activa ? 'text-sobre-marca' : 'text-ink-soft hover:text-ink',
      )}>
      {/* El fondo activo se desliza de una pastilla a otra en vez de saltar. */}
      {activa && (
        <motion.span layoutId={`chip-${grupo}`} aria-hidden
          className="absolute inset-0 rounded-full bg-marca"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
      )}
      {!activa && <span aria-hidden className="absolute inset-0 rounded-full border border-line bg-card" />}
      <span className="relative">{children}</span>
    </button>
  )
}

/**
 * Selector de una opción en pastillas. Uno solo para filtros, tipo de
 * invitación y estados: antes había cuatro copias con estilos distintos.
 */
export function Chips<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
}) {
  const grupo = useId()
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <Pastilla key={o.valor} grupo={grupo} activa={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.etiqueta}
          {o.contador !== undefined && <span className="tabular opacity-70">{o.contador}</span>}
        </Pastilla>
      ))}
    </div>
  )
}

/** La misma pastilla para elegir varias: días de la semana, por ejemplo. */
export function ChipsMultiples<T extends string>({ opciones, valores, onCambio, etiqueta }: {
  opciones: Opcion<T>[]
  valores: T[]
  onCambio: (v: T[]) => void
  etiqueta: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activa = valores.includes(o.valor)
        return (
          <button key={o.valor} type="button" aria-pressed={activa}
            onClick={() => onCambio(activa ? valores.filter((v) => v !== o.valor) : [...valores, o.valor])}
            className={cn(
              'inline-flex h-10 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold',
              'transition-colors duration-150',
              activa ? 'border-marca bg-marca text-sobre-marca' : 'border-line bg-card text-ink-soft hover:text-ink',
            )}>
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: `Arranque` y `SkeletonPantalla`**

Crear `web/src/components/dominio/arranque.tsx`:

```tsx
'use client'
import { Marca } from './marca'

/**
 * Lo que se ve mientras se resuelve la sesión. Reemplaza al "Cargando…" en
 * texto plano: es la primera impresión de la app en cada apertura.
 */
export function Arranque() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-surface">
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
        <Marca variante="grande" />
        <span aria-hidden className="relative h-1 w-28 overflow-hidden rounded-full bg-surface-sunk">
          <span className="absolute inset-y-0 w-1/3 animate-[arranque_1.1s_ease-in-out_infinite] rounded-full bg-marca" />
        </span>
      </div>
      <style>{`@keyframes arranque { 0% { left: -33% } 100% { left: 100% } }`}</style>
    </div>
  )
}
```

Crear `web/src/components/dominio/skeleton-pantalla.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/**
 * La forma de una pantalla de lista mientras llega: antetítulo, título y
 * filas. Que el hueco coincida con lo que viene es lo que evita el salto.
 */
export function SkeletonPantalla({ filas = 5 }: { filas?: number }) {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="flex flex-col">
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
    </div>
  )
}
```

- [ ] **Step 7: `Wordmark` delega en `Marca` (spec #6)**

En `web/src/components/ui.tsx`, reemplazar la función `Wordmark` entera por:

```tsx
/**
 * Lockup del encabezado viejo. La marca la pinta `Marca`; acá solo se suma el
 * subtítulo. Ya no recibe el nombre: lo lee de la marca del barrio, así las
 * pantallas de acceso dejan de decir "VisitPass".
 */
export function Wordmark({ subtitle = 'Barrio cerrado' }: { subtitle?: string }) {
  return (
    <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
      <Marca />
      <span className="eyebrow truncate">{subtitle}</span>
    </div>
  )
}
```

Agregar `import { Marca } from './dominio/marca'` y borrar los imports de `logoUrl` y `useMarca` que agregó la Tarea 5. Sacar los props `nombre` y `tieneLogo` en los llamados:
- `web/src/components/shell.tsx`: `<Wordmark nombre={marca.nombre} tieneLogo={marca.tieneLogo} subtitle={subtitulo} />` → `<Wordmark subtitle={subtitulo} />`. Si `marca` queda sin usar, borrar `const marca = useMarca()` y su import.
- `web/src/app/login/page.tsx`, `web/src/app/acceso/page.tsx` (dos lugares), `web/src/app/i/[token]/page.tsx`: `<Wordmark nombre="VisitPass" />` → `<Wordmark />`.
- `web/src/components/guest-page.tsx`: `<Wordmark nombre={inv.neighborhood.name} subtitle="Barrio cerrado" />` → `<Wordmark />`.
- `web/src/app/olvide/page.tsx` y `web/src/app/reset/page.tsx`: si usan `Wordmark` con `nombre`, lo mismo.

- [ ] **Step 8: Sumar al catálogo**

En `web/src/app/kit/kit.tsx`, sumar estos imports:

```tsx
import { Inbox } from 'lucide-react'
import { Marca } from '@/components/dominio/marca'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { Fila } from '@/components/dominio/fila'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { Chips, ChipsMultiples } from '@/components/dominio/chips'
import { SkeletonPantalla } from '@/components/dominio/skeleton-pantalla'
```

y agregar estos bloques antes del cierre de `<main>`:

```tsx
      <Bloque titulo="Marca">
        <Marca />
        <span className="rounded-lg bg-marca px-4 py-3"><Marca variante="banda" /></span>
        <Marca variante="grande" />
      </Bloque>

      <Bloque titulo="Estados">
        {(['esperando', 'adentro', 'salio', 'concluida', 'anulada', 'vencida', 'invitado', 'activo', 'deshabilitado'] as const)
          .map((e) => <EstadoTag key={e} estado={e} detalle={e === 'adentro' ? '14:02' : undefined} />)}
      </Bloque>

      <Bloque titulo="Encabezado y filas">
        <div className="w-full max-w-md">
          <EncabezadoPagina antetitulo="Lote 142" titulo={<>Hola, <em>Lucía.</em></>} />
          <div className="mt-4">
            <Fila titulo="Martín Gómez" meta="Visita · entró 14:02" extremo={<EstadoTag estado="adentro" />} onClick={() => {}} />
            <Fila titulo="Sofía Ledesma" meta="Visita · hoy" extremo={<EstadoTag estado="esperando" />} href="/kit" />
            <Fila titulo="Rosa Benítez" meta="Frecuente · Lun Mié Vie" extremo={<EstadoTag estado="esperando" />} />
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Chips">
        <ChipsDemo />
      </Bloque>

      <Bloque titulo="Vacío y error">
        <div className="w-80 rounded-lg border border-line bg-card">
          <Vacio icono={Inbox} titulo="Todavía no invitaste a nadie" detalle="Creá una invitación y compartila por WhatsApp." accion={<Button>Nueva invitación</Button>} />
        </div>
        <div className="w-80 rounded-lg border border-line bg-card">
          <ErrorConReintento onReintentar={() => toast('Reintentando')} />
        </div>
      </Bloque>

      <Bloque titulo="Skeleton de pantalla">
        <div className="w-full rounded-lg border border-line"><SkeletonPantalla filas={3} /></div>
      </Bloque>
```

y, fuera de `Kit`, al final del archivo:

```tsx
function ChipsDemo() {
  const [tipo, setTipo] = useState<'visita' | 'frecuente' | 'proveedor'>('visita')
  const [dias, setDias] = useState<string[]>(['1', '3'])
  return (
    <div className="flex flex-col gap-3">
      <Chips etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={[
        { valor: 'visita', etiqueta: 'Visita' },
        { valor: 'frecuente', etiqueta: 'Frecuente' },
        { valor: 'proveedor', etiqueta: 'Proveedor', contador: 3 },
      ]} />
      <ChipsMultiples etiqueta="Días" valores={dias} onCambio={setDias}
        opciones={['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, i) => ({ valor: String(i), etiqueta: d }))} />
    </div>
  )
}
```

- [ ] **Step 9: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`. Revisar http://localhost:3000/kit en claro y oscuro, y http://localhost:3000/login.
Expected: el login muestra el nombre (o el logo) del barrio, no "VisitPass". El fondo de las chips se desliza al cambiar de opción.

- [ ] **Step 10: Commit**

```bash
git add web/src
git commit -m "feat: componentes de dominio base; las pantallas de acceso muestran el barrio"
```

---

### Task 7: Sesión única y layouts por sección

**Files:**
- Create: `web/src/lib/sesion-contexto.ts`, `web/src/components/seccion-protegida.tsx`, `web/src/app/(vecino)/layout.tsx`, `web/src/app/(garita)/layout.tsx`, `web/src/app/(admin)/layout.tsx`
- Move (con `git mv`): `app/page.tsx`, `app/nueva`, `app/historial` → `app/(vecino)/`; `app/garita`, `app/auditoria` → `app/(garita)/`; `app/admin` → `app/(admin)/`
- Modify: `web/src/lib/session.ts`, `web/src/app/login/page.tsx`, `web/src/app/acceso/page.tsx`, `web/src/app/reset/page.tsx`

**Interfaces:**
- Consumes: `Arranque`, `ErrorConReintento` (Tarea 6); `ApiError`, `api` (`@/lib/api`); `Me`, `homeFor` (`@/lib/session`).
- Produces (en `@/lib/sesion-contexto`): `claveSesion = ['sesion'] as const`, `SesionContexto` (`React.Context<Me | null>`), `useSesion(): Me` (tira error fuera de una sección protegida).
- Produces (en `@/components/seccion-protegida`): `SeccionProtegida({ roles: Me['role'][]; children })`.
- `useMe()` (en `@/lib/session`) pasa a leer el contexto: devuelve el `Me` de la sección, sin request propio. Las pantallas viejas no cambian.
- Las URLs no cambian: los grupos entre paréntesis no aparecen en la ruta.

- [ ] **Step 1: Contexto de sesión**

Crear `web/src/lib/sesion-contexto.ts`:

```ts
'use client'
import { createContext, useContext } from 'react'
import type { Me } from './session'

export const claveSesion = ['sesion'] as const

/**
 * La persona logueada, resuelta UNA vez por el layout de la sección. Antes
 * cada pantalla pedía /auth/me por su cuenta: quince copias del mismo request
 * y del mismo "Cargando…".
 */
export const SesionContexto = createContext<Me | null>(null)

export function useSesion(): Me {
  const me = useContext(SesionContexto)
  if (!me) throw new Error('useSesion se usa dentro de una sección protegida')
  return me
}
```

En `web/src/lib/session.ts`, reemplazar la función `useMe` (y sus imports de `useEffect`, `useState`, `useRouter`, `api` si quedan sin usar) por:

```ts
import { useContext } from 'react'
import { SesionContexto } from './sesion-contexto'

/**
 * La sesión de la sección. Ya no hace un request: la resolvió el layout. Se
 * mantiene para las pantallas viejas; las nuevas usan `useSesion()`.
 */
export function useMe() {
  return useContext(SesionContexto)
}
```

`logout` y `homeFor` quedan igual. `logout` sigue necesitando `api`: dejar ese import.

- [ ] **Step 2: `SeccionProtegida`**

Crear `web/src/components/seccion-protegida.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { SesionContexto, claveSesion } from '@/lib/sesion-contexto'
import { Arranque } from './dominio/arranque'
import { ErrorConReintento } from './dominio/error-con-reintento'

/**
 * Resuelve la sesión y verifica el rol de la sección, en un solo lugar.
 *
 * - Sin sesión (401) → login.
 * - Otro error (red caída, API reiniciándose) → error con reintentar. NO
 *   desloguea: antes cualquier falla de /auth/me mandaba al login, y el
 *   guardia con mala señal terminaba ahí con un auto esperando.
 * - Rol que no corresponde → la casa de su rol.
 */
export function SeccionProtegida({ roles, children }: {
  roles: Me['role'][]
  children: React.ReactNode
}) {
  const router = useRouter()
  const sesion = useQuery({
    queryKey: claveSesion,
    queryFn: ({ signal }) => api<Me>('/auth/me', { signal }),
    staleTime: 5 * 60_000,
    retry: (fallos, error) => !(error instanceof ApiError && error.status === 401) && fallos < 2,
  })

  const sinSesion = sesion.error instanceof ApiError && sesion.error.status === 401
  const rolAjeno = sesion.data && !roles.includes(sesion.data.role)

  useEffect(() => {
    if (sinSesion) router.replace('/login')
    else if (rolAjeno && sesion.data) router.replace(homeFor(sesion.data.role))
  }, [sinSesion, rolAjeno, sesion.data, router])

  // Mientras se vuelve a pedir, un error viejo en caché no decide nada.
  if (sesion.isPending || (sesion.isFetching && !sesion.data)) return <Arranque />
  if (sinSesion || rolAjeno) return <Arranque />
  if (sesion.isError) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <ErrorConReintento
          titulo="No pudimos conectarnos"
          detalle="Revisá la conexión. Tu sesión sigue abierta."
          onReintentar={() => sesion.refetch()}
          reintentando={sesion.isFetching} />
      </main>
    )
  }

  return <SesionContexto.Provider value={sesion.data}>{children}</SesionContexto.Provider>
}
```

- [ ] **Step 3: Mover las páginas a los grupos**

Run (desde `web/src/app`):
```bash
cd web/src/app
mkdir -p "(vecino)" "(garita)" "(admin)"
git mv page.tsx "(vecino)/page.tsx"
git mv nueva "(vecino)/nueva"
git mv historial "(vecino)/historial"
git mv garita "(garita)/garita"
git mv auditoria "(garita)/auditoria"
git mv admin "(admin)/admin"
```
Expected: `git status` muestra renombres, no borrados.

- [ ] **Step 4: Layouts de sección**

Crear `web/src/app/(vecino)/layout.tsx`:

```tsx
import { SeccionProtegida } from '@/components/seccion-protegida'

// El admin también puede invitar desde su casa; el guardia no tiene unidades.
export default function LayoutVecino({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['resident', 'admin']}>{children}</SeccionProtegida>
}
```

Crear `web/src/app/(garita)/layout.tsx`:

```tsx
import { SeccionProtegida } from '@/components/seccion-protegida'

// La garita y la auditoría son del guardia y del admin.
export default function LayoutGarita({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['guard', 'admin']}>{children}</SeccionProtegida>
}
```

Crear `web/src/app/(admin)/layout.tsx`:

```tsx
import { SeccionProtegida } from '@/components/seccion-protegida'

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['admin']}>{children}</SeccionProtegida>
}
```

- [ ] **Step 5: Login, alta y reset limpian la sesión cacheada**

Si la query `['sesion']` quedó en error (alguien entró sin sesión y lo mandaron al login), el layout leería ese error viejo apenas termina el login. Antes de navegar se borra.

En `web/src/app/login/page.tsx`, `web/src/app/acceso/page.tsx` y `web/src/app/reset/page.tsx`:
- Importar `import { useQueryClient } from '@tanstack/react-query'` y `import { claveSesion } from '@/lib/sesion-contexto'`.
- Al principio del componente: `const queryClient = useQueryClient()`.
- Inmediatamente antes de cada `router.push(...)` posterior a un login, alta o reset exitoso, agregar: `queryClient.removeQueries({ queryKey: claveSesion })`.

- [ ] **Step 6: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build lista las mismas rutas que antes (`/`, `/nueva`, `/historial`, `/garita`, `/garita/escanear`, `/auditoria`, `/admin`, `/admin/*`).

Run: `cd .. && docker compose up -d --build web` y probar a mano con las cuentas de desarrollo:
Expected:
- Sin sesión, http://localhost:3000/ → `/login`, pasando por la pantalla de arranque con la marca.
- Vecino en `/admin` → vuelve a `/`.
- Guardia en `/` → `/garita`.
- Con la API caída (`docker compose stop api`) y recargando `/`: error con "Reintentar", no el login. Volver a levantarla (`docker compose start api`) y "Reintentar" entra.

- [ ] **Step 7: Commit**

```bash
git add -A web/src
git commit -m "feat: sesion resuelta una vez por seccion, con layouts y control de rol"
```

---

### Task 8: Carga, error y "no encontrado" por sección

**Files:**
- Create: `web/src/app/(vecino)/loading.tsx`, `web/src/app/(vecino)/error.tsx`, `web/src/app/(garita)/loading.tsx`, `web/src/app/(garita)/error.tsx`, `web/src/app/(admin)/loading.tsx`, `web/src/app/(admin)/error.tsx`, `web/src/app/not-found.tsx`

**Interfaces:**
- Consumes: `SkeletonPantalla`, `ErrorConReintento`, `Vacio` (Tarea 6).

- [ ] **Step 1: `loading.tsx` de cada grupo**

Crear los tres archivos (`(vecino)/loading.tsx`, `(garita)/loading.tsx`, `(admin)/loading.tsx`) con el mismo contenido:

```tsx
import { SkeletonPantalla } from '@/components/dominio/skeleton-pantalla'

export default function Cargando() {
  return <SkeletonPantalla />
}
```

- [ ] **Step 2: `error.tsx` de cada grupo**

Crear los tres archivos (`(vecino)/error.tsx`, `(garita)/error.tsx`, `(admin)/error.tsx`) con el mismo contenido:

```tsx
'use client'
import { useEffect } from 'react'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'

/**
 * Si una pantalla rompe, se ve esto en vez de la pantalla blanca de Next.
 * Lo que rompió queda en la consola para poder diagnosticarlo.
 */
export default function ErrorDeSeccion({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <main className="grid min-h-[60dvh] place-items-center">
      <ErrorConReintento
        titulo="Algo salió mal en esta pantalla"
        detalle="Probá de nuevo. Si sigue pasando, avisale a la administración."
        onReintentar={reset} />
    </main>
  )
}
```

- [ ] **Step 3: `not-found.tsx`**

Crear `web/src/app/not-found.tsx`:

```tsx
import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Vacio } from '@/components/dominio/vacio'
import { buttonVariants } from '@/components/ui/button'

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <Vacio icono={Compass} titulo="Esta página no existe"
        detalle="Puede que el link esté mal copiado o que la página se haya movido."
        accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>} />
    </main>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web` y abrir http://localhost:3000/cualquier-cosa.
Expected: la pantalla "Esta página no existe" con el botón.

- [ ] **Step 5: Commit**

```bash
git add web/src/app
git commit -m "feat: skeleton, error con reintento y no encontrado por seccion"
```

---

### Task 9: Componentes de dominio (indicadores, fechas y pase)

**Files:**
- Create: `web/src/components/dominio/kpi.tsx`, `campo-fecha.tsx`, `rango-fechas.tsx`, `pase.tsx`
- Modify: `web/src/app/kit/kit.tsx`

**Interfaces:**
- Consumes: `Popover`, `Calendar`, `Button` (Tarea 3); `fechaCorta`, `hoyISO`, `sumarDias` (Tarea 4); `Marca` (Tarea 6); `QRCodeSVG` de `qrcode.react`.
- Produces:
  - `Kpi({ etiqueta: string; valor: number; variacion?: { texto: string; tono: 'sube' | 'baja' | 'neutro' }; serie?: number[]; tono?: 'normal' | 'atencion' })`
  - `CampoFecha({ id?: string; valor: string; onCambio: (iso: string) => void; min?: string; className?: string })` — `valor` en `'YYYY-MM-DD'`.
  - `RangoFechas({ desde: string; hasta: string; onCambio: (r: { desde: string; hasta: string }) => void })`
  - `type DatosPase = { barrio?: string; tipo: string; vigencia: string; invitado: string; unidad: string; invita: string }`
  - `Pase({ datos: DatosPase; qr: string; apagado?: boolean; sello?: string; className?: string })`

- [ ] **Step 1: `Kpi`**

Crear `web/src/components/dominio/kpi.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

function Sparkline({ serie }: { serie: number[] }) {
  const max = Math.max(1, ...serie)
  const paso = 100 / Math.max(1, serie.length - 1)
  const puntos = serie.map((v, i) => `${(i * paso).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden className="mt-2 h-7 w-full text-marca">
      <polyline points={`0,30 ${puntos.join(' ')} 100,30`} fill="currentColor" opacity="0.12" />
      <polyline points={puntos.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.6"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Un indicador del tablero: etiqueta, valor que sube desde cero al aparecer,
 * variación y una línea de tendencia. "atencion" lo marca como algo para
 * resolver, no como un número más.
 */
export function Kpi({ etiqueta, valor, variacion, serie, tono = 'normal' }: {
  etiqueta: string
  valor: number
  variacion?: { texto: string; tono: 'sube' | 'baja' | 'neutro' }
  serie?: number[]
  tono?: 'normal' | 'atencion'
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const quieto = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (quieto) { el.textContent = valor.toLocaleString('es-AR'); return }
    const control = animate(0, valor, {
      duration: 0.7,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString('es-AR') },
    })
    return () => control.stop()
  }, [valor, quieto])

  return (
    <div className={cn('rounded-lg border bg-card p-4',
      tono === 'atencion' ? 'border-amber-600/60' : 'border-line')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.07em]',
        tono === 'atencion' ? 'text-amber-700 dark:text-amber-400' : 'text-ink-soft')}>
        {etiqueta}
      </p>
      <p className="titulo-display mt-1.5 text-[32px] tabular">
        <span ref={ref}>{valor.toLocaleString('es-AR')}</span>
      </p>
      {variacion && (
        <p className={cn('mt-1 text-xs font-semibold', {
          sube: 'text-emerald-700 dark:text-emerald-400',
          baja: 'text-peligro',
          neutro: 'text-ink-soft',
        }[variacion.tono])}>
          {variacion.tono === 'sube' ? '▲ ' : variacion.tono === 'baja' ? '▼ ' : ''}{variacion.texto}
        </p>
      )}
      {serie && serie.length > 1 && <Sparkline serie={serie} />}
    </div>
  )
}
```

- [ ] **Step 2: `CampoFecha` y `RangoFechas`**

Crear `web/src/components/dominio/campo-fecha.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

export function aFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function textoFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(aFecha(iso)).replace(/\./g, '')
}

/**
 * Un día, elegido en un calendario en español con la semana desde el lunes.
 * Reemplaza a `<input type=date>`, que se ve distinto en cada navegador y en
 * algunos celulares no se puede usar con una mano.
 */
export function CampoFecha({ id, valor, onCambio, min, className }: {
  id?: string
  valor: string
  onCambio: (iso: string) => void
  min?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button id={id} type="button"
          className={cn('flex h-11 w-full items-center gap-2 rounded-md border border-input bg-card px-3.5 text-left text-base',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}>
          <CalendarDays className="size-4 text-ink-soft" aria-hidden />
          <span className="capitalize tabular">{textoFecha(valor)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={es} weekStartsOn={1}
          selected={aFecha(valor)}
          defaultMonth={aFecha(valor)}
          disabled={min ? { before: aFecha(min) } : undefined}
          onSelect={(d) => { if (d) { onCambio(aISO(d)); setAbierto(false) } }} />
      </PopoverContent>
    </Popover>
  )
}
```

Crear `web/src/components/dominio/rango-fechas.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import type { DateRange } from 'react-day-picker'
import { CalendarRange } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { hoyISO, sumarDias, fechaCorta } from '@/lib/fechas'
import { aFecha, aISO } from './campo-fecha'

const ATAJOS = [
  { etiqueta: 'Hoy', dias: 0 },
  { etiqueta: 'Últimos 7 días', dias: 6 },
  { etiqueta: 'Últimos 30 días', dias: 29 },
]

/** Un rango de días con atajos: lo que más se pide en la auditoría. */
export function RangoFechas({ desde, hasta, onCambio }: {
  desde: string
  hasta: string
  onCambio: (r: { desde: string; hasta: string }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [parcial, setParcial] = useState<DateRange | undefined>()

  function elegir(r: DateRange | undefined) {
    setParcial(r)
    if (r?.from && r.to) {
      onCambio({ desde: aISO(r.from), hasta: aISO(r.to) })
      setParcial(undefined)
      setAbierto(false)
    }
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-medium">
          <CalendarRange className="text-ink-soft" />
          <span className="tabular">{fechaCorta(desde)} – {fechaCorta(hasta)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-2 p-2 sm:flex-row" align="start">
        <div className="flex flex-row gap-1 sm:flex-col">
          {ATAJOS.map((a) => (
            <Button key={a.etiqueta} variant="ghost" size="sm" className="justify-start"
              onClick={() => {
                const h = hoyISO()
                onCambio({ desde: sumarDias(h, -a.dias), hasta: h })
                setAbierto(false)
              }}>
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <Calendar mode="range" locale={es} weekStartsOn={1} numberOfMonths={1}
          defaultMonth={aFecha(hasta)}
          selected={parcial ?? { from: aFecha(desde), to: aFecha(hasta) }}
          onSelect={elegir} />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3: `Pase`**

Crear `web/src/components/dominio/pase.tsx`:

```tsx
'use client'
import { QRCodeSVG } from 'qrcode.react'
import { useMarca } from '@/lib/marca-cliente'
import { cn } from '@/lib/utils'

export type DatosPase = {
  barrio?: string
  tipo: string
  vigencia: string
  invitado: string
  unidad: string
  invita: string
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8a8378]">{etiqueta}</p>
      <p className="truncate text-sm font-semibold">{children}</p>
    </div>
  )
}

/**
 * La invitación como pase, estilo ticket de Wallet: cabecera con la marca,
 * el invitado, los datos, el troquel y el QR.
 *
 * El cuerpo es claro en los DOS temas a propósito: un QR sobre fondo oscuro
 * no lo lee ningún lector. Por eso usa colores fijos y no los tokens.
 */
export function Pase({ datos, qr, apagado = false, sello, className }: {
  datos: DatosPase
  qr: string
  apagado?: boolean
  sello?: string
  className?: string
}) {
  const marca = useMarca()
  return (
    <article className={cn('relative w-full max-w-sm overflow-hidden rounded-xl bg-white text-[#14130f] shadow-flotante',
      apagado && 'opacity-70 grayscale', className)}>
      <header className="flex items-center justify-between bg-marca px-5 py-4 text-sobre-marca">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
            {datos.barrio ?? marca.nombre}
          </p>
          <p className="text-sm font-bold">Pase de {datos.tipo.toLowerCase()}</p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular">{datos.vigencia}</p>
      </header>

      <div className="px-5 pb-2 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8a8378]">Invitado</p>
        <p className="mt-0.5 break-words font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          {datos.invitado}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Dato etiqueta="Unidad">{datos.unidad}</Dato>
          <Dato etiqueta="Invita">{datos.invita}</Dato>
        </div>
      </div>

      {/* El troquel: línea punteada con dos medias lunas del color de fondo. */}
      <div aria-hidden className="relative my-3 h-6">
        <span className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-[#e6e0d6]" />
        <span className="absolute -left-3 top-0 size-6 rounded-full bg-surface" />
        <span className="absolute -right-3 top-0 size-6 rounded-full bg-surface" />
      </div>

      <div className="grid place-items-center px-5 pb-6">
        <QRCodeSVG value={qr} size={196} fgColor="#14130f" bgColor="#ffffff" marginSize={0}
          title={`Código de acceso de ${datos.invitado}`} />
      </div>

      {sello && (
        <span className="absolute right-4 top-24 rotate-[-12deg] rounded-md border-[3px] border-peligro px-3 py-1
          font-display text-xl font-extrabold uppercase tracking-wide text-peligro">
          {sello}
        </span>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Sumar al catálogo**

En `web/src/app/kit/kit.tsx`, sumar estos imports:

```tsx
import { Kpi } from '@/components/dominio/kpi'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { RangoFechas } from '@/components/dominio/rango-fechas'
import { Pase } from '@/components/dominio/pase'
import { hoyISO } from '@/lib/fechas'
```

y agregar antes del cierre de `<main>`:

```tsx
      <Bloque titulo="Indicadores">
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <Kpi etiqueta="Ingresos hoy" valor={23} variacion={{ texto: '18% vs. el sábado pasado', tono: 'sube' }} serie={[3, 5, 4, 8, 6, 9, 12]} />
          <Kpi etiqueta="Adentro ahora" valor={7} variacion={{ texto: '2 sin salida hace más de 12 h', tono: 'neutro' }} />
          <Kpi etiqueta="Atención" valor={3} tono="atencion" variacion={{ texto: 'unidades sin vecinos', tono: 'neutro' }} />
        </div>
      </Bloque>

      <Bloque titulo="Fechas">
        <FechasDemo />
      </Bloque>

      <Bloque titulo="Pase">
        <Pase qr="https://visitpass.quest/i/demo" datos={{
          tipo: 'Visita', vigencia: 'Hoy', invitado: 'Sofía Ledesma', unidad: 'Lote 142', invita: 'Lucía F.',
        }} />
        <Pase qr="https://visitpass.quest/i/demo" apagado sello="Anulada" datos={{
          tipo: 'Frecuente', vigencia: 'Hasta 9 ene', invitado: 'Rosa Benítez', unidad: 'Lote 142', invita: 'Lucía F.',
        }} />
      </Bloque>
```

y al final del archivo:

```tsx
function FechasDemo() {
  const [dia, setDia] = useState(hoyISO())
  const [rango, setRango] = useState({ desde: hoyISO(), hasta: hoyISO() })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-64"><CampoFecha valor={dia} onCambio={setDia} /></div>
      <RangoFechas desde={rango.desde} hasta={rango.hasta} onCambio={setRango} />
    </div>
  )
}
```

- [ ] **Step 5: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio. El check de colores de la Tarea 11 todavía no existe; los hex del `Pase` son grises fijos (`#8a8378`, `#e6e0d6`, `#14130f`) y no de marca, así que el check tampoco los va a marcar.

Run: `cd .. && docker compose up -d --build web` y revisar http://localhost:3000/kit en claro y oscuro.
Expected: los KPIs cuentan desde cero al cargar; el calendario aparece en español con la semana desde el lunes; el pase se ve claro en los dos temas y su QR lo lee la cámara de un celular.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat: componentes de indicadores, fechas en calendario y pase con QR"
```

---

### Task 10: PWA con la marca del barrio

**Files:**
- Create: `web/src/app/manifest.ts`, `web/src/app/icon.tsx`, `web/src/app/apple-icon.tsx`, `web/src/lib/icono-marca.tsx`
- Delete: `web/src/app/favicon.ico`, `web/public/{file,globe,next,vercel,window}.svg`

**Interfaces:**
- Consumes: `leerMarca()` (Tarea 5), `GET /branding/logo` por la red interna (`API_INTERNAL_URL`).
- Produces: `/manifest.webmanifest`, `/icon/192`, `/icon/512` y `/apple-icon`.

- [ ] **Step 1: Ícono compartido**

Crear `web/src/lib/icono-marca.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { leerMarca } from './marca'

/**
 * El ícono de la app instalada: el logo del barrio sobre blanco si hay, y si
 * no la inicial del nombre sobre el color de marca. Se arma en el servidor y
 * por la red interna, así que sirve igual en cualquier dominio.
 */
export async function iconoMarca(lado: number): Promise<ImageResponse> {
  const marca = await leerMarca()
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'

  let logo: string | null = null
  if (marca.tieneLogo) {
    try {
      const res = await fetch(`${base}/branding/logo`, { cache: 'no-store' })
      if (res.ok) {
        const tipo = res.headers.get('content-type') ?? 'image/png'
        logo = `data:${tipo};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
      }
    } catch {
      // Sin logo se cae a la inicial: un ícono roto es peor que uno simple.
    }
  }

  return new ImageResponse(
    logo ? (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
      </div>
    ) : (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: marca.color, color: '#ffffff', fontSize: lado * 0.56, fontWeight: 800,
      }}>
        {marca.nombre.trim().charAt(0).toUpperCase() || 'V'}
      </div>
    ),
    { width: lado, height: lado },
  )
}
```

- [ ] **Step 2: Íconos y manifest**

Crear `web/src/app/icon.tsx`:

```tsx
import { iconoMarca } from '@/lib/icono-marca'

// La marca cambia en vivo: el ícono no se puede hornear en el build.
export const dynamic = 'force-dynamic'
export const contentType = 'image/png'

export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ]
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return iconoMarca(Number(await id))
}
```

Crear `web/src/app/apple-icon.tsx`:

```tsx
import { iconoMarca } from '@/lib/icono-marca'

export const dynamic = 'force-dynamic'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return iconoMarca(180)
}
```

Crear `web/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'
import { leerMarca } from '@/lib/marca'

export const dynamic = 'force-dynamic'

/** La app instalada lleva el nombre y el color del barrio, no los del producto. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const marca = await leerMarca()
  return {
    name: marca.nombre,
    short_name: marca.nombre.length > 12 ? marca.nombre.split(' ')[0] : marca.nombre,
    description: 'Invitaciones y control de acceso del barrio',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f3ee',
    theme_color: marca.color,
    lang: 'es-AR',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

Run:
```bash
git rm web/src/app/favicon.ico web/public/file.svg web/public/globe.svg web/public/next.svg web/public/vercel.svg web/public/window.svg
```

- [ ] **Step 3: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: compila. Si Next indica que `generateImageMetadata` recibe `id` como valor y no como promesa en esta versión, cambiar la firma a `({ id }: { id: string })` y usar `Number(id)`.

Run: `cd .. && docker compose up -d --build web`, abrir http://localhost:3000/manifest.webmanifest, http://localhost:3000/icon/192 y http://localhost:3000/apple-icon.
Expected: el manifest con el nombre y el color del barrio; los íconos con la inicial sobre el color (o el logo, si hay). En Chrome, DevTools → Application → Manifest no muestra errores y ofrece instalar.

- [ ] **Step 4: Commit**

```bash
git add -A web/src/app web/src/lib/icono-marca.tsx web/public
git commit -m "feat: PWA instalable con el nombre, el color y el logo del barrio"
```

---

### Task 11: Chequeo de colores de marca escritos a mano

**Files:**
- Create: `web/scripts/colores.check.mjs`
- Modify: `web/package.json` (script `check`), `web/src/app/(vecino)/historial/page.tsx`, `web/src/components/bar-chart.tsx`, `web/src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Produces: `npm run check` falla si aparece un hex de la paleta (o del default) fuera de `src/app/globals.css` y `src/lib/marca.ts`.

- [ ] **Step 1: El chequeo que falla**

Crear `web/scripts/colores.check.mjs`:

```js
/**
 * Ningún color de marca escrito a mano (spec, bug #5).
 *
 * El color es del barrio: un hex de la paleta pegado en un componente se ve
 * bien en el barrio verde de la demo y mal en todos los demás. Solo pueden
 * aparecer donde se definen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PERMITIDOS = new Set(['app/globals.css', 'lib/marca.ts'])
// La paleta de api/src/lib/marca.ts y el verde de datos que usaba el tablero.
const PROHIBIDOS = ['#1e6b47', '#14565c', '#1d4e89', '#3b3b7a', '#5b3a75', '#7a1f3d', '#8a3c1e', '#36454f', '#0f8f52']

function recorrer(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? recorrer(p) : [p]
  })
}

const errores = []
for (const archivo of recorrer(RAIZ)) {
  if (!/\.(tsx?|css)$/.test(archivo)) continue
  const rel = relative(RAIZ, archivo).split(sep).join('/')
  if (PERMITIDOS.has(rel)) continue
  const texto = readFileSync(archivo, 'utf8').toLowerCase()
  for (const hex of PROHIBIDOS) {
    if (texto.includes(hex)) errores.push(`${rel}: ${hex}`)
  }
}

if (errores.length) {
  console.error('Colores de marca escritos a mano (usá los tokens: bg-marca, text-marca, …):')
  for (const e of errores) console.error('  ' + e)
  process.exit(1)
}
console.log('colores: ok')
```

En `web/package.json`, el script `check` pasa a:

```json
    "check": "node src/lib/nav.check.ts && node src/lib/fechas.check.ts && node scripts/colores.check.mjs",
```

Run: `cd web && npm run check`
Expected: FAIL, y lista al menos `app/(vecino)/historial/page.tsx: #1e6b47`, `components/bar-chart.tsx: #0f8f52` y `app/(admin)/admin/page.tsx: #0f8f52`. El default de `lib/marca-cliente.tsx` ya se fue en la Tarea 5. Si aparece algún otro archivo, corregirlo igual que en el Step 2.

- [ ] **Step 2: Corregir lo que marca**

- `web/src/app/(vecino)/historial/page.tsx`: `className="size-5 accent-[#1e6b47]"` → `className="size-5 accent-marca"`.
- `web/src/components/bar-chart.tsx`: `bg-[#0f8f52]` → `bg-marca`. En el comentario del archivo, reemplazar la mención `(#1e6b47)` por `(el de la paleta)`, porque el chequeo también lee comentarios.
- `web/src/app/(admin)/admin/page.tsx`: `bg-[#0f8f52]` → `bg-marca`.

Run: `cd web && npm run check`
Expected: `nav: ok`, `fechas: ok`, `colores: ok`.

- [ ] **Step 3: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio.

```bash
git add web/scripts web/package.json web/src
git commit -m "fix: ningun color de marca escrito a mano, con chequeo que lo impide"
```

---

### Task 12: Pruebas e2e con Playwright (secciones y roles)

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/preparar.ts`, `web/e2e/sesion.ts`, `web/e2e/secciones.spec.ts`
- Modify: `web/package.json` (script `e2e`, devDependency), `web/.gitignore`, `web/tsconfig.json` (si hace falta excluir `e2e`), `web/eslint.config.mjs` (si hace falta)

**Interfaces:**
- Consumes: el stack de docker compose levantado (web :3000, db por `docker compose exec`).
- Produces: `npm run e2e` desde `web/`. Cuentas de prueba (contraseña `e2e-contrasena-larga`): `e2e.admin@visitpass.test`, `e2e.vecino@visitpass.test` (con la unidad `Lote 900`) y `e2e.guardia@visitpass.test`.

- [ ] **Step 1: Instalar**

Run:
```bash
cd web && npm install -D @playwright/test && npx playwright install chromium
```

En `web/package.json`, agregar el script `"e2e": "playwright test"`.

En `web/.gitignore`, agregar:
```
/test-results
/playwright-report
```

- [ ] **Step 2: Configuración y preparación de datos**

Crear `web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

/**
 * Corre contra el stack de docker compose ya levantado:
 *   docker compose up -d --build   (desde la raíz)
 *   cd web && npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

Crear `web/e2e/preparar.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/*
 * Cuentas de prueba con contraseña conocida, creadas directo en la base de
 * desarrollo. El hash es de 'e2e-contrasena-larga': una contraseña de prueba,
 * nunca una real. El SQL entra por stdin para que la shell no toque los "$"
 * del hash.
 */
const HASH = '$argon2id$v=19$m=65536,p=4,t=3$FNIXItSWhG4ZP4UUiQUpQw$dBiGiJSFZQs58P/iBPADRrsdSGbGx9++qjzNf+Oj7w0'

const SQL = `
insert into unit (neighborhood_id, label)
  select id, 'Lote 900' from neighborhood limit 1
  on conflict do nothing;

insert into person (neighborhood_id, email, name, role, status, password_hash)
  select id, v.email, v.name, v.role, 'active', '${HASH}'
  from neighborhood, (values
    ('e2e.admin@visitpass.test', 'Admin E2E', 'admin'),
    ('e2e.vecino@visitpass.test', 'Vecina E2E', 'resident'),
    ('e2e.guardia@visitpass.test', 'Guardia E2E', 'guard')
  ) as v(email, name, role)
  on conflict (email) do update
    set status = 'active', password_hash = excluded.password_hash, role = excluded.role;

insert into unit_member (unit_id, person_id)
  select u.id, p.id from unit u, person p
  where u.label = 'Lote 900' and p.email = 'e2e.vecino@visitpass.test'
  on conflict do nothing;
`

export default function preparar() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'invitaciones', '-v', 'ON_ERROR_STOP=1'], {
    cwd: raiz, input: SQL, stdio: ['pipe', 'inherit', 'inherit'],
  })
}
```

Crear `web/e2e/sesion.ts`:

```ts
import type { Page } from '@playwright/test'

export const PASS = 'e2e-contrasena-larga'
export const CUENTAS = {
  admin: 'e2e.admin@visitpass.test',
  vecino: 'e2e.vecino@visitpass.test',
  guardia: 'e2e.guardia@visitpass.test',
} as const

/** Entra por el formulario de login, como lo haría una persona. */
export async function entrar(page: Page, quien: keyof typeof CUENTAS) {
  await page.goto('/login')
  await page.getByLabel('Mail').fill(CUENTAS[quien])
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
}
```

- [ ] **Step 3: Los recorridos**

Crear `web/e2e/secciones.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('sin sesión, la home lleva al login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('el vecino entra a su home y no puede ver el admin', async ({ page }) => {
  await entrar(page, 'vecino')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin/guardias')
  await expect(page).toHaveURL(/\/$/)
})

test('el guardia entra a la garita y la home lo devuelve ahí', async ({ page }) => {
  await entrar(page, 'guardia')
  await expect(page).toHaveURL(/\/garita$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/garita$/)
})

test('el admin llega al tablero y a la auditoría', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/auditoria')
  await expect(page).toHaveURL(/\/auditoria$/)
})

test('una ruta inexistente muestra la página propia', async ({ page }) => {
  await page.goto('/no-existe-esto')
  await expect(page.getByText('Esta página no existe')).toBeVisible()
})

test('el manifest lleva el nombre del barrio', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toBeTruthy()
  expect(m.name).not.toBe('VisitPass')
})
```

El último test supone que la base de desarrollo tiene un barrio sembrado con nombre propio (Los Aromos). Si la base está vacía, el manifest dice "VisitPass" y el test falla: es la señal correcta.

- [ ] **Step 4: Que tsc y eslint no choquen con `e2e/`**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. Si tsc se queja de tipos de Playwright dentro de `e2e/`, no hace falta tocar `tsconfig.json`: los tipos vienen con `@playwright/test`. Si eslint marca algo en `e2e/`, corregirlo en el archivo.

- [ ] **Step 5: Correr**

Run: `cd .. && docker compose up -d --build && cd web && npm run e2e`
Expected: 12 tests (6 recorridos × 2 proyectos) en verde.

- [ ] **Step 6: Commit**

```bash
git add web/playwright.config.ts web/e2e web/package.json web/package-lock.json web/.gitignore
git commit -m "test: e2e de secciones y roles con Playwright"
```

---

### Task 13: Verificación final de la fase

**Files:** ninguno nuevo.

- [ ] **Step 1: Todo en verde**

Run:
```bash
cd api && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build
cd .. && docker compose up -d --build && cd web && npm run e2e
```
Expected: 240 tests de API, check con `nav: ok`, `fechas: ok` y `colores: ok`, build limpio y 12 e2e en verde.

- [ ] **Step 2: Revisión visual**

Con el harness de capturas o a mano: `/login`, `/`, `/historial`, `/garita`, `/auditoria`, `/admin`, `/admin/barrio` y `/kit`, en 390, 768 y 1280 px, en claro y oscuro.
Expected: ninguna pantalla vieja rota (siguen con su disposición, ahora con la tipografía y los neutros nuevos) y sin scroll horizontal. Las pantallas de acceso muestran el barrio y el cambio de color en `/admin/barrio` se aplica sin recargar.

- [ ] **Step 3: Cerrar**

Anotar en el resumen de la fase qué quedó para las siguientes (las pantallas mismas, `BarraSeccion`, los KPIs nuevos de la API) y pasar a `superpowers:finishing-a-development-branch`.
