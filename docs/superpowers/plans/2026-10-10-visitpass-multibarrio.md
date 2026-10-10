# VisitPass multi-barrio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app deje de ser de Álamo Alto y pase a instalarse en cualquier barrio cambiando configuración: nombre, color y logo propios, sembrados desde variables de entorno.

**Architecture:** Un despliegue por barrio, una fila en `neighborhood` por base. El color se guarda como hex y se inyecta como una sola variable CSS que el servidor pone en el HTML; las variantes salen de `color-mix()`. El logo viaja como body crudo —sin multipart ni dependencias nuevas— y se valida por bytes mágicos, no por lo que diga el cliente.

**Tech Stack:** Express 5 + TypeScript, Drizzle, PostgreSQL 16, Vitest + Supertest, Next.js 16 + React 19, Tailwind v4.

Spec: [`docs/superpowers/specs/2026-10-10-visitpass-multibarrio-design.md`](../specs/2026-10-10-visitpass-multibarrio-design.md)

## Global Constraints

- El producto se llama **VisitPass**. Aparece en el `<title>`, el login, el footer, el repo y la documentación. **Nunca** en lo que ve el vecino, el invitado o el guardia: ahí va el nombre del barrio.
- Español en nombres de dominio, comentarios y copy. Seguir el estilo del archivo que se toca.
- Toda fecha límite de día va en `America/Argentina/Buenos_Aires`. Usar `TZ` y `todayInBuenosAires()` de `api/src/lib/dates.ts`.
- Errores de dominio con `throw new AppError(status, code)`; el `code` es snake_case y es lo que ve el cliente en `{ error }`.
- **Sin dependencias nuevas.** El logo usa `express.raw()`, que ya viene en Express 5.
- El veredicto de la garita (`pass-field`, `deny-field`) **no se toca**: no depende de la marca a propósito.
- La paleta es la única fuente de verdad del color y vive en `api/src/lib/marca.ts`. El front la recibe por API, no la duplica.
- Comandos. API: `cd api && npx vitest run <archivo>` y `npx tsc --noEmit`. Front: `cd web && npx tsc --noEmit && npx eslint src --max-warnings=0 && npm run check`.

---

## Estructura de archivos

**API**

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `api/src/lib/marca.ts` | Crear. La paleta, el color por defecto y el chequeo de bytes mágicos | 1, 3 |
| `api/src/db/schema.ts` | Modificar. `brandColor` y `logoMime` en `neighborhoods` | 1 |
| `api/drizzle/0006_marca.sql` | Crear. Migración | 1 |
| `api/src/services/neighborhoods.ts` | Modificar. El color entra y sale; la paleta se expone | 1 |
| `api/src/services/branding.ts` | Crear. Leer la marca pública, guardar y borrar el logo | 2, 3 |
| `api/src/routes/branding.ts` | Crear. `GET /branding` y `GET /branding/logo`, públicos | 2, 3 |
| `api/src/routes/admin.ts` | Modificar. `PUT`/`DELETE` del logo, `brandColor` en el PATCH | 1, 3 |
| `api/src/app.ts` | Modificar. Montar `/branding` | 2 |
| `api/src/seed.ts` | Crear. Siembra barrio y admin desde el entorno. Reemplaza `seed-admin.ts` | 4 |
| `api/Dockerfile` | Modificar. Correr el seed antes del servidor | 4 |

**Web**

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `web/src/app/globals.css` | Modificar. `--alamo*` → `--marca*`, derivadas con `color-mix` | 5 |
| `web/src/lib/marca.ts` | Crear. Leer la marca del lado del servidor | 5 |
| `web/src/app/layout.tsx` | Modificar. Inyectar `--marca-base`, título VisitPass | 5 |
| `web/src/components/ui.tsx` | Modificar. `Wordmark` con logo o nombre del barrio | 6 |
| `web/src/components/shell.tsx`, `guest-page.tsx`, `qr-share.tsx`, `login/page.tsx`, `admin/guardias/page.tsx` | Modificar. Los strings clavados | 6 |
| `web/src/app/admin/barrio/page.tsx` | Modificar. Paleta y subida del logo | 7 |

**Despliegue y limpieza**

| Archivo | Qué | Tarea |
|---|---|---|
| `api/tests/aislamiento-barrios.test.ts` | Borrar | 8 |
| `docker-compose.coolify.yml`, `docker-compose.yml`, `README.md` | Variables nuevas y volumen del logo | 4, 8 |

---

### Task 1: El color del barrio

**Files:**
- Create: `api/src/lib/marca.ts`
- Create: `api/drizzle/0006_marca.sql`
- Modify: `api/src/db/schema.ts` (bloque `neighborhoods`)
- Modify: `api/src/services/neighborhoods.ts`
- Modify: `api/src/routes/admin.ts` (schema del PATCH)
- Test: `api/tests/admin.test.ts`

**Interfaces:**
- Produces:
  - `PALETA: readonly string[]` y `COLOR_DEFAULT: string` en `api/src/lib/marca.ts`
  - `getNeighborhood()` devuelve además `brandColor: string | null` y `paleta: readonly string[]`
  - `updateNeighborhood()` acepta `brandColor?: string`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `api/tests/admin.test.ts`:

```ts
describe('color de marca del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('arranca sin color propio y ofrece la paleta', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).get('/admin/neighborhood').set('Cookie', cookie).expect(200)

    expect(res.body.brandColor).toBeNull()
    expect(res.body.paleta).toHaveLength(8)
    expect(res.body.paleta).toContain('#1e6b47')
  })

  it('guarda un color de la paleta', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#1d4e89' }).expect(200)
    expect(res.body.brandColor).toBe('#1d4e89')
  })

  it('rechaza un color que no está en la paleta', async () => {
    const { cookie } = await loginAs('admin')
    // Amarillo: el texto claro sobre este fondo no se lee. Por eso hay paleta.
    const res = await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#ffee00' })
    expect(res.status).toBe(400)
  })

  it('rechaza cualquier cosa que no sea un hex de la paleta', async () => {
    const { cookie } = await loginAs('admin')
    for (const malo of ['rojo', '#fff', 'javascript:alert(1)', '']) {
      const res = await request(app).patch('/admin/neighborhood')
        .set('Cookie', cookie).send({ brandColor: malo })
      expect(res.status).toBe(400)
    }
  })

  it('un vecino no puede cambiar el color', async () => {
    const { cookie } = await loginAs('resident')
    await request(app).patch('/admin/neighborhood')
      .set('Cookie', cookie).send({ brandColor: '#1d4e89' }).expect(403)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd api && npx vitest run tests/admin.test.ts`
Expected: FAIL — `expected undefined to be null`, el campo `brandColor` no existe.

- [ ] **Step 3: Crear la paleta**

Crear `api/src/lib/marca.ts`:

