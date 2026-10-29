# Plano del barrio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** el admin sube el plano del barrio (SVG, PNG o JPG) y el invitado lo ve en su link, con su lote resaltado.
**Architecture:**
- **Almacenamiento:** el plano va en la base, igual que el logo.
- **Resaltado:** el servidor inyecta un `<style>` en el SVG según `?lote=`.
- **Seguridad:** el front muestra el plano siempre con `<img>`, nunca inline.
**Tech Stack:** Express 5, Drizzle, Next.js 16, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-21-plano-barrio-design.md`. El plano de Alamo Alto está en `docs/barrios/alamo-alto-plano.svg`.
**Mockups:** `.superpowers/brainstorm/4655-1792626562/content/seguro-plano-v1.html`, secciones 1 y 2 (la variante resaltada).

## Global Constraints

- **Nunca inline:** el plano se renderiza con `<img>`. El endpoint manda `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` y `X-Content-Type-Options: nosniff`.
- **Parámetro `lote`:** solo dígitos, de 1 a 6. Cualquier otro valor se ignora.
- **Colores:** el resaltado usa el color del barrio, o `COLOR_DEFAULT` de `api/src/lib/marca.ts`. En el front, solo tokens.
- **Textos y nombres:** textos en voseo; nombres y comentarios en español.
- **Verificar:** `cd api && npm test && npx tsc --noEmit` y `cd web && npm run check && npm run lint && npx tsc --noEmit`.

---

### Task 1: API

**Files:**
- Modify: `api/src/db/schema.ts`, `api/src/lib/marca.ts`, `api/src/services/branding.ts`, `api/src/routes/branding.ts` y `api/src/routes/admin.ts`.
- Create: `api/drizzle/0019_plano_barrio.sql` (generada) y `api/tests/plano.test.ts`.

**Produces:**
- `tipoDePlano(bytes): 'image/svg+xml' | 'image/png' | 'image/jpeg' | null`
- `resaltarLote(svg: string, lote: string, color: string): string`
- `GET /branding` suma `tienePlano` y `planoVersion`.

- [ ] **Step 1: esquema.** En `neighborhoods` van tres columnas: `mapImage: bytea('map_image')`, `mapImageMime: text('map_image_mime')` y `mapImageUpdatedAt: timestamp('map_image_updated_at', { withTimezone: true })`. Generá la migración con `npx drizzle-kit generate --name plano_barrio`.
- [ ] **Step 2: tests** (`tests/plano.test.ts`). Copiá el patrón de `tests/branding.test.ts` para el login del admin y los bytes de PNG:
  - `PUT /admin/branding/plano` con un SVG chico (`<svg xmlns="http://www.w3.org/2000/svg"><g id="lote-87"><rect/><text>87</text></g></svg>`) responde 200, y `GET /branding` da `tienePlano: true`.
  - Un PNG también se acepta. Un `.txt` ("hola") da `400 formato_no_soportado`. Un vecino da 403.
  - `GET /branding/plano?lote=87`:
    - el body contiene `#lote-87 rect{fill:`;
    - el `content-type` es `image/svg+xml`;
    - trae los headers `content-security-policy` y `x-content-type-options`.
  - Sin `lote`, o con `lote=abc`, el body es el SVG original, sin `<style>` agregado.
  - Con un PNG y `?lote=87`, salen los bytes originales.
  - `DELETE /admin/branding/plano` deja `tienePlano: false`, y `GET /branding/plano` responde 404.
- [ ] **Step 3: implementación.**

En `lib/marca.ts`:

```ts
/** SVG: texto (con o sin BOM / <?xml) que tiene un elemento <svg. PNG y JPG, por la firma de siempre. */
export function tipoDePlano(bytes: Buffer): 'image/svg+xml' | 'image/png' | 'image/jpeg' | null {
  const img = tipoDeImagen(bytes)
  if (img) return img
  const inicio = bytes.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart()
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(inicio) ? 'image/svg+xml' : null
}

/** El lote de destino, pintado con el color del barrio. Va al final para ganarle a los estilos del archivo. */
export function resaltarLote(svg: string, lote: string, color: string): string {
  const css = `<style>#lote-${lote} rect{fill:${color}}#lote-${lote} text{fill:#fff;font-weight:700}</style>`
  const i = svg.lastIndexOf('</svg>')
  return i === -1 ? svg : svg.slice(0, i) + css + svg.slice(i)
}
```

  - `services/branding.ts`: `guardarPlano`, `leerPlano` y `borrarPlano`, copiados del logo con `tipoDePlano`. Auditoría: `branding.plano_updated` y `branding.plano_removed`. `getBranding` suma `tienePlano` y `planoVersion`.
  - `routes/admin.ts`: `PUT /branding/plano` con `express.raw({ type: ['image/svg+xml', 'image/png', 'image/jpeg'], limit: '1mb' })`, y `DELETE /branding/plano`.
  - `routes/branding.ts`, `GET /plano`:
    - sin plano, 404;
    - si es SVG y `/^\d{1,6}$/` matchea `req.query.lote`, el body sale de `resaltarLote(bytes.toString('utf8'), lote, color)`, con `color` del barrio o `COLOR_DEFAULT`;
    - headers: CSP, nosniff y `Cache-Control: public, max-age=3600`, igual que el logo.
- [ ] **Step 4:** los tests pasan, junto con `npm test` y `tsc`. Commit: `feat: el admin sube el plano del barrio`.

### Task 2: web

**Files:**
- Create: `web/src/lib/plano.ts`, `web/src/lib/plano.check.ts`, `web/src/components/dominio/plano-barrio.tsx` y `web/e2e/plano.spec.ts`.
- Modify: `web/package.json` (el script `check`), `web/src/app/(admin)/admin/barrio/page.tsx`, `web/src/app/i/[token]/page.tsx` y `README.md`.

**Consumes:** `tienePlano` y `planoVersion` de la marca (buscá dónde el front lee `logoVersion`), `PUT/DELETE /admin/branding/plano` y `GET /branding/plano`.

**Produces:** `loteDeLabel(label: string): string | null` y `urlPlano(base, version, lote)`.

- [ ] **Step 1: check y lib.**

```ts
// plano.check.ts
import assert from 'node:assert/strict'
import { loteDeLabel } from './plano.ts'
assert.equal(loteDeLabel('Lote 87'), '87')
assert.equal(loteDeLabel('87'), '87')
assert.equal(loteDeLabel('Casa A'), null)
assert.equal(loteDeLabel('Lote 12 bis'), '12')
console.log('plano: ok')
```

  `loteDeLabel` toma el primer grupo de 1 a 6 dígitos (`/\d{1,6}/`), o devuelve null. `urlPlano` arma `${base}/branding/plano?v=${version}` y suma `&lote=…` si hay lote. Para la base de la API, usá el mismo helper que arma la URL del logo.
- [ ] **Step 2: admin.** En `barrio/page.tsx`, una tarjeta "Plano del barrio" igual a la del logo, con las mismas clases y la misma zona de soltar:
  - acepta `.svg,.png,.jpg`, de 1 MB como máximo;
  - vista previa con `<img>`, "Quitar el plano";
  - ayuda: "SVG, PNG o JPG, hasta 1 MB. Si es un SVG con los lotes como lote-N, el invitado ve su lote resaltado.";
  - errores: `formato_no_soportado` → "Ese archivo no es un SVG, PNG ni JPG."; 413 → "El archivo pesa más de 1 MB.".

  Seguí el patrón de mutaciones del logo.
- [ ] **Step 3: `PlanoBarrio`** (`{ src, lote }`):
  - es una tarjeta `rounded-lg border border-line bg-card` titulada "Plano del barrio · Tu destino: Lote 87", o solo "Plano del barrio" si no hay lote;
  - un `<button>` envuelve un `<img alt="Plano del barrio con el lote 87 resaltado">` y la etiqueta "Ampliar", con `bg-ink text-card`;
  - el botón abre un `<dialog>` nativo a pantalla completa, con fondo `bg-escaner-fondo`, la misma imagen a `w-full` dentro de un contenedor con `overflow-auto` y `touch-action: pinch-zoom`, y un botón "Cerrar" (Esc también cierra, por el `<dialog>`).
- [ ] **Step 4: invitado.** En `/i/[token]`, si la marca trae `tienePlano`, va `<PlanoBarrio src={urlPlano(...)} lote={loteDeLabel(inv.unitLabel)} />` debajo de "Cómo llegar".
- [ ] **Step 5: e2e** (`plano.spec.ts`):
  - el admin sube `docs/barrios/alamo-alto-plano.svg` por la API (PUT con el contenido, `content-type: image/svg+xml`);
  - el vecino crea una visita;
  - en `/i/[token]` se ve `img[alt^="Plano del barrio"]` con `naturalWidth > 0`;
  - `finally`: `DELETE /admin/branding/plano`.
- [ ] **Step 6: verificación visual.** Con el stack reconstruido (`docker compose up -d --build`), mirá el link del invitado a 390 px en claro y oscuro, el diálogo ampliado y la tarjeta del admin a 1280 px. Corré `npx playwright test plano --workers=1`, check, lint y tsc.
- [ ] **Step 7: README y spec.**
  - README, en "Cómo funciona", un párrafo: el admin sube el plano; el invitado lo ve con su lote resaltado si el SVG trae `lote-N`; el de Alamo Alto está en `docs/barrios/`.
  - En el spec, el estado pasa a "implementado".
  - Commit: `feat: el invitado ve el plano con su lote resaltado`.