```ts
/**
 * La paleta de marca, única fuente de verdad.
 *
 * No es un selector libre a propósito: el color se usa como fondo con texto
 * claro encima (`bg-marca` + `text-surface`). Un barrio que eligiera amarillo o
 * celeste dejaría ese texto ilegible, y sería un diseño que nadie probó.
 *
 * Los ocho son lo bastante oscuros como para llevar texto claro en el tema
 * claro, que es la restricción que los define. El front los recibe por API: no
 * se duplican del otro lado.
 *
 * En la base se guarda un hex, así que abrir el selector libre más adelante es
 * sacar esta validación, no migrar datos.
 */
export const PALETA = [
  '#1e6b47', // verde, el del producto
  '#14565c', // petróleo
  '#1d4e89', // azul
  '#3b3b7a', // índigo
  '#5b3a75', // violeta
  '#7a1f3d', // bordó
  '#8a3c1e', // terracota
  '#36454f', // pizarra
] as const

export const COLOR_DEFAULT = PALETA[0]

export function esColorDeLaPaleta(v: unknown): v is string {
  return typeof v === 'string' && (PALETA as readonly string[]).includes(v)
}
```

- [ ] **Step 4: Agregar las columnas al esquema**

En `api/src/db/schema.ts`, reemplazar el bloque `neighborhoods` por:

```ts
export const neighborhoods = pgTable('neighborhood', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // "Cómo llegar" en la página del invitado. Un link de mapas que carga el
  // admin: sin API de mapas, sin clave, sin embeber nada.
  address: text('address'),
  mapUrl: text('map_url'),
  // Hex de la paleta. NULL es el verde del producto: así una instalación nueva
  // no necesita elegir nada para verse bien.
  brandColor: text('brand_color'),
  // 'image/png' o 'image/jpeg'. NULL significa que no hay logo y se muestra el
  // nombre del barrio en itálica.
  logoMime: text('logo_mime'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 5: Generar la migración**

Run: `cd api && npx drizzle-kit generate --name marca`
Expected: `[✓] Your SQL migration file ➜ drizzle\0006_marca.sql`

El SQL generado tiene que ser dos `ADD COLUMN`. Si drizzle-kit genera algo más,
revisar que el bloque del paso anterior no haya cambiado nada más.

- [ ] **Step 6: Exponer el color en el servicio**

En `api/src/services/neighborhoods.ts`, agregar el import y reemplazar las dos
funciones:

```ts
import { PALETA, esColorDeLaPaleta } from '../lib/marca.js'
```

```ts
export async function getNeighborhood(id: string) {
  const [row] = await db.select({
    id: neighborhoods.id,
    name: neighborhoods.name,
    address: neighborhoods.address,
    mapUrl: neighborhoods.mapUrl,
    brandColor: neighborhoods.brandColor,
  }).from(neighborhoods).where(eq(neighborhoods.id, id)).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  // La paleta viaja con el barrio para que el front no la duplique: si alguna
  // vez cambia, cambia en un solo lado.
  return { ...row, paleta: PALETA }
}

export async function updateNeighborhood(
  id: string,
  actorId: string,
  data: { name?: string; address?: string; mapUrl?: string; brandColor?: string },
) {
  if (data.brandColor !== undefined && !esColorDeLaPaleta(data.brandColor)) {
    throw new AppError(400, 'color_invalido')
  }

  // Los strings vacíos se guardan como NULL: así el front sabe que no hay dato
  // y no muestra un "Cómo llegar" que no lleva a ningún lado.
  await db.update(neighborhoods).set({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.address !== undefined ? { address: data.address.trim() || null } : {}),
    ...(data.mapUrl !== undefined ? { mapUrl: data.mapUrl.trim() || null } : {}),
    ...(data.brandColor !== undefined ? { brandColor: data.brandColor } : {}),
  }).where(eq(neighborhoods.id, id))

  await audit(actorId, id, 'neighborhood.updated', 'neighborhood', id, data)
  return getNeighborhood(id)
}
```

- [ ] **Step 7: Aceptar el campo en la ruta**

En `api/src/routes/admin.ts`, en el schema del `PATCH /neighborhood`, agregar
después de la línea de `mapUrl`:

```ts
    // La validación contra la paleta la hace el servicio, que es donde vive.
    brandColor: z.string().optional(),
```

- [ ] **Step 8: Correr los tests para verificar que pasan**

Run: `cd api && npx vitest run tests/admin.test.ts && npx tsc --noEmit`
Expected: PASS y typecheck limpio.

- [ ] **Step 9: Commit**

```bash
git add api/src/lib/marca.ts api/src/db/schema.ts api/drizzle/ \
  api/src/services/neighborhoods.ts api/src/routes/admin.ts api/tests/admin.test.ts
git commit -m "feat: el barrio elige su color de una paleta curada"
```

---

### Task 2: `GET /branding`, público

**Files:**
- Create: `api/src/services/branding.ts`
- Create: `api/src/routes/branding.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/branding.test.ts`

**Interfaces:**
- Consumes: `COLOR_DEFAULT` de la Tarea 1.
- Produces:
  - `getBranding(): Promise<{ nombre: string; color: string; tieneLogo: boolean }>`
  - `GET /branding`, sin sesión.

- [ ] **Step 1: Escribir el test que falla**

Crear `api/tests/branding.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods } from '../src/db/schema.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()

async function barrio(over: Record<string, unknown> = {}) {
  const [n] = await db.insert(neighborhoods)
    .values({ name: 'Los Aromos', ...over }).returning()
  return n
}

describe('la marca pública', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('no pide sesión: la consume el layout antes de que haya login', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.nombre).toBe('Los Aromos')
  })

  it('sin color propio devuelve el del producto, ya resuelto', async () => {
    await barrio()
    const res = await request(app).get('/branding').expect(200)
    // Quien lo consume no tiene que saber cuál es el default.
    expect(res.body.color).toBe('#1e6b47')
  })

  it('con color propio devuelve ese', async () => {
    await barrio({ brandColor: '#7a1f3d' })
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.color).toBe('#7a1f3d')
  })

  it('informa si hay logo, sin mandarlo', async () => {
    await barrio()
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(false)

    const [n] = await db.select().from(neighborhoods)
    await db.update(neighborhoods).set({ logoMime: 'image/png' })
      .where(eq(neighborhoods.id, n.id))

    expect((await request(app).get('/branding')).body.tieneLogo).toBe(true)
  })

  it('sin barrio en la base no revienta: devuelve los valores del producto', async () => {
    // Pasa entre que levanta la API y corre el seed.
    const res = await request(app).get('/branding').expect(200)
    expect(res.body.color).toBe('#1e6b47')
    expect(res.body.tieneLogo).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd api && npx vitest run tests/branding.test.ts`
Expected: FAIL — `expected 404 to be 200`, la ruta no existe.

- [ ] **Step 3: Escribir el servicio**

Crear `api/src/services/branding.ts`:

```ts
import { db } from '../db/index.js'
import { neighborhoods } from '../db/schema.js'
import { COLOR_DEFAULT } from '../lib/marca.js'

/**
 * La marca del barrio, para quien todavía no tiene sesión.
 *
 * Hay una sola fila en `neighborhood` por instalación: un despliegue es un
 * barrio. Por eso no recibe id.
 *
 * El color viene SIEMPRE resuelto. Si lo devolviera en null, cada consumidor
 * tendría que conocer el default y tarde o temprano uno quedaría desfasado.
 */
export async function getBranding() {
  const [row] = await db.select({
    name: neighborhoods.name,
    brandColor: neighborhoods.brandColor,
    logoMime: neighborhoods.logoMime,
  }).from(neighborhoods).limit(1)

  return {
    // Sin barrio es una instalación recién levantada, antes del seed. No es un
    // error: la página tiene que dibujarse igual.
    nombre: row?.name ?? 'VisitPass',
    color: row?.brandColor ?? COLOR_DEFAULT,
    tieneLogo: Boolean(row?.logoMime),
  }
}
```

- [ ] **Step 4: Escribir la ruta y montarla**

Crear `api/src/routes/branding.ts`:

```ts
import { Router } from 'express'
import { getBranding } from '../services/branding.js'

export const brandingRoutes = Router()

/* Público a propósito: lo consumen el layout de Next antes de que exista una
   sesión y la página del invitado, que nunca la tiene. */
brandingRoutes.get('/', async (_req, res) => {
  res.json(await getBranding())
})
```

En `api/src/app.ts`, agregar el import junto a los otros routers:

```ts
import { brandingRoutes } from './routes/branding.js'
```

y montarlo junto a los demás `app.use`:

```ts
  app.use('/branding', brandingRoutes)
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `cd api && npx vitest run tests/branding.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/branding.ts api/src/routes/branding.ts api/src/app.ts api/tests/branding.test.ts
git commit -m "feat: endpoint publico con la marca del barrio"
```

---

### Task 3: El logo

**Files:**
- Modify: `api/src/lib/marca.ts` (bytes mágicos)
- Modify: `api/src/services/branding.ts` (guardar, leer, borrar)
- Modify: `api/src/routes/branding.ts` (`GET /branding/logo`)
- Modify: `api/src/routes/admin.ts` (`PUT` y `DELETE`)
- Test: `api/tests/branding.test.ts`

**Interfaces:**
- Consumes: `getBranding()` de la Tarea 2.
- Produces:
  - `tipoDeImagen(buf: Buffer): 'image/png' | 'image/jpeg' | null` en `lib/marca.ts`
  - `guardarLogo(bytes: Buffer, actorId: string)`, `leerLogo()`, `borrarLogo(actorId: string)`
  - `GET /branding/logo`, `PUT /admin/branding/logo`, `DELETE /admin/branding/logo`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `api/tests/branding.test.ts`:

```ts
/** Los primeros bytes de cada formato, que es lo único que se mira. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

describe('el logo del barrio', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const subir = (cookie: string[], bytes: Buffer, mime = 'image/png') =>
    request(app).put('/admin/branding/logo')
      .set('Cookie', cookie).set('Content-Type', mime).send(bytes)

  it('sube un PNG y lo sirve con su tipo', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, PNG).expect(200)

    const res = await request(app).get('/branding/logo').expect(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect(Buffer.from(res.body).subarray(0, 4)).toEqual(PNG.subarray(0, 4))
  })

  it('sube un JPEG', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, JPEG, 'image/jpeg').expect(200)
    const res = await request(app).get('/branding/logo').expect(200)
    expect(res.headers['content-type']).toContain('image/jpeg')
  })

  /*
   * EL test de esta tarea. Un SVG puede traer JavaScript adentro; servido desde
   * el mismo origen que la app, eso es un XSS que se lleva la sesión del admin.
   * Se manda declarando image/png para probar que lo que se mira son los bytes
   * del archivo y no lo que dijo el cliente.
   */
  it('rechaza un SVG aunque venga declarado como PNG', async () => {
    await barrio()
    const { cookie } = await admin()
    const res = await subir(cookie, SVG, 'image/png')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('formato_no_soportado')

    await request(app).get('/branding/logo').expect(404)
  })

  it('rechaza un archivo de más de 500 KB', async () => {
    await barrio()
    const { cookie } = await admin()
    const gordo = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(600 * 1024)])
    const res = await subir(cookie, gordo)
    expect(res.status).toBe(413)
  })

  it('sin logo, el GET da 404', async () => {
    await barrio()
    await request(app).get('/branding/logo').expect(404)
  })

  it('borrarlo vuelve al wordmark de texto', async () => {
    await barrio()
    const { cookie } = await admin()
    await subir(cookie, PNG).expect(200)
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(true)

    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(200)
    expect((await request(app).get('/branding')).body.tieneLogo).toBe(false)
    await request(app).get('/branding/logo').expect(404)
  })

  it('un vecino no puede subir ni borrar', async () => {
    await barrio()
    const { cookie } = await vecino()
    await subir(cookie, PNG).expect(403)
    await request(app).delete('/admin/branding/logo').set('Cookie', cookie).expect(403)
  })
})
```

Y agregar al encabezado del archivo los helpers de sesión, porque hasta ahora
este test no necesitaba ninguna:

```ts
import { people, unitMembers, units } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'

const PASS = 'una-contrasena-larga'

async function cuenta(role: 'admin' | 'resident') {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const barrioId = n?.id ?? (await barrio()).id
  const [p] = await db.insert(people).values({
    neighborhoodId: barrioId, email: `${role}@example.com`, name: role,
    role, status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  if (role === 'resident') {
    const [u] = await db.insert(units)
      .values({ neighborhoodId: barrioId, label: 'Lote 1' }).returning()
    await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  }
  const login = await request(app).post('/auth/login')
    .send({ email: p.email, password: PASS })
  return { cookie: login.headers['set-cookie'] as unknown as string[], id: p.id }
}

const admin = () => cuenta('admin')
const vecino = () => cuenta('resident')
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd api && npx vitest run tests/branding.test.ts`
Expected: FAIL — `expected 404 to be 200`, las rutas del logo no existen.

- [ ] **Step 3: Chequear los bytes mágicos**

Agregar al final de `api/src/lib/marca.ts`:

```ts
/**
 * Qué imagen es, mirando los primeros bytes del archivo.
 *
 * No se mira la extensión ni el Content-Type: los dos los elige quien sube, y
 * un SVG con JavaScript adentro declarado como image/png sería un XSS servido
 * desde nuestro propio origen.
 *
 * Solo PNG y JPEG. El SVG se podría permitir con una CSP o sirviéndolo desde
 * otro dominio; mientras tanto, no aceptarlo es gratis.
 */
export function tipoDeImagen(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.length < 4) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  return null
}
```

- [ ] **Step 4: Guardar, leer y borrar**

Agregar al final de `api/src/services/branding.ts`:

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { tipoDeImagen } from '../lib/marca.js'

const LOGO_DIR = process.env.LOGO_DIR ?? '/data/branding'

/**
 * El archivo se llama como el uuid del barrio, sin extensión.
 *
 * Que el nombre salga de la base y no del cliente es lo que cierra cualquier
 * intento de escribir fuera del directorio: no hay nada que sanitizar porque no
 * hay nada que venga de afuera.
 */
function rutaDe(neighborhoodId: string): string {
  return join(LOGO_DIR, neighborhoodId)
}

async function elBarrio() {
  const [row] = await db.select().from(neighborhoods).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  return row
}

export async function guardarLogo(bytes: Buffer, actorId: string) {
  const mime = tipoDeImagen(bytes)
  if (!mime) throw new AppError(400, 'formato_no_soportado')

  const barrio = await elBarrio()
  await mkdir(LOGO_DIR, { recursive: true })
  await writeFile(rutaDe(barrio.id), bytes)
  await db.update(neighborhoods).set({ logoMime: mime }).where(eq(neighborhoods.id, barrio.id))

  await audit(actorId, barrio.id, 'branding.logo_updated', 'neighborhood', barrio.id, { mime })
  return { mime }
}

export async function leerLogo(): Promise<{ bytes: Buffer; mime: string } | null> {
  const [row] = await db.select().from(neighborhoods).limit(1)
  if (!row?.logoMime) return null
  try {
    return { bytes: await readFile(rutaDe(row.id)), mime: row.logoMime }
  } catch {
    // La columna dice que hay logo y el archivo no está: pasa si se restauró la
    // base sin el volumen. Se trata como "no hay", no como error del servidor.
    return null
  }
}

export async function borrarLogo(actorId: string) {
  const barrio = await elBarrio()
  await rm(rutaDe(barrio.id), { force: true })
  await db.update(neighborhoods).set({ logoMime: null }).where(eq(neighborhoods.id, barrio.id))
  await audit(actorId, barrio.id, 'branding.logo_removed', 'neighborhood', barrio.id)
}
```

- [ ] **Step 5: La ruta pública que lo sirve**

Agregar al final de `api/src/routes/branding.ts`:

```ts
import { leerLogo } from '../services/branding.js'

brandingRoutes.get('/logo', async (_req, res) => {
  const logo = await leerLogo()
  if (!logo) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  // Un logo cambia una vez por año: una hora de caché no molesta a nadie y le
  // saca una request a cada carga de página.
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.type(logo.mime).send(logo.bytes)
})
```

- [ ] **Step 6: Las rutas de admin**

En `api/src/routes/admin.ts`, agregar los imports:

```ts
import express from 'express'
import { guardarLogo, borrarLogo } from '../services/branding.js'
```

y al final del archivo:

```ts
/*
 * El archivo viaja como body crudo, no como multipart: `express.raw` ya viene
 * en Express 5 y aplica el límite de tamaño sin que entre nada al proceso de
 * más. Una dependencia menos que mantener.
 *
 * `type` acepta los dos mimes y nada más, así que un Content-Type distinto ni
 * siquiera se bufferea. Igual no se le cree: el formato real lo decide
 * tipoDeImagen() mirando los bytes.
 */
adminRoutes.put('/branding/logo',
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '500kb' }),
  async (req, res) => {
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AppError(400, 'formato_no_soportado')
    }
    res.json(await guardarLogo(bytes, req.person!.id))
  })

adminRoutes.delete('/branding/logo', async (req, res) => {
  await borrarLogo(req.person!.id)
  res.json({ ok: true })
})
```

Agregar también el import de `AppError` si no está:

```ts
import { AppError } from '../lib/errors.js'
```

- [ ] **Step 7: Que los tests tengan dónde escribir**

En `api/vitest.config.ts`, agregar `LOGO_DIR` al entorno de los tests, apuntando
a un directorio temporal del proyecto:

```ts
    env: {
      // …lo que ya haya…
      LOGO_DIR: './.tmp-logos',
    },
```

Si el archivo no tiene bloque `env`, agregarlo dentro de `test: { … }`. Y sumar
`.tmp-logos/` a `api/.gitignore`.

- [ ] **Step 8: Correr los tests para verificar que pasan**

Run: `cd api && npx vitest run tests/branding.test.ts && npx tsc --noEmit`
Expected: PASS, 12 tests.

Si el de 500 KB devuelve 400 en vez de 413, el `limit` no se está aplicando:
revisar que `express.raw` esté ANTES del handler y no después.

- [ ] **Step 9: Commit**

```bash
git add api/src/lib/marca.ts api/src/services/branding.ts api/src/routes/branding.ts \
  api/src/routes/admin.ts api/tests/branding.test.ts api/vitest.config.ts api/.gitignore
git commit -m "feat: logo del barrio, validado por bytes y no por lo que dice el cliente"
```

---

### Task 4: Sembrar el barrio desde el entorno

**Files:**
- Create: `api/src/seed.ts`
- Delete: `api/src/seed-admin.ts`
- Modify: `api/Dockerfile`
- Modify: `docker-compose.yml`, `docker-compose.coolify.yml`
- Test: `api/tests/seed.test.ts`

**Interfaces:**
- Consumes: `createPerson()` de `api/src/services/people.ts`.
- Produces: `sembrar(): Promise<'sembrado' | 'ya_existe' | 'sin_configurar'>` en `api/src/seed.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `api/tests/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { neighborhoods, people, authTokens } from '../src/db/schema.js'
import { sembrar } from '../src/seed.js'
import { resetDb } from './helpers/db.js'

const ENTORNO = { ...process.env }

function configurar(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

describe('sembrar el barrio al instalar', () => {
  beforeEach(async () => {
    await resetDb()
    configurar({
      BARRIO_NOMBRE: 'Los Aromos',
      BARRIO_DIRECCION: 'Ruta 8 km 62',
      BARRIO_MAPA: 'https://maps.google.com/?q=aromos',
      ADMIN_EMAIL: 'admin@aromos.test',
      ADMIN_NOMBRE: 'Gianluca',
    })
  })

  afterEach(() => { process.env = { ...ENTORNO } })

  it('crea el barrio con sus datos y el admin en invited', async () => {
    expect(await sembrar()).toBe('sembrado')

    const [b] = await db.select().from(neighborhoods)
    expect(b.name).toBe('Los Aromos')
    expect(b.address).toBe('Ruta 8 km 62')
    expect(b.mapUrl).toBe('https://maps.google.com/?q=aromos')

    const [p] = await db.select().from(people)
    expect(p.email).toBe('admin@aromos.test')
    expect(p.name).toBe('Gianluca')
    expect(p.role).toBe('admin')
    // invited y sin contraseña: la elige él con el link, que es el flujo real.
    expect(p.status).toBe('invited')
    expect(p.passwordHash).toBeNull()

    const tokens = await db.select().from(authTokens).where(eq(authTokens.personId, p.id))
    expect(tokens).toHaveLength(1)
    expect(tokens[0].purpose).toBe('invite')
  })

  it('es idempotente: dos arranques dejan un barrio y un admin', async () => {
    expect(await sembrar()).toBe('sembrado')
    expect(await sembrar()).toBe('ya_existe')

    expect(await db.select().from(neighborhoods)).toHaveLength(1)
    expect(await db.select().from(people)).toHaveLength(1)
  })

  it('sin BARRIO_NOMBRE no siembra, y no revienta', async () => {
    configurar({ BARRIO_NOMBRE: undefined })
    expect(await sembrar()).toBe('sin_configurar')
    expect(await db.select().from(neighborhoods)).toHaveLength(0)
  })

  it('sin ADMIN_EMAIL tampoco siembra', async () => {
    configurar({ ADMIN_EMAIL: undefined })
    expect(await sembrar()).toBe('sin_configurar')
    expect(await db.select().from(neighborhoods)).toHaveLength(0)
  })

  it('la dirección y el mapa son opcionales', async () => {
    configurar({ BARRIO_DIRECCION: undefined, BARRIO_MAPA: undefined })
    expect(await sembrar()).toBe('sembrado')

    const [b] = await db.select().from(neighborhoods)
    expect(b.address).toBeNull()
    expect(b.mapUrl).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd api && npx vitest run tests/seed.test.ts`
Expected: FAIL al compilar — no existe `../src/seed.js`.

- [ ] **Step 3: Escribir el seed**

Crear `api/src/seed.ts`:

```ts
import { db } from './db/index.js'
import { neighborhoods } from './db/schema.js'
import { createPerson } from './services/people.js'

/**
 * Siembra el barrio y su primer admin desde el entorno.
 *
 * Un despliegue es un barrio, así que esto corre una sola vez por instalación y
 * después no vuelve a hacer nada. Instalar un barrio nuevo es clonar el recurso
 * y cambiar estas variables; no hay pantalla de alta porque una pantalla que se
 * usa una vez y queda muerta es peor que cuatro variables.
 *
 * El admin nace en `invited` con su token: elige la contraseña por el flujo
 * real, el mismo que cualquier vecino. Sin RESEND_API_KEY el link sale por el
 * log del contenedor.
 */
export async function sembrar(): Promise<'sembrado' | 'ya_existe' | 'sin_configurar'> {
  const nombre = process.env.BARRIO_NOMBRE?.trim()
  const email = process.env.ADMIN_EMAIL?.trim()

  // Faltando cualquiera de las dos no se siembra: es el caso de una base que se
  // configuró a mano, y adivinar sería peor.
  if (!nombre || !email) return 'sin_configurar'

  const [existente] = await db.select().from(neighborhoods).limit(1)
  if (existente) return 'ya_existe'

  const [barrio] = await db.insert(neighborhoods).values({
    name: nombre,
    address: process.env.BARRIO_DIRECCION?.trim() || null,
    mapUrl: process.env.BARRIO_MAPA?.trim() || null,
  }).returning()

  const { inviteToken } = await createPerson({
    neighborhoodId: barrio.id,
    email,
    name: process.env.ADMIN_NOMBRE?.trim() || 'Admin',
    role: 'admin',
    unitIds: [],
    actorId: null,
  })

  const origen = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  console.log(`\nBarrio "${barrio.name}" creado con el admin ${email}.`)
  console.log(`Link de alta: ${origen}/acceso?t=${inviteToken}\n`)

  return 'sembrado'
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd api && npx vitest run tests/seed.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests.

- [ ] **Step 5: Correrlo al arrancar**

Crear `api/src/seed-cli.ts`, que es lo que ejecuta el contenedor:

```ts
import { pool } from './db/index.js'
import { sembrar } from './seed.js'

console.log(`Seed: ${await sembrar()}`)
await pool.end()
```

Borrar `api/src/seed-admin.ts`: lo reemplaza esto, y mantener dos caminos para
crear el primer admin es pedir que se desincronicen.

```bash
rm api/src/seed-admin.ts
```

Si `api/package.json` tiene un script `seed:admin` que lo invoca, cambiarlo a
`"seed": "node dist/seed-cli.js"`.

En `api/Dockerfile`, reemplazar la última línea por:

```dockerfile
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/seed-cli.js && node dist/server.js"]
```

- [ ] **Step 6: Las variables en los composes**

En `docker-compose.yml`, agregar al `environment` del servicio `api`:

```yaml
      # Siembra el barrio en una base vacía. Si ya hay barrio, no hace nada.
      BARRIO_NOMBRE: ${BARRIO_NOMBRE:-Mi barrio}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-}
      ADMIN_NOMBRE: ${ADMIN_NOMBRE:-}
      LOGO_DIR: /data/branding
    volumes:
      - logos:/data/branding
```

y al final del archivo, junto a `dbdata`:

```yaml
  logos:
```

En `docker-compose.coolify.yml`, lo mismo en el servicio `api`, pero sin
defaults —en producción las variables se cargan en la UI— y agregando dirección
y mapa:

```yaml
      BARRIO_NOMBRE: ${BARRIO_NOMBRE:?falta BARRIO_NOMBRE}
      BARRIO_DIRECCION: ${BARRIO_DIRECCION:-}
      BARRIO_MAPA: ${BARRIO_MAPA:-}
      ADMIN_EMAIL: ${ADMIN_EMAIL:?falta ADMIN_EMAIL}
      ADMIN_NOMBRE: ${ADMIN_NOMBRE:-}
      LOGO_DIR: /data/branding
      # Lo usa el layout de Next para leer la marca desde adentro de la red.
      API_INTERNAL_URL: http://api:8080
    volumes:
      - logos:/data/branding
```

con su volumen `logos:` al final.

- [ ] **Step 7: Verificar el arranque de punta a punta**

Run:
```bash
cd .. && docker compose down -v
BARRIO_NOMBRE="Los Aromos" ADMIN_EMAIL=admin@aromos.test ADMIN_NOMBRE=Gianluca \
  docker compose up -d --build
docker compose logs api | grep -A2 "Barrio"
```
Expected: el log imprime `Barrio "Los Aromos" creado…` con el link de alta.
Volver a levantar con `docker compose up -d` tiene que imprimir
`Seed: ya_existe` y no crear nada.

- [ ] **Step 8: Commit**

```bash
git add api/src/seed.ts api/src/seed-cli.ts api/tests/seed.test.ts api/Dockerfile \
  api/package.json docker-compose.yml docker-compose.coolify.yml
git rm api/src/seed-admin.ts
git commit -m "feat: el barrio se siembra desde el entorno al instalar"
```

---

### Task 5: El color en el front

**Files:**
- Modify: `web/src/app/globals.css`
- Create: `web/src/lib/marca.ts`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/Dockerfile`, `docker-compose.yml`

**Interfaces:**
- Consumes: `GET /branding` de la Tarea 2.
- Produces: `leerMarca(): Promise<{ nombre: string; color: string; tieneLogo: boolean }>` en `web/src/lib/marca.ts`, solo para componentes de servidor.

- [ ] **Step 1: Renombrar los tokens**

En `web/src/app/globals.css`, reemplazar las tres declaraciones del bloque
`@theme`:

```css
  --color-marca: var(--marca);
  --color-marca-deep: var(--marca-deep);
  --color-marca-line: var(--marca-line);
```

y actualizar el comentario de arriba del archivo, que hoy dice "Sistema de
Álamo Alto":

```css
/*
  Sistema de VisitPass.
  La identidad arranca del cartel de un barrio real: verde de chapa vial, doble
  filete blanco, etiquetas en caja alta espaciada. El color es del barrio y
  entra por --marca-base; el resto de la forma es del producto.
  El veredicto de la garita NO usa los colores de marca: se separa por
  luminancia, que sobrevive al daltonismo y a las pantallas malas.
*/
```

- [ ] **Step 2: Derivar las variantes**

En el mismo archivo, reemplazar las tres líneas `--alamo*` de `:root` por:

```css
  /* El servidor pisa esto con el color del barrio. El verde es el default del
     producto: una instalación nueva se ve bien sin elegir nada. */
  --marca-base: #1e6b47;

  --marca: var(--marca-base);
  --marca-deep: color-mix(in oklab, var(--marca-base) 65%, black);
  --marca-line: color-mix(in oklab, var(--marca-base) 8%, white);
```

y en **los dos** bloques oscuros —`:root[data-theme='dark']` y el de
`prefers-color-scheme`— reemplazar sus tres líneas `--alamo*` por:

```css
    /* En oscuro la marca sube un paso de la escala: el verde sobre fondo
       oscuro no llega a contraste de texto. No se redefine --marca-base: un
       token no puede derivarse de sí mismo. */
    --marca: color-mix(in oklab, var(--marca-base) 55%, white);
    --marca-deep: color-mix(in oklab, var(--marca-base) 75%, white);
    --marca-line: color-mix(in oklab, var(--marca-base) 6%, white);
```

Después, renombrar los usos en todo el front:

```bash
cd web && grep -rl "alamo" src/ | xargs sed -i 's/\balamo-deep\b/marca-deep/g; s/\balamo-line\b/marca-line/g; s/\balamo\b/marca/g'
```

Run: `cd web && grep -rn "alamo" src/ || echo "sin rastros"`
Expected: `sin rastros`.

- [ ] **Step 3: Verificar que el verde sigue dando lo mismo**

Es el criterio de aceptación de los porcentajes: con `#1e6b47` como base, las
derivadas tienen que quedar cerca de los valores de hoy, que ya están validados
en los dos temas.

Run: `cd web && npx next build && cd .. && docker compose up -d --build web`

Abrir `http://localhost:3000/login` y comparar a ojo contra una captura previa:
el verde del botón y del wordmark tienen que verse iguales. Si el `--marca-deep`
del tema claro sale notoriamente más claro o más oscuro que `#0d3d28`, ajustar
el porcentaje del `color-mix` y repetir. Lo mismo en oscuro contra `#5cb98a`.

- [ ] **Step 4: Leer la marca desde el servidor**

Crear `web/src/lib/marca.ts`:

```ts
/**
 * La marca del barrio, leída en el servidor.
 *
 * OJO con la URL: el navegador le pega a `/api` relativo, pero esto corre
 * adentro del contenedor y tiene que salir por la red de Docker. Son dos
 * caminos distintos a la misma API.
 *
 * Si la API no contesta, devuelve los valores del producto y la página se
 * dibuja igual: el color es decoración y no puede voltear la app.
 */
export type Marca = { nombre: string; color: string; tieneLogo: boolean }

const DEFAULT: Marca = { nombre: 'VisitPass', color: '#1e6b47', tieneLogo: false }

export async function leerMarca(): Promise<Marca> {
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
  try {
    const res = await fetch(`${base}/branding`, { next: { revalidate: 60 } })
    if (!res.ok) return DEFAULT
    return await res.json() as Marca
  } catch {
    return DEFAULT
  }
}
```

- [ ] **Step 5: Inyectarla en el layout**

En `web/src/app/layout.tsx`, agregar el import:

```ts
import { leerMarca } from '@/lib/marca'
```

cambiar el `metadata` por VisitPass:

```ts
export const metadata: Metadata = {
  title: 'VisitPass',
  description: 'Invitaciones y control de acceso para barrios cerrados',
}
```

y hacer el componente asíncrono, inyectando la variable en el `<head>`:

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const marca = await leerMarca()

  return (
    <html lang="es-AR" className={`${archivo.variable} ${playfair.variable}`}
      suppressHydrationWarning>
      <head>
        {/* Antes de pintar: si no, la pantalla arranca clara y salta a oscura. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
        {/* El color del barrio, en el HTML y no en un fetch del cliente: así no
            hay un parpadeo del verde por defecto antes de pintarse el propio.
            Solo se inyecta la base; las variantes las deriva el CSS. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--marca-base:${marca.color}}` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

`marca.color` viene de la paleta validada por la API, así que no puede traer
caracteres que rompan el `<style>`.

- [ ] **Step 6: La variable en el entorno del front**

En `docker-compose.yml`, agregar al servicio `web`:

```yaml
    environment:
      # El layout corre adentro del contenedor: /api relativo no le sirve.
      API_INTERNAL_URL: http://api:8080
```

- [ ] **Step 7: Verificar que el color del barrio pinta**

Run:
```bash
cd web && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx next build
cd .. && docker compose up -d --build
```

Después, con una sesión de admin, cambiar el color y recargar:

```bash
node -e "
;(async()=>{
  const r = await fetch('http://127.0.0.1:8080/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'ADMIN@EJEMPLO',password:'LACLAVE'})})
  const c = r.headers.get('set-cookie').split(';')[0]
  await fetch('http://127.0.0.1:8080/admin/neighborhood',{method:'PATCH',headers:{cookie:c,'content-type':'application/json'},body:JSON.stringify({brandColor:'#7a1f3d'})})
  const html = await (await fetch('http://127.0.0.1:3000/login')).text()
  console.log(html.match(/--marca-base:[^}]+/)?.[0])
})()"
```
Expected: imprime `--marca-base:#7a1f3d`. Con `revalidate: 60`, puede tardar
hasta un minuto en reflejarse; forzar con `docker compose restart web`.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/globals.css web/src/lib/marca.ts web/src/app/layout.tsx \
  web/src/ docker-compose.yml
git commit -m "feat: el color del barrio entra por una variable CSS inyectada en el servidor"
```

---

### Task 6: El nombre del barrio y el logo en pantalla

**Files:**
- Modify: `web/src/components/ui.tsx` (`Wordmark`)
- Modify: `web/src/components/shell.tsx`
- Modify: `web/src/components/guest-page.tsx`
- Modify: `web/src/components/qr-share.tsx`
- Modify: `web/src/app/login/page.tsx`
- Modify: `web/src/app/admin/guardias/page.tsx`
- Modify: `api/src/lib/excel.ts`

**Interfaces:**
- Consumes: `GET /branding` de la Tarea 2.
- Produces: `Wordmark` acepta `marca?: { nombre: string; tieneLogo: boolean }`.

- [ ] **Step 1: El Wordmark muestra el logo o el nombre**

En `web/src/components/ui.tsx`, reemplazar `Wordmark` por:

```tsx
/**
 * Lockup del encabezado: la itálica vive acá y en ningún otro lado.
 *
 * Es el único componente que conoce la marca del barrio. Si hay logo lo
 * muestra; si no, el nombre en itálica, que es lo que había antes.
 *
 * Se apila abajo de `sm`. En una línea, el nombre más el subtítulo más el
 * toggle de tema más el botón de salir no entran en un teléfono angosto: el
 * encabezado empujaba la página entera y aparecía el scroll horizontal.
 */
export function Wordmark({ nombre, tieneLogo = false, subtitle = 'Barrio cerrado' }: {
  nombre: string
  tieneLogo?: boolean
  subtitle?: string
}) {
  return (
    <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
      {tieneLogo ? (
        // Altura fija y ancho automático: un logo apaisado y uno cuadrado
        // tienen que convivir sin romper el alto del encabezado.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/api/branding/logo" alt={nombre} className="h-8 w-auto max-w-[12rem] object-contain" />
      ) : (
        <span className="truncate font-[family-name:var(--font-playfair)] text-xl
          italic leading-tight text-marca sm:text-2xl">
          {nombre}
        </span>
      )}
      <span className="eyebrow truncate">{subtitle}</span>
    </div>
  )
}
```

- [ ] **Step 2: Que el Shell le pase la marca**

El `Shell` ya es un componente cliente y tiene `me`. La marca la trae de la API
una sola vez. En `web/src/components/shell.tsx`, agregar el estado y el efecto
al principio del componente `Shell`:

```tsx
  const [marca, setMarca] = useState<{ nombre: string; tieneLogo: boolean }>(
    { nombre: '', tieneLogo: false },
  )

  useEffect(() => {
    api<{ nombre: string; tieneLogo: boolean }>('/branding')
      .then(setMarca)
      .catch(() => {})
  }, [])
```

con el import de `api`:

```tsx
import { api } from '@/lib/api'
```

y reemplazar el uso del `Wordmark`:

```tsx
            <Wordmark nombre={marca.nombre} tieneLogo={marca.tieneLogo} subtitle={subtitulo} />
```

Mientras no llegó, `nombre` es `''` y no se ve un nombre equivocado: se ve
nada, que es preferible a mostrar "VisitPass" y que parpadee al del barrio.

- [ ] **Step 3: La página del invitado**

`guest-page.tsx` ya recibe `inv.neighborhood.name` de la API pública, así que no
necesita el endpoint. En `web/src/components/guest-page.tsx`, dentro de
`Cabecera`, reemplazar:

```tsx
      <Wordmark subtitle={inv.neighborhood.name} />
```

por:

```tsx
      {/* El invitado ya tiene el nombre del barrio en su propia respuesta. */}
      <Wordmark nombre={inv.neighborhood.name} subtitle="Barrio cerrado" />
```

Los demás usos son siete, y todos son pantallas **sin sesión** donde no hay de
dónde sacar el nombre del barrio. En las siete va `nombre="VisitPass"`: son
exactamente las pantallas donde el producto sí se nombra.

| Archivo | Línea |
|---|---|
| `web/src/app/acceso/page.tsx` | 63 y 79 |
| `web/src/app/i/[token]/page.tsx` | 25 — la pantalla de "esta invitación no existe" |
| `web/src/app/login/page.tsx` | 62 |
| `web/src/app/olvide/page.tsx` | 21 |
| `web/src/app/reset/page.tsx` | 50 y 65 |

En las siete, reemplazar `<Wordmark />` por `<Wordmark nombre="VisitPass" />`.

Run: `cd web && grep -rn "<Wordmark" src/`
Expected: nueve usos, todos con `nombre`.

- [ ] **Step 4: Los strings de WhatsApp**

En `web/src/components/qr-share.tsx`, el texto nombra el barrio. El componente
recibe `token` y `guestName`; agregarle el nombre:

```tsx
export function QrShare({ token, guestName, barrio }: {
  token: string
  guestName: string
  barrio: string
}) {
```

y reemplazar las dos líneas con "Álamo Alto":

```tsx
  const texto = `Hola ${guestName}, te dejo el acceso a ${barrio}: ${url}`
```

```tsx
      await navigator.share({ title: `Invitación a ${barrio}`, text: texto, url }).catch(() => {})
```

Los llamadores son **dos**: `web/src/components/invitation-detail.tsx:59` y
`web/src/app/nueva/page.tsx:37`. Ninguno tiene el nombre del barrio. Pasárselo desde el mismo estado `marca` del Shell no es posible —son
componentes hermanos—, así que `InvitationDetail` trae la marca igual que el
Shell. En `web/src/components/invitation-detail.tsx`, agregar:

```tsx
  const [barrio, setBarrio] = useState('')
  useEffect(() => {
    api<{ nombre: string }>('/branding').then((m) => setBarrio(m.nombre)).catch(() => {})
  }, [])
```

y pasarlo: `<QrShare token={inv.token} guestName={inv.guestName} barrio={barrio} />`.

Lo mismo en `web/src/app/nueva/page.tsx`: el mismo estado, el mismo efecto, y
`<QrShare token={creada.token} guestName={creada.guestName} barrio={barrio} />`.

Run: `cd web && grep -rn "<QrShare" src/`
Expected: los dos con `barrio`.

- [ ] **Step 5: Los dos que quedan**

En `web/src/app/login/page.tsx`, el mensaje nombra el barrio y la pantalla no lo
sabe. Generalizarlo:

```ts
  not_in_padron: 'Ese mail no está en el padrón del barrio. Pedile el alta a la administración.',
```

En `web/src/app/admin/guardias/page.tsx`, el placeholder:

```tsx
                placeholder="carlos@mail.com"
```

En `api/src/lib/excel.ts`, el autor del archivo sale del barrio. Agregarle un
segundo parámetro:

```ts
export async function buildWorkbook(
  hojas: { nombre: string; columnas: Columna[]; filas: Record<string, unknown>[] }[],
  autor: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = autor
```

Y en `api/src/routes/gate.ts`, en el handler de `/audit.xlsx`, leer el barrio y
pasárselo. Ya está importado `getNeighborhood`; si no, agregar:

```ts
import { getNeighborhood } from '../services/neighborhoods.js'
```

```ts
  const barrio = await getNeighborhood(req.person!.neighborhoodId)
  const buffer = await buildWorkbook([
    // …las dos hojas, sin cambios…
  ], barrio.name)
```

El `await` extra es una query por exportación, que se hace una vez cada tanto.

- [ ] **Step 6: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint src --max-warnings=0 && npm run check && npx next build`
Expected: todo limpio.

Run: `cd .. && grep -rn "Álamo Alto\|Alamo Alto" web/src api/src || echo "sin rastros"`
Expected: `sin rastros`.

- [ ] **Step 7: Commit**

```bash
git add web/src api/src/lib/excel.ts api/src/routes/gate.ts
git commit -m "feat: la app muestra el nombre y el logo del barrio, no los de Alamo Alto"
```

---

### Task 7: La pantalla de administración

**Files:**
- Modify: `web/src/app/admin/barrio/page.tsx`

**Interfaces:**
- Consumes: `GET /admin/neighborhood` (con `brandColor` y `paleta`), `PATCH /admin/neighborhood`, `PUT`/`DELETE /admin/branding/logo`.

- [ ] **Step 1: El tipo y el estado**

En `web/src/app/admin/barrio/page.tsx`, reemplazar el tipo y agregar estado:

```tsx
type Barrio = {
  id: string
  name: string
  address: string | null
  mapUrl: string | null
  brandColor: string | null
  paleta: string[]
}
```

```tsx
  const [color, setColor] = useState<string | null>(null)
  const [tieneLogo, setTieneLogo] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
```

En el efecto que carga el barrio, agregar `setColor(b.brandColor)`, y leer si
hay logo:

```tsx
    api<{ tieneLogo: boolean }>('/branding')
      .then((m) => setTieneLogo(m.tieneLogo))
      .catch(() => {})
```

- [ ] **Step 2: Elegir el color**

Agregar dentro del formulario, antes del botón de guardar:

```tsx
        <fieldset>
          <legend className="eyebrow mb-2">Color del barrio</legend>
          <div className="flex flex-wrap gap-2">
            {(barrio?.paleta ?? []).map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                aria-label={`Color ${c}`} aria-pressed={color === c}
                style={{ backgroundColor: c }}
                className={`size-11 rounded-full border-2 ${
                  color === c ? 'border-ink' : 'border-transparent'
                }`} />
            ))}
          </div>
          <p className="mt-1.5 text-sm text-ink-soft">
            Es una lista cerrada a propósito: son los colores con los que el texto
            encima se lee bien, de día y de noche.
          </p>
        </fieldset>
```

y en `guardar()`, mandar el color:

```tsx
        body: JSON.stringify({ address, mapUrl, ...(color ? { brandColor: color } : {}) }),
```

El cambio se ve al recargar, porque el color lo pinta el servidor en el HTML.
Agregar eso al aviso:

```tsx
      setAviso('Guardado. Recargá la página para ver el color nuevo.')
```

- [ ] **Step 3: Subir y borrar el logo**

Agregar una sección al final de la página, fuera del formulario:

```tsx
        <Filete className="flex flex-col gap-3 bg-card p-5">
          <Eyebrow>Logo</Eyebrow>
          {tieneLogo ? (
            // La query evita que el navegador siga mostrando el anterior desde
            // su caché después de reemplazarlo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/branding/logo?v=${Date.now()}`} alt="Logo del barrio"
              className="h-16 w-auto max-w-[16rem] object-contain" />
          ) : (
            <p className="text-ink-soft">
              Sin logo se muestra el nombre del barrio en itálica.
            </p>
          )}

          <input type="file" accept="image/png,image/jpeg" disabled={subiendo}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setSubiendo(true)
              setError(null)
              try {
                const res = await fetch(`${apiBase}/admin/branding/logo`, {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': file.type },
                  body: file,
                })
                if (!res.ok) throw new Error(String(res.status))
                setTieneLogo(true)
                setAviso('Logo actualizado.')
              } catch {
                setError('No se pudo subir. Tiene que ser un PNG o un JPG de menos de 500 KB.')
              }
              setSubiendo(false)
              e.target.value = ''
            }} />

          {tieneLogo && (
            <Button variant="quiet" type="button" onClick={async () => {
              await api('/admin/branding/logo', { method: 'DELETE' })
              setTieneLogo(false)
              setAviso('Logo quitado.')
            }}>
              Quitar el logo
            </Button>
          )}
        </Filete>
```

con el import de `apiBase`:

```tsx
import { api, apiBase } from '@/lib/api'
```

Se usa `fetch` directo y no el helper `api()` porque este manda un binario con
su propio `Content-Type`, y el helper fuerza `application/json`.

- [ ] **Step 4: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx next build`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`

Entrar como admin a *Administración → Barrio*, elegir un color, guardar,
recargar y confirmar que el verde cambió. Después subir un PNG y confirmar que
reemplaza al wordmark en el encabezado.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/admin/barrio/page.tsx
git commit -m "feat: el admin elige el color del barrio y sube su logo"
```

---

### Task 8: Cierre

**Files:**
- Delete: `api/tests/aislamiento-barrios.test.ts`
- Modify: `api/src/services/people.ts`, `api/src/services/units.ts`, `api/src/services/entries.ts` (comentarios PENDIENTE)
- Modify: `README.md`, `api/.env.example`, `.env.prod.example`

- [ ] **Step 1: Borrar los tests de aislamiento**

Con un barrio por base, el agujero no tiene consecuencia alcanzable: nunca hay
un segundo barrio sobre el que operar. Dejar los tests sugiere una deuda que ya
no existe.

```bash
git rm api/tests/aislamiento-barrios.test.ts
```

Y en los tres servicios, reemplazar el bloque de comentario que arranca con
`PENDIENTE:` por una nota que diga por qué ya no aplica. En
`api/src/services/people.ts`, antes de `disablePerson`:

```ts
/*
 * Estas funciones reciben neighborhoodId y solo lo usan para el audit log:
 * buscan la persona por id y nada más. Es deliberado. Un despliegue es un
 * barrio, así que hay una sola fila en `neighborhood` y toda persona pertenece
 * a ella; filtrar por barrio no cambiaría ningún resultado.
 *
 * Si alguna vez varios barrios comparten una base, esto SÍ hay que filtrarlo, y
 * lo mismo en units.ts (setPersonLot) y entries.ts (loadForCheck).
 */
```

En `api/src/services/units.ts`, sobre `setPersonLot`, y en
`api/src/services/entries.ts`, sobre `loadForCheck`, dejar una nota equivalente
de dos líneas apuntando acá.

- [ ] **Step 2: Las variables de ejemplo**

En `api/.env.example`, agregar al final:

```
# El barrio de esta instalacion. Se siembra al primer arranque; si la base ya
# tiene un barrio, no se hace nada.
BARRIO_NOMBRE=Mi barrio
BARRIO_DIRECCION=
BARRIO_MAPA=
ADMIN_EMAIL=
ADMIN_NOMBRE=

# Donde se guarda el logo que sube el admin.
LOGO_DIR=./.logos
```

En `.env.prod.example`, agregar las mismas con los valores de producción
comentados.

- [ ] **Step 3: El README**

Reemplazar el título y el primer párrafo:

```markdown
# VisitPass

Invitaciones y control de acceso para barrios cerrados. Reemplaza el "avisá a la
guardia por WhatsApp": el vecino genera una invitación, el invitado carga sus
datos desde un link y se lleva un QR, y el guardia lo escanea en la barrera.

**Un despliegue es un barrio.** El nombre, la dirección, el color y el logo son
configuración de la instalación, no código. Instalar un barrio nuevo es levantar
el stack con otras cuatro variables de entorno.
```

Agregar una sección después de "Correr en desarrollo":

```markdown
### Instalar un barrio

```
BARRIO_NOMBRE=Los Aromos
BARRIO_DIRECCION=Ruta 8 km 62, Pilar
BARRIO_MAPA=https://maps.google.com/?q=...
ADMIN_EMAIL=admin@losaromos.com
ADMIN_NOMBRE=Nombre del administrador
```

Al primer arranque se crean el barrio y su admin, y el link de alta sale por el
log del contenedor (o por mail, si hay `RESEND_API_KEY`). El admin elige su
contraseña con ese link, igual que cualquier vecino.

El color y el logo se cargan después desde *Administración → Barrio*. El color
sale de una paleta cerrada de ocho: son los que mantienen legible el texto que
va encima, en tema claro y oscuro.
```

Y en "Pendiente", borrar el ítem del aislamiento entre barrios y dejar los otros
dos.

- [ ] **Step 4: Suite completa y despliegue**

```bash
cd api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx eslint src --max-warnings=0 && npm run check
cd .. && docker compose up -d --build
```
Expected: todo en verde. Los tests de las tareas 1 a 4 suman; los 204 que ya
estaban siguen pasando, salvo los del archivo borrado.

- [ ] **Step 5: Commit y push**

```bash
git add -A
git commit -m "docs: VisitPass, un barrio por instalacion"
git push origin feat/v1
```
