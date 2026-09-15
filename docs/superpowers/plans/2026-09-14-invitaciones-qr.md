# App de invitaciones QR — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el aviso por WhatsApp a la guardia de un barrio cerrado por una app web donde el vecino crea invitaciones con QR, la garita las valida y registra el ingreso, y el admin gestiona el padrón y ve los reportes.

**Architecture:** Un repositorio con dos apps independientes. `api/` es un Express 5 + TypeScript en capas finas (`routes` → `services` → `db`) contra Postgres 16 vía Drizzle. `web/` es un Next.js 16 que consume esa API por HTTP con cookie de sesión. Todo corre con `docker compose up`.

**Tech Stack:** Node 24, TypeScript (strict), Express 5, Drizzle ORM, PostgreSQL 16, zod, argon2, Vitest + Supertest, Next.js 16, Tailwind v4, shadcn/ui, Resend.

**Spec:** `docs/superpowers/specs/2026-09-14-invitaciones-qr-design.md` — leerlo antes de empezar.

## Global Constraints

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **TypeScript strict.** `"strict": true` en ambos `tsconfig.json`. Nada de `any` implícito.
- **Idioma del código: inglés.** Entidades, funciones, variables, columnas. La UI visible va en español rioplatense.
- **Zona horaria: `America/Argentina/Buenos_Aires`.** Todos los `timestamp` se guardan en UTC. Cualquier corte por día se calcula en esa zona, nunca con `new Date().getDate()` del servidor.
- **IDs: `uuid` con `defaultRandom()`.** Nunca enteros autoincrementales.
- **Bajas lógicas.** Nunca `DELETE` sobre `person`, `unit` o `invitation`. Se usa `status` / `revoked_at`.
- **Validación de entrada con zod en `routes/`.** Los `services/` reciben datos ya validados y tipados.
- **Secretos por variable de entorno.** Nada hardcodeado. `.env` está en `.gitignore`.
- **Cookie de sesión:** nombre `sid`, `httpOnly`, `secure` (salvo en test), `sameSite: 'lax'`, `maxAge` 180 días.
- **Hash de contraseñas: argon2id.** Hash de tokens: SHA-256. Nunca se guarda un token en claro.
- **shadcn/ui en este proyecto usa Base UI**, que se compone con la prop `render=`, **no** con `asChild` (que es de Radix). Si un ejemplo de internet usa `asChild`, está desactualizado.
- **Commits frecuentes**, uno por tarea como mínimo, en español, formato `feat:` / `test:` / `chore:` / `fix:`.

---

## Estructura de archivos

```
api/
  src/
    db/
      schema.ts            Tablas Drizzle. Única fuente de verdad del modelo.
      index.ts             Pool de pg + instancia de drizzle.
    lib/
      crypto.ts            randomToken, sha256, hashPassword, verifyPassword
      dates.ts             todayInBuenosAires, weekdayInBuenosAires
      mail.ts              sendMail (Resend), con modo consola en dev
      audit.ts             audit(actorId, action, entity, entityId, meta)
      errors.ts            AppError + middleware de errores
    services/
      sessions.ts          createSession, resolveSession, revokeSession
      people.ts            createPerson, setPassword, listPeople, disablePerson
      auth.ts              consumeInviteToken, loginWithPassword, requestReset
      units.ts             CRUD de UF + miembros
      invitations.ts       create, listForUnit, revoke, findByToken, search
      entries.ts           registerEntry (transaccional)
      reports.ts           queries del dashboard
    routes/
      auth.ts   admin.ts   invitations.ts   gate.ts   reports.ts
    middleware/
      requireAuth.ts       resuelve la cookie → req.person
      requireRole.ts       requireRole('admin') etc.
      rateLimit.ts         límite por clave en memoria
    authz.ts               canEnter() — función pura, el corazón del sistema
    app.ts                 arma el Express (sin listen) para poder testear
    server.ts              listen
    seed-admin.ts          script de alta del primer admin
  tests/
    helpers/db.ts          resetDb() + factories
    *.test.ts
  drizzle/                 migraciones generadas
web/
  src/app/
    (auth)/login, /acceso, /reset
    (resident)/page.tsx, nueva, historial, perfil
    (gate)/garita
    (admin)/admin/...
    i/[token]/page.tsx     página pública del QR
  src/lib/api.ts           fetch tipado contra la API, con credentials: 'include'
docker-compose.yml
```

---

## FASE A — Fundación

### Task 1: Scaffold de la API con Docker y Postgres

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/.env.example`, `api/Dockerfile`
- Create: `api/src/app.ts`, `api/src/server.ts`, `api/src/db/index.ts`
- Create: `docker-compose.yml`, `.env.example`
- Test: `api/tests/health.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildApp(): express.Express` desde `src/app.ts`; `db` (instancia Drizzle) y `pool` desde `src/db/index.ts`.

- [ ] **Step 1: Inicializar el proyecto y las dependencias**

```bash
mkdir -p api/src api/tests && cd api
npm init -y
npm pkg set type=module
npm i express@^5 pg drizzle-orm zod argon2 cookie-parser cors resend
npm i -D typescript tsx vitest supertest @types/express @types/pg @types/supertest @types/cookie-parser @types/cors drizzle-kit
```

- [ ] **Step 2: Crear `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `api/src/db/index.ts`**

```ts
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL no está definida')

export const pool = new pg.Pool({ connectionString })
export const db = drizzle(pool, { schema })
```

- [ ] **Step 4: Crear `api/src/db/schema.ts` vacío por ahora**

```ts
// Las tablas se agregan en la Task 2.
export {}
```

- [ ] **Step 5: Escribir el test que falla**

`api/tests/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'

describe('GET /health', () => {
  it('responde ok y llega a la base', async () => {
    const res = await request(buildApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `cd api && npx vitest run tests/health.test.ts`
Expected: FAIL — `Cannot find module '../src/app.js'`

- [ ] **Step 7: Crear `api/src/app.ts`**

```ts
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { pool } from './db/index.js'

export function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }))

  app.get('/health', async (_req, res) => {
    await pool.query('select 1')
    res.json({ ok: true, db: true })
  })

  return app
}
```

- [ ] **Step 8: Crear `api/src/server.ts`**

```ts
import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 8080)
buildApp().listen(port, () => console.log(`API escuchando en :${port}`))
```

- [ ] **Step 9: Crear `docker-compose.yml` en la raíz**

```yaml
name: invitaciones

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: invitaciones
      POSTGRES_PASSWORD: invitaciones
      POSTGRES_DB: invitaciones
    ports: ['5432:5432']
    volumes: ['dbdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U invitaciones']
      interval: 5s
      retries: 10

  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://invitaciones:invitaciones@db:5432/invitaciones
      WEB_ORIGIN: http://localhost:3000
      PORT: 8080
    ports: ['8080:8080']
    depends_on:
      db: { condition: service_healthy }

volumes:
  dbdata:
```

`name: invitaciones` es obligatorio: sin eso, correr `docker compose` desde una subcarpeta crea un proyecto con otro nombre y otro volumen vacío.

- [ ] **Step 10: Crear `api/Dockerfile`**

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/server.js"]
```

- [ ] **Step 11: Levantar la base y correr el test**

```bash
docker compose up -d db
cd api && DATABASE_URL=postgres://invitaciones:invitaciones@localhost:5432/invitaciones npx vitest run tests/health.test.ts
```
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold de la API con Express, Drizzle y Docker"
```

---

### Task 2: Schema completo y migraciones

**Files:**
- Modify: `api/src/db/schema.ts`
- Create: `api/drizzle.config.ts`, `api/tests/helpers/db.ts`
- Test: `api/tests/schema.test.ts`

**Interfaces:**
- Consumes: `db` de la Task 1.
- Produces: las tablas `neighborhoods`, `units`, `people`, `unitMembers`, `invitations`, `entryLogs`, `auditLogs`, `authTokens`, `sessions` exportadas desde `db/schema.ts`; `resetDb()` desde `tests/helpers/db.ts`.

- [ ] **Step 1: Escribir `api/src/db/schema.ts` completo**

```ts
import {
  pgTable, uuid, text, timestamp, integer, smallint, jsonb, date, primaryKey, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const neighborhoods = pgTable('neighborhood', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const units = pgTable('unit', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  label: text('label').notNull(),
}, (t) => [uniqueIndex('unit_label_uq').on(t.neighborhoodId, t.label)])

export const people = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('invited'),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('person_email_uq').on(t.neighborhoodId, t.email),
  check('person_role_ck', sql`${t.role} in ('resident','guard','admin')`),
  check('person_status_ck', sql`${t.status} in ('invited','active','disabled')`),
])

export const unitMembers = pgTable('unit_member', {
  unitId: uuid('unit_id').notNull().references(() => units.id),
  personId: uuid('person_id').notNull().references(() => people.id),
}, (t) => [primaryKey({ columns: [t.unitId, t.personId] })])

export const invitations = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  kind: text('kind').notNull(),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to').notNull(),
  weekdays: smallint('weekdays').array(),
  capacity: integer('capacity').notNull().default(1),
  token: text('token').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invitation_token_uq').on(t.token),
  index('invitation_unit_idx').on(t.unitId, t.validTo),
  index('invitation_creator_idx').on(t.createdBy, t.createdAt),
  check('invitation_kind_ck', sql`${t.kind} in ('visita','frecuente','evento','proveedor')`),
  check('invitation_window_ck', sql`${t.validTo} >= ${t.validFrom}`),
  check('invitation_capacity_ck', sql`${t.capacity} >= 1`),
])

export const entryLogs = pgTable('entry_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  invitationId: uuid('invitation_id').notNull().references(() => invitations.id),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  guardId: uuid('guard_id').references(() => people.id),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  note: text('note'),
}, (t) => [
  index('entry_unit_idx').on(t.unitId, t.enteredAt),
  index('entry_invitation_idx').on(t.invitationId),
])

export const auditLogs = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  actorId: uuid('actor_id').references(() => people.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id'),
  meta: jsonb('meta'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_at_idx').on(t.neighborhoodId, t.at)])

export const authTokens = pgTable('auth_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id),
  tokenHash: text('token_hash').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('auth_token_hash_uq').on(t.tokenHash),
  check('auth_token_purpose_ck', sql`${t.purpose} in ('invite','reset')`),
])

export const sessions = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('session_hash_uq').on(t.tokenHash)])
```

**No hay `UNIQUE` sobre `sessions.personId`**: una fila por dispositivo, todas válidas a la vez.

- [ ] **Step 2: Crear `api/drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 3: Generar y aplicar la migración**

```bash
cd api
export DATABASE_URL=postgres://invitaciones:invitaciones@localhost:5432/invitaciones
npx drizzle-kit generate --name init
npx drizzle-kit migrate
```
Expected: se crea `drizzle/0000_init.sql` y las tablas quedan aplicadas.

- [ ] **Step 4: Crear `api/tests/helpers/db.ts`**

```ts
import { pool, db } from '../../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../../src/db/schema.js'

export async function resetDb() {
  await pool.query(`truncate table
    entry_log, invitation, unit_member, audit_log, auth_token, session, person, unit, neighborhood
    restart identity cascade`)
}

/** Crea un barrio, una UF y un vecino activo. Devuelve sus ids. */
export async function seedBasics() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  return { neighborhoodId: n.id, unitId: u.id, personId: p.id }
}
```

- [ ] **Step 5: Escribir el test que falla**

`api/tests/schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import { invitations } from '../src/db/schema.js'
import { resetDb, seedBasics } from './helpers/db.js'

describe('constraints del schema', () => {
  beforeEach(resetDb)

  it('rechaza una invitación con la ventana invertida', async () => {
    const { unitId, personId } = await seedBasics()
    await expect(db.insert(invitations).values({
      unitId, createdBy: personId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-20', validTo: '2026-09-10', token: 'abc',
    })).rejects.toThrow(/invitation_window_ck/)
  })

  it('rechaza dos UF con la misma etiqueta en el mismo barrio', async () => {
    const { neighborhoodId } = await seedBasics()
    const { units } = await import('../src/db/schema.js')
    await expect(
      db.insert(units).values({ neighborhoodId, label: 'Lote 142' })
    ).rejects.toThrow(/unit_label_uq/)
  })
})
```

- [ ] **Step 6: Correr los tests**

Run: `cd api && DATABASE_URL=postgres://invitaciones:invitaciones@localhost:5432/invitaciones npx vitest run`
Expected: PASS — los dos tests verifican que las constraints están realmente en la base, no solo en el código.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: schema completo y migración inicial"
```

---

## FASE B — Autenticación

### Task 3: Primitivas de cripto y fechas

**Files:**
- Create: `api/src/lib/crypto.ts`, `api/src/lib/dates.ts`
- Test: `api/tests/crypto.test.ts`, `api/tests/dates.test.ts`

**Interfaces:**
- Produces:
  - `randomToken(bytes?: number): string` — base64url
  - `sha256(value: string): string` — hex
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `todayInBuenosAires(now?: Date): string` — `'YYYY-MM-DD'`
  - `weekdayInBuenosAires(now?: Date): number` — 0=domingo

- [ ] **Step 1: Escribir los tests que fallan**

`api/tests/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { todayInBuenosAires, weekdayInBuenosAires } from '../src/lib/dates.js'

describe('fechas en Buenos Aires', () => {
  it('a las 02:00 UTC sigue siendo el día anterior en Buenos Aires', () => {
    expect(todayInBuenosAires(new Date('2026-09-15T02:00:00Z'))).toBe('2026-09-14')
  })

  it('a las 12:00 UTC ya es el mismo día', () => {
    expect(todayInBuenosAires(new Date('2026-09-15T12:00:00Z'))).toBe('2026-09-15')
  })

  it('devuelve el día de semana local, no el UTC', () => {
    // 2026-09-15T02:00Z es martes en UTC pero lunes (1) en Buenos Aires
    expect(weekdayInBuenosAires(new Date('2026-09-15T02:00:00Z'))).toBe(1)
  })
})
```

`api/tests/crypto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { randomToken, sha256, hashPassword, verifyPassword } from '../src/lib/crypto.js'

describe('crypto', () => {
  it('genera tokens distintos y sin caracteres de URL', () => {
    const a = randomToken(), b = randomToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('sha256 es estable', () => {
    expect(sha256('hola')).toBe(sha256('hola'))
    expect(sha256('hola')).not.toBe(sha256('chau'))
  })

  it('verifica una contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una-contrasena-larga')
    expect(await verifyPassword(hash, 'una-contrasena-larga')).toBe(true)
    expect(await verifyPassword(hash, 'otra-cosa')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd api && npx vitest run tests/crypto.test.ts tests/dates.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Escribir `api/src/lib/crypto.ts`**

```ts
import { randomBytes, createHash } from 'node:crypto'
import argon2 from 'argon2'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Escribir `api/src/lib/dates.ts`**

```ts
export const TZ = 'America/Argentina/Buenos_Aires'

/** 'YYYY-MM-DD' en hora de Buenos Aires. */
export function todayInBuenosAires(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** 0 = domingo … 6 = sábado, en hora de Buenos Aires. */
export function weekdayInBuenosAires(now: Date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}
```

`en-CA` produce `YYYY-MM-DD` directamente; es el truco más corto para formatear una fecha en otra zona sin traer una librería.

- [ ] **Step 5: Correr los tests**

Run: `cd api && npx vitest run tests/crypto.test.ts tests/dates.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: primitivas de cripto y fechas en zona Buenos Aires"
```

---

### Task 4: Sesiones y middleware de autenticación

**Files:**
- Create: `api/src/services/sessions.ts`, `api/src/middleware/requireAuth.ts`, `api/src/middleware/requireRole.ts`, `api/src/lib/errors.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/sessions.test.ts`

**Interfaces:**
- Consumes: `sha256`, `randomToken` (Task 3); tablas `sessions`, `people` (Task 2).
- Produces:
  - `createSession(personId: string, userAgent?: string): Promise<string>` — devuelve el token **en claro** para la cookie
  - `resolveSession(token: string): Promise<AuthedPerson | null>`
  - `revokeSession(token: string): Promise<void>`
  - `type AuthedPerson = { id: string; neighborhoodId: string; name: string; email: string; role: 'resident'|'guard'|'admin' }`
  - `requireAuth` y `requireRole(...roles)` como middlewares de Express
  - `setSessionCookie(res, token)` / `clearSessionCookie(res)`
  - `AppError` con `status` y `code`
  - `req.person` tipado vía `declare global`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import { sessions } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { createSession, resolveSession, revokeSession } from '../src/services/sessions.js'
import { sha256 } from '../src/lib/crypto.js'
import { resetDb, seedBasics } from './helpers/db.js'

describe('sesiones', () => {
  beforeEach(resetDb)

  it('crea una sesión y la resuelve', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId, 'vitest')
    const person = await resolveSession(token)
    expect(person?.id).toBe(personId)
    expect(person?.role).toBe('resident')
  })

  it('nunca guarda el token en claro', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    const [row] = await db.select().from(sessions).where(eq(sessions.personId, personId))
    expect(row.tokenHash).toBe(sha256(token))
    expect(row.tokenHash).not.toBe(token)
  })

  it('permite varias sesiones simultáneas del mismo usuario', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId, 'celular')
    const b = await createSession(personId, 'compu')
    expect(await resolveSession(a)).not.toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('revocar una sesión no afecta a la otra', async () => {
    const { personId } = await seedBasics()
    const a = await createSession(personId)
    const b = await createSession(personId)
    await revokeSession(a)
    expect(await resolveSession(a)).toBeNull()
    expect(await resolveSession(b)).not.toBeNull()
  })

  it('no resuelve la sesión de una persona deshabilitada', async () => {
    const { personId } = await seedBasics()
    const token = await createSession(personId)
    const { people } = await import('../src/db/schema.js')
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
    expect(await resolveSession(token)).toBeNull()
  })
})
```

El último test es el que justifica toda la decisión de sesiones en tabla en vez de JWT.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/sessions.test.ts`
Expected: FAIL — `Cannot find module '../src/services/sessions.js'`

- [ ] **Step 3: Escribir `api/src/lib/errors.ts`**

```ts
import type { ErrorRequestHandler } from 'express'

export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal' })
}
```

- [ ] **Step 4: Escribir `api/src/services/sessions.ts`**

```ts
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, people } from '../db/schema.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import type { Response } from 'express'

const SESSION_DAYS = 180

export type AuthedPerson = {
  id: string
  neighborhoodId: string
  name: string
  email: string
  role: 'resident' | 'guard' | 'admin'
}

export async function createSession(personId: string, userAgent?: string): Promise<string> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.insert(sessions).values({ personId, tokenHash: sha256(token), userAgent, expiresAt })
  return token
}

export async function resolveSession(token: string): Promise<AuthedPerson | null> {
  const [row] = await db
    .select({
      id: people.id, neighborhoodId: people.neighborhoodId, name: people.name,
      email: people.email, role: people.role, status: people.status, sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(people, eq(people.id, sessions.personId))
    .where(and(
      eq(sessions.tokenHash, sha256(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ))
    .limit(1)

  if (!row || row.status !== 'active') return null

  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId))

  return {
    id: row.id, neighborhoodId: row.neighborhoodId, name: row.name,
    email: row.email, role: row.role as AuthedPerson['role'],
  }
}

export async function revokeSession(token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie('sid', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86_400_000,
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('sid')
}
```

- [ ] **Step 5: Escribir `api/src/middleware/requireAuth.ts`**

```ts
import type { RequestHandler } from 'express'
import { resolveSession, type AuthedPerson } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { person?: AuthedPerson }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.sid
  if (!token) return next(new AppError(401, 'no_session'))
  const person = await resolveSession(token)
  if (!person) return next(new AppError(401, 'invalid_session'))
  req.person = person
  next()
}
```

- [ ] **Step 6: Escribir `api/src/middleware/requireRole.ts`**

```ts
import type { RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'
import type { AuthedPerson } from '../services/sessions.js'

export function requireRole(...roles: AuthedPerson['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.person) return next(new AppError(401, 'no_session'))
    if (!roles.includes(req.person.role)) return next(new AppError(403, 'forbidden'))
    next()
  }
}
```

- [ ] **Step 7: Registrar el manejador de errores en `api/src/app.ts`**

Agregar como **última** línea antes del `return app`:

```ts
import { errorHandler } from './lib/errors.js'
// …
  app.use(errorHandler)
  return app
```

- [ ] **Step 8: Correr los tests**

Run: `cd api && npx vitest run tests/sessions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: sesiones en tabla y middleware de autenticacion"
```

---

### Task 5: Alta de personas, mail y consumo del magic link

**Files:**
- Create: `api/src/lib/mail.ts`, `api/src/lib/audit.ts`, `api/src/services/people.ts`, `api/src/services/auth.ts`, `api/src/routes/auth.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/invite-flow.test.ts`

**Interfaces:**
- Consumes: `createSession`, `setSessionCookie` (Task 4); `hashPassword`, `randomToken`, `sha256` (Task 3).
- Produces:
  - `sendMail(to: string, subject: string, body: string): Promise<void>`
  - `audit(actorId: string | null, neighborhoodId: string, action: string, entity: string, entityId: string, meta?: unknown): Promise<void>`
  - `createPerson(input): Promise<{ person, inviteToken }>`
  - `consumeInviteToken(token: string): Promise<{ personId: string }>`
  - `setPassword(personId: string, plain: string): Promise<void>`
  - Rutas: `GET /auth/invite/:token` (solo mira), `POST /auth/invite` (consume), `POST /auth/logout`

- [ ] **Step 1: Escribir `api/src/lib/mail.ts`**

```ts
import { Resend } from 'resend'

const key = process.env.RESEND_API_KEY
const from = process.env.MAIL_FROM ?? 'Invitaciones <noreply@example.com>'
const resend = key ? new Resend(key) : null

export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  if (!resend) {
    console.log(`\n── MAIL a ${to} ──\n${subject}\n${body}\n──\n`)
    return
  }
  await resend.emails.send({ from, to, subject, html: body })
}
```

Sin `RESEND_API_KEY` el mail se imprime en consola. Así el flujo completo se puede probar en dev sin cuenta de Resend y sin mockear nada.

- [ ] **Step 2: Escribir `api/src/lib/audit.ts`**

```ts
import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'

export async function audit(
  actorId: string | null,
  neighborhoodId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: unknown,
): Promise<void> {
  await db.insert(auditLogs).values({
    actorId, neighborhoodId, action, entity, entityId,
    meta: meta === undefined ? null : meta,
  })
}
```

- [ ] **Step 3: Escribir el test que falla**

`api/tests/invite-flow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, authTokens } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { resetDb } from './helpers/db.js'
import { createPerson } from '../src/services/people.js'

const app = buildApp()

describe('alta por magic link', () => {
  beforeEach(resetDb)

  async function invitedPerson() {
    const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
    const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
    return createPerson({
      neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
      role: 'resident', unitIds: [u.id], actorId: null,
    })
  }

  it('crea la persona en estado invited y emite un token de invitación', async () => {
    const { person, inviteToken } = await invitedPerson()
    expect(person.status).toBe('invited')
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]+$/)

    const [row] = await db.select().from(authTokens).where(eq(authTokens.personId, person.id))
    expect(row.purpose).toBe('invite')
    expect(row.tokenHash).not.toBe(inviteToken)
  })

  it('GET no consume el token (los escáneres de mail no deben romper el alta)', async () => {
    const { inviteToken } = await invitedPerson()
    const res = await request(app).get(`/auth/invite/${inviteToken}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Martín')

    const segundo = await request(app).get(`/auth/invite/${inviteToken}`)
    expect(segundo.status).toBe(200)
  })

  it('POST consume el token, crea la contraseña y deja la sesión abierta', async () => {
    const { person, inviteToken } = await invitedPerson()
    const res = await request(app)
      .post('/auth/invite')
      .send({ token: inviteToken, password: 'una-contrasena-larga' })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/)

    const [row] = await db.select().from(people).where(eq(people.id, person.id))
    expect(row.status).toBe('active')
    expect(row.passwordHash).not.toBeNull()
    expect(row.lastLoginAt).not.toBeNull()
  })

  it('el token es de un solo uso', async () => {
    const { inviteToken } = await invitedPerson()
    await request(app).post('/auth/invite').send({ token: inviteToken, password: 'una-contrasena-larga' })
    const res = await request(app).post('/auth/invite').send({ token: inviteToken, password: 'otra-contrasena-larga' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_token')
  })

  it('rechaza contraseñas de menos de 10 caracteres', async () => {
    const { inviteToken } = await invitedPerson()
    const res = await request(app).post('/auth/invite').send({ token: inviteToken, password: 'corta' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/invite-flow.test.ts`
Expected: FAIL — no existe `services/people.js`.

- [ ] **Step 5: Escribir `api/src/services/people.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people, unitMembers, authTokens } from '../db/schema.js'
import { randomToken, sha256, hashPassword } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { sendMail } from '../lib/mail.js'

const INVITE_DAYS = 7

export type CreatePersonInput = {
  neighborhoodId: string
  email: string
  name: string
  role: 'resident' | 'guard' | 'admin'
  unitIds: string[]
  actorId: string | null
}

export async function createPerson(input: CreatePersonInput) {
  const [person] = await db.insert(people).values({
    neighborhoodId: input.neighborhoodId,
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role,
    status: 'invited',
  }).returning()

  if (input.unitIds.length) {
    await db.insert(unitMembers).values(input.unitIds.map((unitId) => ({ unitId, personId: person.id })))
  }

  const inviteToken = randomToken()
  await db.insert(authTokens).values({
    personId: person.id,
    tokenHash: sha256(inviteToken),
    purpose: 'invite',
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })

  await audit(input.actorId, input.neighborhoodId, 'person.created', 'person', person.id, { role: input.role })
  await sendInviteMail(person.email, person.name, inviteToken)

  return { person, inviteToken }
}

export async function sendInviteMail(email: string, name: string, token: string) {
  const url = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/acceso?t=${token}`
  await sendMail(
    email,
    'Ya podés gestionar las visitas de tu casa',
    `<p>Hola ${name}, la administración te dio de alta en el sistema de invitaciones.</p>
     <p><a href="${url}">Entrar y crear mi contraseña</a></p>
     <p>El link vence en ${INVITE_DAYS} días.</p>`,
  )
}

export async function setPassword(personId: string, plain: string): Promise<void> {
  await db.update(people).set({ passwordHash: await hashPassword(plain) }).where(eq(people.id, personId))
}

export async function disablePerson(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'person.disabled', 'person', personId)
}
```

- [ ] **Step 6: Escribir `api/src/services/auth.ts`**

```ts
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { authTokens, people } from '../db/schema.js'
import { sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'

/** Mira el token sin consumirlo. Lo usa el GET de la página de acceso. */
export async function peekToken(token: string, purpose: 'invite' | 'reset') {
  const [row] = await db
    .select({ personId: people.id, name: people.name, email: people.email })
    .from(authTokens)
    .innerJoin(people, eq(people.id, authTokens.personId))
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ))
    .limit(1)
  return row ?? null
}

/** Consume el token de forma atómica: el UPDATE condicional impide el doble uso. */
export async function consumeToken(token: string, purpose: 'invite' | 'reset'): Promise<string> {
  const updated = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ))
    .returning({ personId: authTokens.personId })

  if (!updated.length) throw new AppError(400, 'invalid_token')
  return updated[0].personId
}
```

El `UPDATE … WHERE used_at IS NULL … RETURNING` es lo que hace el consumo atómico: dos requests simultáneos con el mismo token, solo uno recibe fila.

- [ ] **Step 7: Escribir `api/src/routes/auth.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { peekToken, consumeToken } from '../services/auth.js'
import { setPassword } from '../services/people.js'
import { createSession, setSessionCookie, clearSessionCookie, revokeSession } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

export const authRoutes = Router()

const passwordSchema = z.string().min(10, 'La contraseña necesita al menos 10 caracteres')

authRoutes.get('/invite/:token', async (req, res) => {
  const row = await peekToken(req.params.token, 'invite')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ name: row.name, email: row.email })
})

authRoutes.post('/invite', async (req, res) => {
  const { token, password } = z.object({ token: z.string(), password: passwordSchema }).parse(req.body)
  const personId = await consumeToken(token, 'invite')
  await setPassword(personId, password)
  await db.update(people).set({ status: 'active', lastLoginAt: new Date() }).where(eq(people.id, personId))

  const sid = await createSession(personId, req.get('user-agent'))
  setSessionCookie(res, sid)
  res.json({ ok: true })
})

authRoutes.post('/logout', async (req, res) => {
  if (req.cookies?.sid) await revokeSession(req.cookies.sid)
  clearSessionCookie(res)
  res.json({ ok: true })
})
```

- [ ] **Step 8: Montar las rutas y traducir errores de zod en `api/src/app.ts`**

Antes de `app.use(errorHandler)`:

```ts
import { authRoutes } from './routes/auth.js'
import { ZodError } from 'zod'
// …
  app.use('/auth', authRoutes)

  app.use((err: unknown, _req, res, next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'validation', issues: err.issues })
      return
    }
    next(err)
  })
  app.use(errorHandler)
```

- [ ] **Step 9: Correr los tests**

Run: `cd api && npx vitest run tests/invite-flow.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: alta de personas por magic link con creacion de contrasena"
```

---

### Task 6: Login con contraseña, reset y rate limit

**Files:**
- Create: `api/src/middleware/rateLimit.ts`
- Modify: `api/src/routes/auth.ts`, `api/src/services/auth.ts`
- Test: `api/tests/login.test.ts`

**Interfaces:**
- Consumes: todo lo de la Task 5.
- Produces:
  - `rateLimit({ max, windowMs, key })` middleware
  - `requestPasswordReset(email: string): Promise<void>`
  - Rutas: `POST /auth/login`, `POST /auth/forgot`, `GET /auth/reset/:token`, `POST /auth/reset`, `GET /auth/me`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/login.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function activePerson(email = 'martin@example.com') {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: n.id, email, name: 'Martín', role: 'resident',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  return p
}

describe('login con contraseña', () => {
  beforeEach(resetDb)

  it('entra con la contraseña correcta y devuelve la cookie', async () => {
    await activePerson()
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/)
  })

  it('rechaza la contraseña incorrecta sin decir si el mail existe', async () => {
    await activePerson()
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: 'incorrecta!!' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  it('devuelve el mismo error para un mail inexistente', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nadie@example.com', password: PASS })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  it('no deja entrar a una persona deshabilitada', async () => {
    const p = await activePerson()
    const { eq } = await import('drizzle-orm')
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, p.id))
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(401)
  })

  it('corta al sexto intento fallido del mismo mail', async () => {
    await activePerson()
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').send({ email: 'martin@example.com', password: 'mal-mal-mal' })
    }
    const res = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(res.status).toBe(429)
  })

  it('/auth/me devuelve la persona logueada', async () => {
    await activePerson()
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/auth/me').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Martín')
  })

  it('/auth/forgot responde ok aunque el mail no exista', async () => {
    const res = await request(app).post('/auth/forgot').send({ email: 'nadie@example.com' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/login.test.ts`
Expected: FAIL — 404 en `/auth/login`.

- [ ] **Step 3: Escribir `api/src/middleware/rateLimit.ts`**

```ts
import type { Request, RequestHandler } from 'express'
import { AppError } from '../lib/errors.js'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// ponytail: contador en memoria, se pierde al reiniciar y no se comparte entre
// réplicas. Si algún día corre más de una instancia, mover a Postgres o Redis.
export function rateLimit(opts: { max: number; windowMs: number; key: (req: Request) => string }): RequestHandler {
  return (req, _res, next) => {
    const now = Date.now()
    const k = opts.key(req)
    const bucket = buckets.get(k)

    if (!bucket || bucket.resetAt < now) {
      buckets.set(k, { count: 1, resetAt: now + opts.windowMs })
      return next()
    }
    if (bucket.count >= opts.max) return next(new AppError(429, 'too_many_requests'))

    bucket.count++
    next()
  }
}

export function resetRateLimits() { buckets.clear() }
```

- [ ] **Step 4: Agregar `requestPasswordReset` a `api/src/services/auth.ts`**

```ts
import { randomToken } from '../lib/crypto.js'
import { sendMail } from '../lib/mail.js'

const RESET_MINUTES = 15

export async function requestPasswordReset(email: string): Promise<void> {
  const [person] = await db.select().from(people)
    .where(and(eq(people.email, email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  // Silencio deliberado: la respuesta HTTP es idéntica exista o no la cuenta.
  if (!person) return

  const token = randomToken()
  await db.insert(authTokens).values({
    personId: person.id,
    tokenHash: sha256(token),
    purpose: 'reset',
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
  })

  const url = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/reset?t=${token}`
  await sendMail(person.email, 'Restablecer tu contraseña',
    `<p>Hola ${person.name}, para elegir una contraseña nueva entrá acá:</p>
     <p><a href="${url}">Restablecer contraseña</a></p>
     <p>El link vence en ${RESET_MINUTES} minutos. Si no lo pediste, ignorá este mail.</p>`)
}
```

- [ ] **Step 5: Agregar las rutas a `api/src/routes/auth.ts`**

```ts
import { and } from 'drizzle-orm'
import { verifyPassword } from '../lib/crypto.js'
import { requestPasswordReset } from '../services/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireAuth } from '../middleware/requireAuth.js'

const loginLimiter = rateLimit({
  max: 5,
  windowMs: 15 * 60_000,
  key: (req) => `login:${String(req.body?.email ?? '').toLowerCase()}`,
})

authRoutes.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)

  const [person] = await db.select().from(people)
    .where(and(eq(people.email, email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  // Mismo error en los tres casos: no se filtra si el mail existe.
  if (!person?.passwordHash || !(await verifyPassword(person.passwordHash, password))) {
    throw new AppError(401, 'invalid_credentials')
  }

  await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, person.id))
  setSessionCookie(res, await createSession(person.id, req.get('user-agent')))
  res.json({ ok: true })
})

authRoutes.post('/forgot',
  rateLimit({ max: 3, windowMs: 15 * 60_000, key: (req) => `forgot:${String(req.body?.email ?? '')}` }),
  async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    await requestPasswordReset(email)
    res.json({ ok: true })
  })

authRoutes.get('/reset/:token', async (req, res) => {
  const row = await peekToken(req.params.token, 'reset')
  if (!row) throw new AppError(400, 'invalid_token')
  res.json({ name: row.name })
})

authRoutes.post('/reset', async (req, res) => {
  const { token, password } = z.object({ token: z.string(), password: passwordSchema }).parse(req.body)
  const personId = await consumeToken(token, 'reset')
  await setPassword(personId, password)
  setSessionCookie(res, await createSession(personId, req.get('user-agent')))
  res.json({ ok: true })
})

authRoutes.get('/me', requireAuth, (req, res) => {
  res.json(req.person)
})
```

- [ ] **Step 6: Limpiar el rate limit entre tests**

Agregar al principio de `api/tests/login.test.ts`, dentro del `beforeEach`:

```ts
import { resetRateLimits } from '../src/middleware/rateLimit.js'
// …
  beforeEach(async () => { await resetDb(); resetRateLimits() })
```

Reemplaza el `beforeEach(resetDb)` que estaba.

- [ ] **Step 7: Correr los tests**

Run: `cd api && npx vitest run tests/login.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: login con contrasena, reset y rate limit"
```

---

### Task 7: Seed del primer admin

**Files:**
- Create: `api/src/seed-admin.ts`
- Modify: `api/package.json` (script `seed:admin`)
- Test: verificación manual (es un script de una sola corrida, no vale un test).

**Interfaces:**
- Consumes: `createPerson` (Task 5).
- Produces: comando `npm run seed:admin -- --email=x --name=Y --barrio="Los Robles"`.

- [ ] **Step 1: Escribir `api/src/seed-admin.ts`**

```ts
import { parseArgs } from 'node:util'
import { db, pool } from './db/index.js'
import { neighborhoods } from './db/schema.js'
import { createPerson } from './services/people.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string', default: 'Admin' },
    barrio: { type: 'string', default: 'Mi barrio' },
  },
})

if (!values.email) {
  console.error('Uso: npm run seed:admin -- --email=vos@mail.com [--name=Nombre] [--barrio="Los Robles"]')
  process.exit(1)
}

const [existing] = await db.select().from(neighborhoods).limit(1)
const neighborhood = existing ?? (await db.insert(neighborhoods).values({ name: values.barrio! }).returning())[0]

const { inviteToken } = await createPerson({
  neighborhoodId: neighborhood.id,
  email: values.email,
  name: values.name!,
  role: 'admin',
  unitIds: [],
  actorId: null,
})

console.log(`\nAdmin creado en el barrio "${neighborhood.name}".`)
console.log(`Link de acceso: ${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/acceso?t=${inviteToken}\n`)
await pool.end()
```

- [ ] **Step 2: Agregar los scripts a `api/package.json`**

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "test": "vitest run",
    "seed:admin": "tsx src/seed-admin.ts",
    "migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 3: Verificar a mano**

```bash
cd api
DATABASE_URL=postgres://invitaciones:invitaciones@localhost:5432/invitaciones \
  npm run seed:admin -- --email=vos@mail.com --barrio="Los Robles"
```
Expected: imprime el link de acceso, y el mail aparece en consola porque no hay `RESEND_API_KEY`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: script de alta del primer admin"
```

---

## FASE C — Padrón

### Task 8: ABM de UF y de personas

**Files:**
- Create: `api/src/services/units.ts`, `api/src/routes/admin.ts`
- Modify: `api/src/app.ts`, `api/src/services/people.ts`
- Test: `api/tests/admin.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` (Task 4), `createPerson`, `disablePerson`, `audit` (Task 5).
- Produces:
  - `createUnit(neighborhoodId, label, actorId)`, `listUnits(neighborhoodId)`
  - `listPeople(neighborhoodId)` → incluye `units: {id,label}[]` y `status`
  - `resendInvite(personId, actorId)`
  - `setGuardPassword(personId, plain, actorId)`
  - Rutas bajo `/admin`, todas con `requireRole('admin')`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/admin.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function loginAs(role: 'admin' | 'resident') {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const neighborhood = n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
  const email = `${role}@example.com`
  await db.insert(people).values({
    neighborhoodId: neighborhood.id, email, name: role, role,
    status: 'active', passwordHash: await hashPassword(PASS),
  })
  const res = await request(app).post('/auth/login').send({ email, password: PASS })
  return { cookie: res.headers['set-cookie'], neighborhoodId: neighborhood.id }
}

describe('padrón', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el admin crea una UF', async () => {
    const { cookie } = await loginAs('admin')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 142' })
    expect(res.status).toBe(201)
    expect(res.body.label).toBe('Lote 142')
  })

  it('un vecino no puede crear una UF', async () => {
    const { cookie } = await loginAs('resident')
    const res = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 9' })
    expect(res.status).toBe(403)
  })

  it('sin sesión devuelve 401', async () => {
    const res = await request(app).post('/admin/units').send({ label: 'Lote 9' })
    expect(res.status).toBe(401)
  })

  it('el admin da de alta un vecino y queda listado con su UF', async () => {
    const { cookie } = await loginAs('admin')
    const unit = await request(app).post('/admin/units').set('Cookie', cookie).send({ label: 'Lote 142' })

    const alta = await request(app).post('/admin/people').set('Cookie', cookie).send({
      email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [unit.body.id],
    })
    expect(alta.status).toBe(201)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    expect(martin.status).toBe('invited')
    expect(martin.units[0].label).toBe('Lote 142')
  })

  it('deshabilitar un vecino lo saca pero no lo borra', async () => {
    const { cookie } = await loginAs('admin')
    const alta = await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [] })

    const res = await request(app).post(`/admin/people/${alta.body.id}/disable`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const lista = await request(app).get('/admin/people').set('Cookie', cookie)
    const martin = lista.body.find((p: { email: string }) => p.email === 'martin@example.com')
    expect(martin.status).toBe('disabled')
  })

  it('el alta queda registrada en la auditoría', async () => {
    const { cookie, neighborhoodId } = await loginAs('admin')
    await request(app).post('/admin/people').set('Cookie', cookie)
      .send({ email: 'martin@example.com', name: 'Martín', role: 'resident', unitIds: [] })

    const { auditLogs } = await import('../src/db/schema.js')
    const { eq } = await import('drizzle-orm')
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.neighborhoodId, neighborhoodId))
    expect(rows.some((r) => r.action === 'person.created')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/admin.test.ts`
Expected: FAIL — 404 en `/admin/units`.

- [ ] **Step 3: Escribir `api/src/services/units.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { units, unitMembers } from '../db/schema.js'
import { audit } from '../lib/audit.js'

export async function createUnit(neighborhoodId: string, label: string, actorId: string) {
  const [unit] = await db.insert(units).values({ neighborhoodId, label: label.trim() }).returning()
  await audit(actorId, neighborhoodId, 'unit.created', 'unit', unit.id, { label: unit.label })
  return unit
}

export async function listUnits(neighborhoodId: string) {
  return db.select().from(units).where(eq(units.neighborhoodId, neighborhoodId)).orderBy(units.label)
}

export async function unitsOfPerson(personId: string) {
  return db.select({ id: units.id, label: units.label })
    .from(unitMembers)
    .innerJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(unitMembers.personId, personId))
}
```

- [ ] **Step 4: Agregar `listPeople`, `resendInvite` y `setGuardPassword` a `api/src/services/people.ts`**

```ts
import { units } from '../db/schema.js'

export async function listPeople(neighborhoodId: string) {
  const rows = await db.select({
    id: people.id, email: people.email, name: people.name, role: people.role,
    status: people.status, lastLoginAt: people.lastLoginAt,
    unitId: units.id, unitLabel: units.label,
  })
    .from(people)
    .leftJoin(unitMembers, eq(unitMembers.personId, people.id))
    .leftJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(people.neighborhoodId, neighborhoodId))

  // Una fila por (persona, UF) → se agrupa en memoria. El padrón de un barrio
  // entra de sobra en RAM; no justifica un json_agg.
  const byId = new Map<string, {
    id: string; email: string; name: string; role: string; status: string
    lastLoginAt: Date | null; units: { id: string; label: string }[]
  }>()

  for (const r of rows) {
    const current = byId.get(r.id) ?? {
      id: r.id, email: r.email, name: r.name, role: r.role,
      status: r.status, lastLoginAt: r.lastLoginAt, units: [],
    }
    if (r.unitId && r.unitLabel) current.units.push({ id: r.unitId, label: r.unitLabel })
    byId.set(r.id, current)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function resendInvite(personId: string, actorId: string, neighborhoodId: string) {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
  if (!person) throw new AppError(404, 'not_found')

  const token = randomToken()
  await db.insert(authTokens).values({
    personId, tokenHash: sha256(token), purpose: 'invite',
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })
  await sendInviteMail(person.email, person.name, token)
  await audit(actorId, neighborhoodId, 'person.reinvited', 'person', personId)
}

export async function setGuardPassword(personId: string, plain: string, actorId: string, neighborhoodId: string) {
  await setPassword(personId, plain)
  await db.update(people).set({ status: 'active' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'guard.password_reset', 'person', personId)
}
```

Agregar al principio del archivo: `import { AppError } from '../lib/errors.js'`.

- [ ] **Step 5: Escribir `api/src/routes/admin.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createUnit, listUnits } from '../services/units.js'
import { createPerson, listPeople, disablePerson, resendInvite, setGuardPassword } from '../services/people.js'

export const adminRoutes = Router()
adminRoutes.use(requireAuth, requireRole('admin'))

adminRoutes.get('/units', async (req, res) => {
  res.json(await listUnits(req.person!.neighborhoodId))
})

adminRoutes.post('/units', async (req, res) => {
  const { label } = z.object({ label: z.string().min(1) }).parse(req.body)
  res.status(201).json(await createUnit(req.person!.neighborhoodId, label, req.person!.id))
})

adminRoutes.get('/people', async (req, res) => {
  res.json(await listPeople(req.person!.neighborhoodId))
})

adminRoutes.post('/people', async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(['resident', 'guard', 'admin']),
    unitIds: z.array(z.string().uuid()).default([]),
  }).parse(req.body)

  const { person } = await createPerson({
    ...body,
    neighborhoodId: req.person!.neighborhoodId,
    actorId: req.person!.id,
  })
  res.status(201).json({ id: person.id, email: person.email, status: person.status })
})

adminRoutes.post('/people/:id/disable', async (req, res) => {
  await disablePerson(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/resend', async (req, res) => {
  await resendInvite(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/password', async (req, res) => {
  const { password } = z.object({ password: z.string().min(10) }).parse(req.body)
  await setGuardPassword(req.params.id, password, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})
```

- [ ] **Step 6: Montar en `api/src/app.ts`**

```ts
import { adminRoutes } from './routes/admin.js'
// junto a las otras rutas:
  app.use('/admin', adminRoutes)
```

- [ ] **Step 7: Correr los tests**

Run: `cd api && npx vitest run tests/admin.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: ABM de UF y de personas con auditoria"
```

---

## FASE D — Invitaciones y garita

### Task 9: `canEnter()` — la lógica de autorización

**Files:**
- Create: `api/src/authz.ts`
- Test: `api/tests/authz.test.ts`

**Interfaces:**
- Consumes: `weekdayInBuenosAires`, `todayInBuenosAires` (Task 3).
- Produces:
  - `type EntryCheck = { ok: true } | { ok: false; reason: 'revoked'|'not_yet'|'expired'|'wrong_weekday'|'no_capacity' }`
  - `canEnter(inv: InvitationLike, now: Date, usedCount: number): EntryCheck`
  - `type InvitationLike = { validFrom: string; validTo: string; weekdays: number[] | null; capacity: number; revokedAt: Date | null }`

Esta es la única pieza no trivial del sistema. Es una función pura: sin base de datos, sin `Date.now()` interno, todo entra por parámetro. Por eso se puede testear exhaustivamente.

- [ ] **Step 1: Escribir el test que falla**

`api/tests/authz.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { canEnter, type InvitationLike } from '../src/authz.js'

const base: InvitationLike = {
  validFrom: '2026-09-14', validTo: '2026-09-14',
  weekdays: null, capacity: 1, revokedAt: null,
}

// 2026-09-14 es lunes. 15:00 en Buenos Aires = 18:00 UTC.
const lunes15h = new Date('2026-09-14T18:00:00Z')

describe('canEnter', () => {
  it('autoriza dentro de la ventana con cupo disponible', () => {
    expect(canEnter(base, lunes15h, 0)).toEqual({ ok: true })
  })

  it('rechaza si está revocada', () => {
    expect(canEnter({ ...base, revokedAt: new Date() }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'revoked' })
  })

  it('rechaza si todavía no empezó', () => {
    expect(canEnter({ ...base, validFrom: '2026-09-20', validTo: '2026-09-20' }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'not_yet' })
  })

  it('rechaza si ya venció', () => {
    expect(canEnter({ ...base, validFrom: '2026-09-01', validTo: '2026-09-10' }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('rechaza si el día de semana no está habilitado', () => {
    // 1 = lunes. Solo martes (2) y jueves (4) habilitados.
    expect(canEnter({ ...base, validTo: '2026-12-31', weekdays: [2, 4] }, lunes15h, 0))
      .toEqual({ ok: false, reason: 'wrong_weekday' })
  })

  it('autoriza si el día de semana sí está habilitado', () => {
    expect(canEnter({ ...base, validTo: '2026-12-31', weekdays: [1, 3] }, lunes15h, 0))
      .toEqual({ ok: true })
  })

  it('rechaza cuando se agotó el cupo', () => {
    expect(canEnter(base, lunes15h, 1)).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('un evento de 30 deja pasar al 30 pero no al 31', () => {
    const evento = { ...base, capacity: 30 }
    expect(canEnter(evento, lunes15h, 29)).toEqual({ ok: true })
    expect(canEnter(evento, lunes15h, 30)).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('el último día vale hasta las 23:59 de Buenos Aires', () => {
    // 2026-09-15T02:00Z = 2026-09-14 23:00 en Buenos Aires: todavía vale.
    expect(canEnter(base, new Date('2026-09-15T02:00:00Z'), 0)).toEqual({ ok: true })
    // 2026-09-15T04:00Z = 2026-09-15 01:00 en Buenos Aires: ya venció.
    expect(canEnter(base, new Date('2026-09-15T04:00:00Z'), 0)).toEqual({ ok: false, reason: 'expired' })
  })

  it('la revocación gana sobre cualquier otro motivo', () => {
    const rota = { ...base, revokedAt: new Date(), validFrom: '2026-01-01', validTo: '2026-01-02' }
    expect(canEnter(rota, lunes15h, 99)).toEqual({ ok: false, reason: 'revoked' })
  })
})
```

Los dos últimos tests son los que valen el ejercicio: cubren el corte de día en zona horaria y el orden de precedencia de los rechazos.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/authz.test.ts`
Expected: FAIL — no existe `src/authz.ts`.

- [ ] **Step 3: Escribir `api/src/authz.ts`**

```ts
import { todayInBuenosAires, weekdayInBuenosAires } from './lib/dates.js'

export type InvitationLike = {
  validFrom: string   // 'YYYY-MM-DD'
  validTo: string     // 'YYYY-MM-DD'
  weekdays: number[] | null
  capacity: number
  revokedAt: Date | null
}

export type EntryCheck =
  | { ok: true }
  | { ok: false; reason: 'revoked' | 'not_yet' | 'expired' | 'wrong_weekday' | 'no_capacity' }

export function canEnter(inv: InvitationLike, now: Date, usedCount: number): EntryCheck {
  if (inv.revokedAt) return { ok: false, reason: 'revoked' }

  // Comparar 'YYYY-MM-DD' como string es correcto: el formato ISO ordena
  // lexicográficamente igual que cronológicamente.
  const today = todayInBuenosAires(now)
  if (today < inv.validFrom) return { ok: false, reason: 'not_yet' }
  if (today > inv.validTo) return { ok: false, reason: 'expired' }

  if (inv.weekdays?.length && !inv.weekdays.includes(weekdayInBuenosAires(now))) {
    return { ok: false, reason: 'wrong_weekday' }
  }

  if (usedCount >= inv.capacity) return { ok: false, reason: 'no_capacity' }

  return { ok: true }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd api && npx vitest run tests/authz.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: canEnter, la logica de autorizacion de ingreso"
```

---

### Task 10: Crear, listar y revocar invitaciones

**Files:**
- Create: `api/src/services/invitations.ts`, `api/src/routes/invitations.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/invitations.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 4), `randomToken` (Task 3), `audit` (Task 5), `unitsOfPerson` (Task 8).
- Produces:
  - `createInvitation(input): Promise<Invitation>` con `input = { unitId, createdBy, kind, guestName, guestDoc?, plate?, validFrom, validTo, weekdays?, capacity }`
  - `listForUnits(unitIds: string[])` → invitaciones con `usedCount` y `creatorName`
  - `revokeInvitation(id, personId, neighborhoodId)`
  - `assertMemberOfUnit(personId, unitId)` — tira `AppError(403)` si no pertenece
  - Rutas: `POST /invitations`, `GET /invitations`, `POST /invitations/:id/revoke`, `GET /invitations/public/:token`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/invitations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function resident(email: string, label: string) {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const barrio = n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
  const [u] = await db.insert(units).values({ neighborhoodId: barrio.id, label }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: barrio.id, email, name: email.split('@')[0], role: 'resident',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  const login = await request(app).post('/auth/login').send({ email, password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, personId: p.id }
}

describe('invitaciones', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea una visita puntual y devuelve el token del QR', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    expect(res.status).toBe(201)
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(res.body.guestName).toBe('Juan Pérez')
  })

  it('no deja crear una invitación para una UF ajena', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const res = await request(app).post('/invitations').set('Cookie', a.cookie).send({
      unitId: b.unitId, kind: 'visita', guestName: 'Colado',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    expect(res.status).toBe(403)
  })

  it('lista las invitaciones de la UF, no solo las propias', async () => {
    const martin = await resident('martin@example.com', 'Lote 142')
    // Segunda persona en la MISMA UF
    const [p2] = await db.insert(people).values({
      neighborhoodId: (await db.select().from(neighborhoods).limit(1))[0].id,
      email: 'ana@example.com', name: 'Ana', role: 'resident',
      status: 'active', passwordHash: await hashPassword(PASS),
    }).returning()
    await db.insert(unitMembers).values({ unitId: martin.unitId, personId: p2.id })
    const loginAna = await request(app).post('/auth/login').send({ email: 'ana@example.com', password: PASS })

    await request(app).post('/invitations').set('Cookie', martin.cookie).send({
      unitId: martin.unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })

    const res = await request(app).get('/invitations').set('Cookie', loginAna.headers['set-cookie'])
    expect(res.body).toHaveLength(1)
    expect(res.body[0].guestName).toBe('Juan Pérez')
    expect(res.body[0].creatorName).toBe('martin')
  })

  it('revoca una invitación', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    const res = await request(app).post(`/invitations/${inv.body.id}/revoke`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const lista = await request(app).get('/invitations').set('Cookie', cookie)
    expect(lista.body[0].revokedAt).not.toBeNull()
  })

  it('la página pública del QR no necesita sesión', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    const res = await request(app).get(`/invitations/public/${inv.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.guestName).toBe('Juan Pérez')
    expect(res.body.unitLabel).toBe('Lote 142')
    // No debe filtrar nada más de la UF ni de las personas.
    expect(res.body.guestDoc).toBeUndefined()
  })

  it('rechaza un evento con cupo menor a 1', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'evento', guestName: 'Cumple de Sofi',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 0,
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/invitations.test.ts`
Expected: FAIL — 404 en `/invitations`.

- [ ] **Step 3: Escribir `api/src/services/invitations.ts`**

```ts
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, people, units, unitMembers } from '../db/schema.js'
import { randomToken } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'

export type CreateInvitationInput = {
  unitId: string
  createdBy: string
  kind: 'visita' | 'frecuente' | 'evento' | 'proveedor'
  guestName: string
  guestDoc?: string
  plate?: string
  validFrom: string
  validTo: string
  weekdays?: number[]
  capacity: number
}

export async function assertMemberOfUnit(personId: string, unitId: string): Promise<void> {
  const [row] = await db.select().from(unitMembers)
    .where(and(eq(unitMembers.personId, personId), eq(unitMembers.unitId, unitId)))
    .limit(1)
  if (!row) throw new AppError(403, 'not_your_unit')
}

export async function createInvitation(input: CreateInvitationInput) {
  await assertMemberOfUnit(input.createdBy, input.unitId)

  const [inv] = await db.insert(invitations).values({
    unitId: input.unitId,
    createdBy: input.createdBy,
    kind: input.kind,
    guestName: input.guestName.trim(),
    guestDoc: input.guestDoc?.trim() || null,
    plate: input.plate?.trim().toUpperCase() || null,
    validFrom: input.validFrom,
    validTo: input.validTo,
    weekdays: input.weekdays?.length ? input.weekdays : null,
    capacity: input.capacity,
    token: randomToken(16),
  }).returning()

  return inv
}

/** Invitaciones de las UF indicadas, con cuántas veces se usó cada una. */
export async function listForUnits(unitIds: string[]) {
  if (!unitIds.length) return []
  return db.select({
    id: invitations.id,
    kind: invitations.kind,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    token: invitations.token,
    revokedAt: invitations.revokedAt,
    createdAt: invitations.createdAt,
    createdBy: invitations.createdBy,
    creatorName: people.name,
    unitId: invitations.unitId,
    unitLabel: units.label,
    usedCount: count(entryLogs.id),
  })
    .from(invitations)
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(units, eq(units.id, invitations.unitId))
    .leftJoin(entryLogs, eq(entryLogs.invitationId, invitations.id))
    .where(inArray(invitations.unitId, unitIds))
    .groupBy(invitations.id, people.name, units.label)
    .orderBy(desc(invitations.createdAt))
}

export async function revokeInvitation(id: string, personId: string, neighborhoodId: string) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)

  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id))
  await audit(personId, neighborhoodId, 'invitation.revoked', 'invitation', id)
}

/** Datos públicos del QR. Devuelve lo mínimo: nada de DNI ni de personas. */
export async function findPublicByToken(token: string) {
  const [row] = await db.select({
    guestName: invitations.guestName,
    kind: invitations.kind,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    revokedAt: invitations.revokedAt,
    unitLabel: units.label,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(eq(invitations.token, token))
    .limit(1)
  return row ?? null
}
```

- [ ] **Step 4: Escribir `api/src/routes/invitations.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { createInvitation, listForUnits, revokeInvitation, findPublicByToken } from '../services/invitations.js'
import { unitsOfPerson } from '../services/units.js'
import { AppError } from '../lib/errors.js'

export const invitationRoutes = Router()

// Pública: sin requireAuth, va antes del router protegido.
invitationRoutes.get('/public/:token', async (req, res) => {
  const row = await findPublicByToken(req.params.token)
  if (!row) throw new AppError(404, 'not_found')
  res.json(row)
})

invitationRoutes.use(requireAuth)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')

const createSchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(['visita', 'frecuente', 'evento', 'proveedor']),
  guestName: z.string().min(1),
  guestDoc: z.string().optional(),
  plate: z.string().optional(),
  validFrom: isoDate,
  validTo: isoDate,
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  capacity: z.number().int().min(1),
}).refine((v) => v.validTo >= v.validFrom, { message: 'La ventana está invertida', path: ['validTo'] })

invitationRoutes.post('/', async (req, res) => {
  const body = createSchema.parse(req.body)
  const inv = await createInvitation({ ...body, createdBy: req.person!.id })
  res.status(201).json(inv)
})

invitationRoutes.get('/', async (req, res) => {
  const units = await unitsOfPerson(req.person!.id)
  res.json(await listForUnits(units.map((u) => u.id)))
})

invitationRoutes.post('/:id/revoke', async (req, res) => {
  await revokeInvitation(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})
```

- [ ] **Step 5: Montar en `api/src/app.ts`**

```ts
import { invitationRoutes } from './routes/invitations.js'
  app.use('/invitations', invitationRoutes)
```

- [ ] **Step 6: Correr los tests**

Run: `cd api && npx vitest run tests/invitations.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: crear, listar y revocar invitaciones"
```

---

### Task 11: Garita — validar y registrar el ingreso

**Files:**
- Create: `api/src/services/entries.ts`, `api/src/routes/gate.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/gate.test.ts`

**Interfaces:**
- Consumes: `canEnter` (Task 9), `requireRole` (Task 4).
- Produces:
  - `checkByToken(token)` → `{ invitation, check: EntryCheck, usedCount, lastEntryAt }`
  - `searchGuests(neighborhoodId, query)` → invitaciones vigentes que matchean nombre, UF o patente
  - `registerEntry(invitationId, guardId, data)` — **transaccional**, revalida el cupo
  - Rutas: `GET /gate/check/:token`, `GET /gate/search?q=`, `POST /gate/entries`, `GET /gate/guards`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/gate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function scenario(capacity = 1) {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })

  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const [inv] = await db.insert(invitations).values({
    unitId: u.id, createdBy: vecino.id, kind: capacity > 1 ? 'evento' : 'visita',
    guestName: 'Juan Pérez', validFrom: hoy, validTo: hoy, capacity, token: randomToken(16),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], inv, guardia, unit: u }
}

describe('garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('autoriza un QR vigente', async () => {
    const { cookie, inv } = await scenario()
    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.check).toEqual({ ok: true })
    expect(res.body.invitation.guestName).toBe('Juan Pérez')
    expect(res.body.invitation.unitLabel).toBe('Lote 142')
  })

  it('un vecino logueado no puede usar la pantalla de garita', async () => {
    const { inv } = await scenario()
    // Le damos contraseña a Martín para que SÍ pueda loguear: así el 403 que
    // esperamos viene del rol, no de un login fallido.
    const { eq } = await import('drizzle-orm')
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(login.status).toBe(200)

    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })

  it('registra el ingreso y deja la invitación sin cupo', async () => {
    const { cookie, inv, guardia } = await scenario()
    const post = await request(app).post('/gate/entries').set('Cookie', cookie).send({
      invitationId: inv.id, guardId: guardia.id, guestName: 'Juan Pérez', guestDoc: '30123456',
    })
    expect(post.status).toBe(201)

    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', cookie)
    expect(res.body.check).toEqual({ ok: false, reason: 'no_capacity' })
    expect(res.body.lastEntryAt).not.toBeNull()
  })

  it('dos guardias registrando a la vez no se pasan del cupo', async () => {
    const { inv, guardia } = await scenario(1)
    const data = { guestName: 'Juan Pérez' }
    const resultados = await Promise.allSettled([
      registerEntry(inv.id, guardia.id, data),
      registerEntry(inv.id, guardia.id, data),
    ])
    const ok = resultados.filter((r) => r.status === 'fulfilled')
    const fallidos = resultados.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(fallidos).toHaveLength(1)
  })

  it('un evento de 2 deja entrar a dos y rechaza al tercero', async () => {
    const { inv, guardia } = await scenario(2)
    await registerEntry(inv.id, guardia.id, { guestName: 'Uno' })
    await registerEntry(inv.id, guardia.id, { guestName: 'Dos' })
    await expect(registerEntry(inv.id, guardia.id, { guestName: 'Tres' })).rejects.toThrow()
  })

  it('la búsqueda manual encuentra por apellido y por UF', async () => {
    const { cookie } = await scenario()
    const porNombre = await request(app).get('/gate/search?q=Pérez').set('Cookie', cookie)
    expect(porNombre.body).toHaveLength(1)

    const porUnidad = await request(app).get('/gate/search?q=142').set('Cookie', cookie)
    expect(porUnidad.body).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/gate.test.ts`
Expected: FAIL — no existe `services/entries.js`.

- [ ] **Step 3: Escribir `api/src/services/entries.ts`**

```ts
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, units, people } from '../db/schema.js'
import { canEnter, type EntryCheck } from '../authz.js'
import { todayInBuenosAires } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'

async function loadForCheck(where: ReturnType<typeof eq>) {
  const [row] = await db.select({
    id: invitations.id,
    kind: invitations.kind,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    revokedAt: invitations.revokedAt,
    unitId: invitations.unitId,
    unitLabel: units.label,
  }).from(invitations).innerJoin(units, eq(units.id, invitations.unitId)).where(where).limit(1)
  return row ?? null
}

async function usageOf(invitationId: string) {
  const [row] = await db.select({
    used: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${entryLogs.enteredAt})`,
  }).from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return { usedCount: row?.used ?? 0, lastEntryAt: row?.last ?? null }
}

export async function checkByToken(token: string) {
  const invitation = await loadForCheck(eq(invitations.token, token))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

export async function checkById(id: string) {
  const invitation = await loadForCheck(eq(invitations.id, id))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

async function buildCheck(invitation: NonNullable<Awaited<ReturnType<typeof loadForCheck>>>) {
  const { usedCount, lastEntryAt } = await usageOf(invitation.id)
  const check: EntryCheck = canEnter(invitation, new Date(), usedCount)
  return { invitation, check, usedCount, lastEntryAt }
}

/**
 * Registra el ingreso revalidando el cupo DENTRO de la transacción.
 * El SELECT … FOR UPDATE sobre la invitación serializa a dos guardias
 * escaneando el mismo QR al mismo tiempo.
 */
export async function registerEntry(
  invitationId: string,
  guardId: string | null,
  data: { guestName: string; guestDoc?: string; plate?: string; note?: string },
) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations)
      .where(eq(invitations.id, invitationId)).for('update').limit(1)
    if (!inv) throw new AppError(404, 'not_found')

    const [{ used }] = await tx.select({ used: sql<number>`count(*)::int` })
      .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))

    const check = canEnter(inv, new Date(), used)
    if (!check.ok) throw new AppError(409, check.reason)

    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: inv.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: data.guestDoc?.trim() || null,
      plate: data.plate?.trim().toUpperCase() || null,
      note: data.note?.trim() || null,
    }).returning()

    return entry
  })
}

/** Invitaciones todavía vigentes que matchean nombre, etiqueta de UF o patente. */
export async function searchGuests(neighborhoodId: string, query: string) {
  const q = `%${query.trim()}%`
  const hoy = todayInBuenosAires()

  return db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    kind: invitations.kind,
    plate: invitations.plate,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    unitLabel: units.label,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      gte(invitations.validTo, hoy),
      or(ilike(invitations.guestName, q), ilike(units.label, q), ilike(invitations.plate, q)),
    ))
    .orderBy(desc(invitations.createdAt))
    .limit(20)
}

export async function listGuards(neighborhoodId: string) {
  return db.select({ id: people.id, name: people.name }).from(people)
    .where(and(eq(people.neighborhoodId, neighborhoodId), eq(people.role, 'guard'), eq(people.status, 'active')))
    .orderBy(people.name)
}
```

- [ ] **Step 4: Escribir `api/src/routes/gate.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { checkByToken, checkById, registerEntry, searchGuests, listGuards } from '../services/entries.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))

gateRoutes.get('/check/:token', async (req, res) => {
  res.json(await checkByToken(req.params.token))
})

gateRoutes.get('/invitation/:id', async (req, res) => {
  res.json(await checkById(req.params.id))
})

gateRoutes.get('/search', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchGuests(req.person!.neighborhoodId, q))
})

gateRoutes.get('/guards', async (req, res) => {
  res.json(await listGuards(req.person!.neighborhoodId))
})

gateRoutes.post('/entries', async (req, res) => {
  const body = z.object({
    invitationId: z.string().uuid(),
    guardId: z.string().uuid().nullable().optional(),
    guestName: z.string().min(1),
    guestDoc: z.string().optional(),
    plate: z.string().optional(),
    note: z.string().optional(),
  }).parse(req.body)

  const entry = await registerEntry(body.invitationId, body.guardId ?? null, body)
  res.status(201).json(entry)
})
```

- [ ] **Step 5: Montar en `api/src/app.ts`**

```ts
import { gateRoutes } from './routes/gate.js'
  app.use('/gate', gateRoutes)
```

- [ ] **Step 6: Correr los tests**

Run: `cd api && npx vitest run tests/gate.test.ts`
Expected: PASS (6 tests). El test de concurrencia es el importante: si falla, el `for('update')` no está puesto.

- [ ] **Step 7: Correr toda la suite**

Run: `cd api && npx vitest run`
Expected: PASS, todos los archivos.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: validacion de QR, busqueda manual y registro de ingreso transaccional"
```

---

### Task 12: Reportes y bitácora

**Files:**
- Create: `api/src/services/reports.ts`, `api/src/routes/reports.ts`
- Modify: `api/src/app.ts`
- Test: `api/tests/reports.test.ts`

**Interfaces:**
- Consumes: `requireRole('admin')`.
- Produces:
  - `dashboardKpis(neighborhoodId)` → `{ entriesToday, entriesWeek, entriesMonth, activeInvitations, enabledResidents, activeResidents30d, unitsWithoutResidents }`
  - `entriesByDay(neighborhoodId, days)`, `entriesByHour(neighborhoodId)`
  - `invitationsByPerson(neighborhoodId)`, `activityByGuard(neighborhoodId)`
  - `entriesLog(neighborhoodId, filters)` con `{ from?, to?, unitId?, guardId? }`
  - Rutas `GET /reports/*`, más `GET /reports/entries.csv`

- [ ] **Step 1: Escribir el test que falla**

`api/tests/reports.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function scenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [conVecino] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 7' }) // UF sin vecinos
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: conVecino.id, personId: vecino.id })

  const [admin] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'admin@example.com', name: 'Admin', role: 'admin',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const [inv] = await db.insert(invitations).values({
    unitId: conVecino.id, createdBy: vecino.id, kind: 'visita', guestName: 'Juan Pérez',
    validFrom: hoy, validTo: hoy, capacity: 5, token: randomToken(16),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], inv, admin }
}

describe('reportes', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('los KPIs cuentan ingresos de hoy y UF sin vecinos', async () => {
    const { cookie, inv, admin } = await scenario()
    await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })
    await registerEntry(inv.id, admin.id, { guestName: 'Otro' })

    const res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.entriesToday).toBe(2)
    expect(res.body.unitsWithoutResidents).toBe(1)
    expect(res.body.enabledResidents).toBe(1)
  })

  it('invitaciones por persona', async () => {
    const { cookie } = await scenario()
    const res = await request(app).get('/reports/invitations-by-person').set('Cookie', cookie)
    expect(res.body[0]).toMatchObject({ name: 'Martín', total: 1 })
  })

  it('la bitácora lista los ingresos con la UF', async () => {
    const { cookie, inv, admin } = await scenario()
    await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez', guestDoc: '30123456' })

    const res = await request(app).get('/reports/entries').set('Cookie', cookie)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].unitLabel).toBe('Lote 142')
    expect(res.body[0].guestDoc).toBe('30123456')
  })

  it('exporta la bitácora a CSV', async () => {
    const { cookie, inv, admin } = await scenario()
    await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })

    const res = await request(app).get('/reports/entries.csv').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.text.split('\n')[0]).toBe('fecha,hora,invitado,documento,patente,unidad,guardia')
    expect(res.text).toContain('Juan Pérez')
  })

  it('un vecino no puede ver los reportes', async () => {
    await scenario()
    const { people: p } = await import('../src/db/schema.js')
    const { eq } = await import('drizzle-orm')
    await db.update(p).set({ passwordHash: await hashPassword(PASS) }).where(eq(p.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/reports/kpis').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/reports.test.ts`
Expected: FAIL — 404 en `/reports/kpis`.

- [ ] **Step 3: Escribir `api/src/services/reports.ts`**

```ts
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { TZ } from '../lib/dates.js'

/**
 * Todos los cortes por día usan `at time zone` de Postgres con la zona de
 * Buenos Aires. Nunca `new Date().getDate()`: el contenedor corre en UTC y
 * "hoy" empezaría a las 21 del día anterior.
 */
export async function dashboardKpis(neighborhoodId: string) {
  // Ojo: con el driver node-postgres, `db.execute` devuelve el Result de pg,
  // no un array. Hay que sacar `.rows`, no destructurar el resultado.
  const { rows } = await db.execute(sql`
    with local as (select (now() at time zone ${TZ})::date as today)
    select
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date = local.today)::int as "entriesToday",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date > local.today - 7)::int as "entriesWeek",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date > local.today - 30)::int as "entriesMonth",
      (select count(*) from invitation i join unit u on u.id = i.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and i.revoked_at is null and i.valid_to >= local.today)::int as "activeInvitations",
      (select count(*) from person
        where neighborhood_id = ${neighborhoodId} and role = 'resident' and status = 'active')::int
        as "enabledResidents",
      (select count(distinct p.id) from person p, local
        where p.neighborhood_id = ${neighborhoodId} and p.role = 'resident'
          and (p.last_login_at at time zone ${TZ})::date > local.today - 30)::int as "activeResidents30d",
      (select count(*) from unit u
        where u.neighborhood_id = ${neighborhoodId}
          and not exists (select 1 from unit_member m where m.unit_id = u.id))::int
        as "unitsWithoutResidents"
  `)
  return rows[0] as unknown as Record<string, number>
}

export async function entriesByDay(neighborhoodId: string, days = 30) {
  const res = await db.execute(sql`
    select (e.entered_at at time zone ${TZ})::date as day, count(*)::int as total
    from entry_log e join unit u on u.id = e.unit_id
    where u.neighborhood_id = ${neighborhoodId}
      and e.entered_at > now() - (${days} || ' days')::interval
    group by day order by day
  `)
  return res.rows
}

export async function entriesByHour(neighborhoodId: string) {
  const res = await db.execute(sql`
    select extract(hour from e.entered_at at time zone ${TZ})::int as hour, count(*)::int as total
    from entry_log e join unit u on u.id = e.unit_id
    where u.neighborhood_id = ${neighborhoodId}
    group by hour order by hour
  `)
  return res.rows
}

export async function invitationsByPerson(neighborhoodId: string) {
  const res = await db.execute(sql`
    select p.id, p.name, u.label as "unitLabel", count(i.id)::int as total
    from invitation i
    join person p on p.id = i.created_by
    join unit u on u.id = i.unit_id
    where u.neighborhood_id = ${neighborhoodId}
    group by p.id, p.name, u.label
    order by total desc, p.name
  `)
  return res.rows
}

export async function activityByGuard(neighborhoodId: string) {
  const res = await db.execute(sql`
    select g.id, g.name, count(e.id)::int as total, max(e.entered_at) as "lastAt"
    from entry_log e
    join unit u on u.id = e.unit_id
    left join person g on g.id = e.guard_id
    where u.neighborhood_id = ${neighborhoodId}
    group by g.id, g.name
    order by total desc
  `)
  return res.rows
}

export type EntryFilters = { from?: string; to?: string; unitId?: string; guardId?: string }

export async function entriesLog(neighborhoodId: string, f: EntryFilters) {
  const res = await db.execute(sql`
    select e.id, e.entered_at as "enteredAt", e.guest_name as "guestName",
           e.guest_doc as "guestDoc", e.plate, u.label as "unitLabel", g.name as "guardName"
    from entry_log e
    join unit u on u.id = e.unit_id
    left join person g on g.id = e.guard_id
    where u.neighborhood_id = ${neighborhoodId}
      and (${f.from ?? null}::date is null or (e.entered_at at time zone ${TZ})::date >= ${f.from ?? null}::date)
      and (${f.to ?? null}::date is null or (e.entered_at at time zone ${TZ})::date <= ${f.to ?? null}::date)
      and (${f.unitId ?? null}::uuid is null or e.unit_id = ${f.unitId ?? null}::uuid)
      and (${f.guardId ?? null}::uuid is null or e.guard_id = ${f.guardId ?? null}::uuid)
    order by e.entered_at desc
    limit 1000
  `)
  return res.rows as unknown as Array<Record<string, unknown>>
}
```

- [ ] **Step 4: Escribir `api/src/routes/reports.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  dashboardKpis, entriesByDay, entriesByHour, invitationsByPerson, activityByGuard, entriesLog,
} from '../services/reports.js'
import { TZ } from '../lib/dates.js'

export const reportRoutes = Router()
reportRoutes.use(requireAuth, requireRole('admin'))

const filterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitId: z.string().uuid().optional(),
  guardId: z.string().uuid().optional(),
})

reportRoutes.get('/kpis', async (req, res) => res.json(await dashboardKpis(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-day', async (req, res) => res.json(await entriesByDay(req.person!.neighborhoodId)))
reportRoutes.get('/entries-by-hour', async (req, res) => res.json(await entriesByHour(req.person!.neighborhoodId)))
reportRoutes.get('/invitations-by-person', async (req, res) =>
  res.json(await invitationsByPerson(req.person!.neighborhoodId)))
reportRoutes.get('/activity-by-guard', async (req, res) =>
  res.json(await activityByGuard(req.person!.neighborhoodId)))

reportRoutes.get('/entries', async (req, res) => {
  res.json(await entriesLog(req.person!.neighborhoodId, filterSchema.parse(req.query)))
})

/** Escapa un valor para CSV: comillas dobles duplicadas y campo entre comillas. */
function csv(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

reportRoutes.get('/entries.csv', async (req, res) => {
  const rows = await entriesLog(req.person!.neighborhoodId, filterSchema.parse(req.query))
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const lines = ['fecha,hora,invitado,documento,patente,unidad,guardia']
  for (const r of rows) {
    const [fecha, hora] = fmt.format(new Date(r.enteredAt as string)).split(', ')
    lines.push([fecha, hora, r.guestName, r.guestDoc, r.plate, r.unitLabel, r.guardName].map(csv).join(','))
  }

  res.type('text/csv').attachment('ingresos.csv').send(lines.join('\n'))
})
```

- [ ] **Step 5: Montar en `api/src/app.ts`**

```ts
import { reportRoutes } from './routes/reports.js'
  app.use('/reports', reportRoutes)
```

- [ ] **Step 6: Correr los tests**

Run: `cd api && npx vitest run tests/reports.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: dashboard, bitacora y export CSV"
```

---

## FASE E — Front

### Task 13: Scaffold del front y pantallas de acceso

**Files:**
- Create: `web/` (via `create-next-app`), `web/src/lib/api.ts`, `web/src/app/login/page.tsx`, `web/src/app/acceso/page.tsx`, `web/src/app/reset/page.tsx`, `web/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `POST /auth/login`, `GET /auth/invite/:token`, `POST /auth/invite`, `POST /auth/forgot`, `GET /auth/reset/:token`, `POST /auth/reset`, `GET /auth/me`.
- Produces: `api<T>(path, init?)` desde `web/src/lib/api.ts`; las tres pantallas de acceso.

- [ ] **Step 1: Crear el proyecto**

```bash
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --no-import-alias
cd web && npx shadcn@latest init
npx shadcn@latest add button input label card sonner
npm i qrcode.react html5-qrcode
```

- [ ] **Step 2: Escribir `web/src/lib/api.ts`**

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',                       // sin esto la cookie de sesión no viaja
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }))
    throw new ApiError(res.status, body.error ?? 'unknown')
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
```

- [ ] **Step 3: Escribir `web/src/app/login/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      router.push('/')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? 'Demasiados intentos. Probá de nuevo en 15 minutos.'
        : 'Mail o contraseña incorrectos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Invitaciones</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" required value={password}
                 onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
      <a href="/olvide" className="text-sm text-muted-foreground underline">Olvidé mi contraseña</a>
    </main>
  )
}
```

- [ ] **Step 4: Escribir `web/src/app/acceso/page.tsx`**

Esta pantalla implementa la regla crítica del spec: el **GET** solo mira el token, el **POST** lo consume.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AccesoPage() {
  const router = useRouter()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // GET: solo mira. Si un escáner de mail pasa por acá, no rompe nada.
  useEffect(() => {
    if (!token) { setInvalid(true); return }
    api<{ name: string }>(`/auth/invite/${token}`)
      .then((r) => setName(r.name))
      .catch(() => setInvalid(true))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    try {
      await api('/auth/invite', { method: 'POST', body: JSON.stringify({ token, password }) })
      router.push('/')
    } catch {
      setError('El link ya fue usado o venció. Pedile a la administración que te lo reenvíe.')
    }
  }

  if (invalid) {
    return <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Link inválido o vencido</h1>
      <p className="mt-2 text-muted-foreground">Pedile a la administración que te reenvíe la invitación.</p>
    </main>
  }

  if (!name) return <main className="p-6">Cargando…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola {name}</h1>
        <p className="text-muted-foreground">Elegí una contraseña para entrar la próxima vez.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pw">Contraseña (mínimo 10 caracteres)</Label>
          <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">Entrar</Button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Escribir `web/src/app/olvide/page.tsx` y `web/src/app/reset/page.tsx`**

`olvide/page.tsx`: un input de mail que hace `POST /auth/forgot` y **siempre** muestra "Si el mail está registrado, te mandamos un link", sin importar la respuesta.

```tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function OlvidePage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
    setSent(true)   // mismo mensaje pase lo que pase: no se filtra si el mail existe
  }

  if (sent) return <main className="mx-auto max-w-sm p-6">
    <p>Si el mail está registrado, te mandamos un link para restablecer la contraseña.</p>
  </main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Restablecer contraseña</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input type="email" required placeholder="tu@mail.com" value={email}
               onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Enviar link</Button>
      </form>
    </main>
  )
}
```

`reset/page.tsx`: igual que `acceso/page.tsx` pero pegándole a `/auth/reset/:token` (GET) y `/auth/reset` (POST). Copiar la estructura de acceso cambiando esas dos rutas y el texto del encabezado por "Elegí tu nueva contraseña".

- [ ] **Step 6: Agregar `web` al `docker-compose.yml`**

```yaml
  web:
    build: ./web
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ['3000:3000']
    depends_on: [api]
```

Y `web/Dockerfile`:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Agregar `output: 'standalone'` no es necesario con este Dockerfile; se puede optimizar después si la imagen molesta.

- [ ] **Step 7: Verificar a mano el flujo completo**

```bash
docker compose up -d --build
cd api && npm run seed:admin -- --email=vos@mail.com --barrio="Los Robles"
```

Copiar el link que imprime la consola, abrirlo en el navegador, crear la contraseña, y confirmar que cae en `/`. Después cerrar sesión y entrar de nuevo con mail y contraseña.

Expected: entra las dos veces; la segunda sin tocar el mail.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: front con pantallas de acceso, login y reset"
```

---

### Task 14: Pantallas del vecino

**Files:**
- Create: `web/src/app/page.tsx`, `web/src/app/nueva/page.tsx`, `web/src/app/historial/page.tsx`, `web/src/app/i/[token]/page.tsx`, `web/src/components/invitation-form.tsx`, `web/src/components/qr-share.tsx`
- Test: verificación manual (UI).

**Interfaces:**
- Consumes: `GET /invitations`, `POST /invitations`, `POST /invitations/:id/revoke`, `GET /invitations/public/:token`, `GET /auth/me`.
- Produces: las cuatro pantallas del vecino.

- [ ] **Step 1: Escribir `web/src/components/invitation-form.tsx`**

Un único formulario. Los cuatro `kind` solo cambian qué campos se muestran; la lógica es la misma.

```tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

const KINDS = [
  { id: 'visita', label: 'Visita' },
  { id: 'frecuente', label: 'Frecuente' },
  { id: 'evento', label: 'Evento' },
  { id: 'proveedor', label: 'Proveedor' },
] as const

type Kind = typeof KINDS[number]['id']

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function InvitationForm({ units, onCreated }: {
  units: { id: string; label: string }[]
  onCreated: (inv: { id: string; token: string; guestName: string }) => void
}) {
  const hoy = hoyISO()
  const [kind, setKind] = useState<Kind>('visita')
  const [unitId, setUnitId] = useState(units[0]?.id ?? '')
  const [guestName, setGuestName] = useState('')
  const [guestDoc, setGuestDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [validFrom, setValidFrom] = useState(hoy)
  const [validTo, setValidTo] = useState(hoy)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [capacity, setCapacity] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const inv = await api<{ id: string; token: string; guestName: string }>('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          unitId, kind, guestName,
          guestDoc: guestDoc || undefined,
          plate: plate || undefined,
          validFrom,
          validTo: kind === 'visita' || kind === 'proveedor' ? validFrom : validTo,
          weekdays: kind === 'frecuente' && weekdays.length ? weekdays : undefined,
          capacity: kind === 'evento' ? capacity : (kind === 'frecuente' ? 999 : 1),
        }),
      })
      onCreated(inv)
    } catch {
      setError('No se pudo crear la invitación. Revisá los datos.')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id)}
            className={`rounded-full border px-4 py-2 text-sm ${kind === k.id ? 'bg-foreground text-background' : ''}`}>
            {k.label}
          </button>
        ))}
      </div>

      {/* El selector de UF solo aparece si la persona tiene más de una. */}
      {units.length > 1 && (
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="rounded border p-2">
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
      )}

      <input required placeholder={kind === 'evento' ? 'Nombre del evento' : 'Nombre del invitado'}
             value={guestName} onChange={(e) => setGuestName(e.target.value)} className="rounded border p-2" />

      <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
             className="rounded border p-2" />

      {kind === 'frecuente' && (
        <>
          <label className="text-sm">Hasta</label>
          <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)}
                 className="rounded border p-2" />
          <div className="flex gap-1">
            {DIAS.map((d, i) => (
              <button key={d} type="button"
                onClick={() => setWeekdays((w) => w.includes(i) ? w.filter((x) => x !== i) : [...w, i])}
                className={`flex-1 rounded border py-1 text-xs ${weekdays.includes(i) ? 'bg-foreground text-background' : ''}`}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Sin días seleccionados = todos los días.</p>
        </>
      )}

      {kind === 'evento' && (
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}
               className="rounded border p-2" placeholder="Cantidad de invitados" />
      )}

      <input placeholder="DNI (opcional)" value={guestDoc} onChange={(e) => setGuestDoc(e.target.value)}
             className="rounded border p-2" />
      <input placeholder="Patente (opcional)" value={plate} onChange={(e) => setPlate(e.target.value)}
             className="rounded border p-2" />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-foreground p-3 text-background">Crear invitación</button>
    </form>
  )
}
```

- [ ] **Step 2: Escribir `web/src/components/qr-share.tsx`**

```tsx
'use client'
import { QRCodeCanvas } from 'qrcode.react'

export function QrShare({ token, guestName }: { token: string; guestName: string }) {
  const url = `${window.location.origin}/i/${token}`
  const text = `Hola ${guestName}, te dejo el acceso al barrio: ${url}`

  async function share() {
    // Web Share API nativa: abre el selector del sistema (WhatsApp incluido).
    // No hay integración con la API de Meta ni librería de por medio.
    if (navigator.share) {
      await navigator.share({ title: 'Invitación', text, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(text)
      alert('Link copiado')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <QRCodeCanvas value={url} size={240} />
      <button onClick={share} className="w-full rounded bg-foreground p-3 text-background">
        Compartir
      </button>
      <button onClick={() => navigator.clipboard.writeText(url)}
              className="w-full rounded border p-3">Copiar link</button>
    </div>
  )
}
```

- [ ] **Step 3: Escribir `web/src/app/page.tsx` (home del vecino)**

Carga `GET /auth/me` y `GET /invitations`. Si `/auth/me` da 401, redirige a `/login`. Muestra las invitaciones **vigentes** (las que no están revocadas y cuyo `validTo >= hoy`), cada una con nombre, tipo, vigencia, `usedCount`/`capacity`, quién la creó, y botones de **Ver QR** y **Revocar**. Arriba, el nombre de la persona y sus UF. Abajo, un botón grande **+ Nueva invitación** que va a `/nueva`. Si no hay ninguna, el estado vacío dice "Todavía no tenés invitaciones".

- [ ] **Step 4: Escribir `web/src/app/nueva/page.tsx`**

Carga las UF de la persona desde `GET /auth/me` + `GET /invitations` (las UF salen del listado; si está vacío, agregar `GET /auth/me` con las UF incluidas — ver nota abajo). Renderiza `<InvitationForm>` y, al recibir `onCreated`, cambia a `<QrShare>` con el token devuelto.

**Nota para el implementador:** `GET /auth/me` hoy devuelve solo `AuthedPerson`. Agregar las UF ahí es una línea en `api/src/routes/auth.ts`:

```ts
import { unitsOfPerson } from '../services/units.js'

authRoutes.get('/me', requireAuth, async (req, res) => {
  res.json({ ...req.person, units: await unitsOfPerson(req.person!.id) })
})
```

Actualizar el test `/auth/me` de `api/tests/login.test.ts` para que también verifique `expect(res.body.units).toEqual([])`.

- [ ] **Step 5: Escribir `web/src/app/historial/page.tsx`**

Lista **todas** las invitaciones de las UF (el endpoint ya devuelve todas, no solo las vigentes), ordenadas por fecha descendente. Cada fila: invitado, fecha, `usedCount` ingresos, quién la creó. Un toggle **Solo las mías** que filtra por `createdBy === me.id` en el cliente. Botón **Volver a invitar** que navega a `/nueva?guestName=…&guestDoc=…&plate=…&kind=…` y precarga el formulario desde los query params.

- [ ] **Step 6: Escribir `web/src/app/i/[token]/page.tsx` (página pública)**

Server Component que hace `fetch` a `GET /invitations/public/:token` y muestra el QR en grande, el nombre del invitado, la UF y la vigencia. **Sin sesión, sin datos sensibles.** Si el token no existe, 404.

- [ ] **Step 7: Verificar a mano**

Entrar como vecino, crear una visita para hoy, compartir el link, abrirlo en otra pestaña y confirmar que muestra el QR sin pedir login.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: pantallas del vecino con QR y compartir"
```

---

### Task 15: Pantalla de garita y panel de admin

**Files:**
- Create: `web/src/app/garita/page.tsx`, `web/src/app/admin/page.tsx`, `web/src/app/admin/unidades/page.tsx`, `web/src/app/admin/usuarios/page.tsx`, `web/src/app/admin/guardias/page.tsx`, `web/src/app/admin/bitacora/page.tsx`
- Test: verificación manual.

**Interfaces:**
- Consumes: todo `/gate/*`, `/admin/*` y `/reports/*`.

- [ ] **Step 1: Escribir `web/src/app/garita/page.tsx`**

Una sola vista horizontal, en dos columnas.

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { api } from '@/lib/api'

type Check = { ok: true } | { ok: false; reason: string }
type Result = {
  invitation: { id: string; guestName: string; guestDoc: string | null; plate: string | null
                kind: string; validFrom: string; validTo: string; unitLabel: string; capacity: number }
  check: Check
  usedCount: number
  lastEntryAt: string | null
}

const MOTIVOS: Record<string, string> = {
  revoked: 'Invitación revocada',
  not_yet: 'Todavía no está vigente',
  expired: 'Invitación vencida',
  wrong_weekday: 'No está habilitado para hoy',
  no_capacity: 'Cupo agotado',
}

export default function GaritaPage() {
  const [result, setResult] = useState<Result | null>(null)
  const [guards, setGuards] = useState<{ id: string; name: string }[]>([])
  const [guardId, setGuardId] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ id: string; guestName: string; unitLabel: string }[]>([])
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => { api<typeof guards>('/gate/guards').then(setGuards) }, [])

  // El escáner corre permanentemente. Al detectar un QR, consulta y muestra.
  useEffect(() => {
    const scanner = new Html5Qrcode('reader')
    scannerRef.current = scanner
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, async (text) => {
      const token = text.split('/i/')[1] ?? text
      const r = await api<Result>(`/gate/check/${token}`).catch(() => null)
      if (r) { setResult(r); setDoc(r.invitation.guestDoc ?? ''); setPlate(r.invitation.plate ?? '') }
    }, () => {})
    return () => { scanner.stop().catch(() => {}) }
  }, [])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setHits(await api(`/gate/search?q=${encodeURIComponent(query)}`))
  }

  // La búsqueda manual cae exactamente en el mismo resultado que el QR.
  async function abrir(id: string) {
    const r = await api<Result>(`/gate/invitation/${id}`)
    setResult(r); setDoc(r.invitation.guestDoc ?? ''); setPlate(r.invitation.plate ?? '')
    setHits([])
  }

  async function registrar() {
    if (!result) return
    await api('/gate/entries', {
      method: 'POST',
      body: JSON.stringify({
        invitationId: result.invitation.id,
        guardId: guardId || null,
        guestName: result.invitation.guestName,
        guestDoc: doc || undefined,
        plate: plate || undefined,
      }),
    })
    setResult(null); setDoc(''); setPlate('')
  }

  return (
    <main className="grid h-dvh grid-cols-2 gap-4 p-4">
      <div className="flex flex-col gap-4">
        <select value={guardId} onChange={(e) => setGuardId(e.target.value)} className="rounded border p-2">
          <option value="">Guardia de turno…</option>
          {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div id="reader" className="aspect-square w-full rounded border" />
        <form onSubmit={buscar} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded border p-2"
                 placeholder="Apellido, UF o patente" />
          <button className="rounded border px-4">Buscar</button>
        </form>
        <ul>
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => abrir(h.id)} className="w-full rounded p-2 text-left hover:bg-muted">
                {h.guestName} · {h.unitLabel}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col justify-center">
        {!result && <p className="text-center text-muted-foreground">Escaneá un QR o buscá por apellido</p>}
        {result && (
          <div className={`rounded-lg p-6 ${result.check.ok ? 'bg-green-100' : 'bg-red-100'}`}>
            <p className="text-3xl font-bold">
              {result.check.ok ? '✓ AUTORIZADO' : `✗ ${MOTIVOS[result.check.reason] ?? 'Rechazado'}`}
            </p>
            <p className="mt-2 text-xl">{result.invitation.guestName}</p>
            <p className="text-muted-foreground">
              {result.invitation.unitLabel} · {result.invitation.kind}
              {result.invitation.capacity > 1 && ` · ${result.usedCount} de ${result.invitation.capacity} ingresaron`}
            </p>

            {result.check.ok && (
              <div className="mt-4 flex flex-col gap-2">
                <input value={doc} onChange={(e) => setDoc(e.target.value)}
                       className="rounded border p-2" placeholder="DNI" />
                <input value={plate} onChange={(e) => setPlate(e.target.value)}
                       className="rounded border p-2" placeholder="Patente" />
                <button onClick={registrar} className="rounded bg-foreground p-4 text-lg text-background">
                  Registrar ingreso
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Escribir las pantallas de admin**

- `admin/unidades/page.tsx` — tabla de UF (`GET /admin/units`) + formulario de alta (`POST /admin/units`).
- `admin/usuarios/page.tsx` — tabla de `GET /admin/people` con nombre, mail, rol, UF, estado y `lastLoginAt`. Formulario de alta con mail, nombre, rol y UF (multi-selección). Por fila: **Reenviar invitación** (`POST /admin/people/:id/resend`) y **Deshabilitar** (`POST /admin/people/:id/disable`). Las filas con `status = 'invited'` se muestran atenuadas con la etiqueta "Invitado, todavía no entró".
- `admin/guardias/page.tsx` — filtra `role = 'guard'` del mismo listado. Alta con rol fijo `guard` + un campo de contraseña que pega a `POST /admin/people/:id/password`. Por fila, **Resetear clave**.
- `admin/bitacora/page.tsx` — tabla de `GET /reports/entries` con filtros de fecha, UF y guardia. Botón **Exportar CSV** que abre `GET /reports/entries.csv` con los mismos query params.
- `admin/page.tsx` — dashboard: los siete KPIs de `GET /reports/kpis` como tarjetas; `entries-by-day` y `entries-by-hour` como gráficos de barras (SVG a mano o Recharts si se prefiere); `invitations-by-person` y `activity-by-guard` como tablas.

**El KPI que más importa es `unitsWithoutResidents`**: es el agujero del padrón y el número más accionable del tablero. Mostralo destacado, no perdido entre los otros seis.

- [ ] **Step 3: Verificar el flujo completo a mano**

1. Como admin: crear una UF, dar de alta un vecino, dar de alta una cuenta de garita con contraseña.
2. Abrir el link de invitación del vecino (aparece en la consola de la API), crear contraseña.
3. Como vecino: crear una visita para hoy, copiar el link del QR.
4. En otra ventana, entrar como garita, escanear o buscar por apellido, registrar el ingreso.
5. Como admin: verificar que el ingreso aparece en la bitácora y que los KPIs subieron.
6. Volver a escanear el mismo QR: tiene que salir en rojo, "Cupo agotado".

- [ ] **Step 4: Correr toda la suite de la API una última vez**

Run: `cd api && npx vitest run`
Expected: PASS, todos los archivos.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pantalla de garita y panel de administracion"
```

---

### Task 16: Entrar con Google

**Files:**
- Create: `api/src/services/google.ts`, `api/src/routes/google.ts`
- Modify: `api/src/app.ts`, `web/src/app/login/page.tsx`, `web/src/app/acceso/page.tsx`
- Test: `api/tests/google.test.ts`

**Interfaces:**
- Consumes: `createSession`, `setSessionCookie` (Task 4).
- Produces:
  - `linkOrLoginWithGoogle(payload: { sub: string; email: string; emailVerified: boolean }): Promise<string>` — devuelve el `personId`
  - Rutas: `GET /auth/google` (redirige a Google), `GET /auth/google/callback`

Va último a propósito: es un bloque independiente que no toca el flujo de contraseña. La app funciona sin esto.

- [ ] **Step 1: Instalar la dependencia y crear las credenciales**

```bash
cd api && npm i google-auth-library
```

En Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized redirect URI: `http://localhost:8080/auth/google/callback`. Guardar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`.

- [ ] **Step 2: Escribir el test que falla**

`api/tests/google.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import { neighborhoods, people } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { linkOrLoginWithGoogle } from '../src/services/google.js'
import { resetDb } from './helpers/db.js'

async function person(email: string, googleSub: string | null = null) {
  const [n] = await db.select().from(neighborhoods).limit(1)
  const barrio = n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
  const [p] = await db.insert(people).values({
    neighborhoodId: barrio.id, email, name: 'Martín', role: 'resident', status: 'active', googleSub,
  }).returning()
  return p
}

describe('login con Google', () => {
  beforeEach(resetDb)

  it('vincula la cuenta por mail verificado la primera vez', async () => {
    const p = await person('martin@example.com')
    const id = await linkOrLoginWithGoogle({ sub: 'g-123', email: 'martin@example.com', emailVerified: true })
    expect(id).toBe(p.id)

    const [row] = await db.select().from(people).where(eq(people.id, p.id))
    expect(row.googleSub).toBe('g-123')
  })

  it('en el segundo login entra por googleSub, no por mail', async () => {
    const p = await person('martin@example.com', 'g-123')
    const id = await linkOrLoginWithGoogle({ sub: 'g-123', email: 'otro@example.com', emailVerified: true })
    expect(id).toBe(p.id)
  })

  it('RECHAZA vincular con un mail no verificado (account takeover)', async () => {
    await person('martin@example.com')
    await expect(linkOrLoginWithGoogle({
      sub: 'g-atacante', email: 'martin@example.com', emailVerified: false,
    })).rejects.toThrow(/email_not_verified/)
  })

  it('rechaza un mail que no está en el padrón: no hay registro abierto', async () => {
    await expect(linkOrLoginWithGoogle({
      sub: 'g-999', email: 'desconocido@example.com', emailVerified: true,
    })).rejects.toThrow(/not_in_padron/)
  })

  it('rechaza a una persona deshabilitada', async () => {
    const p = await person('martin@example.com')
    await db.update(people).set({ status: 'disabled' }).where(eq(people.id, p.id))
    await expect(linkOrLoginWithGoogle({
      sub: 'g-123', email: 'martin@example.com', emailVerified: true,
    })).rejects.toThrow(/not_in_padron/)
  })
})
```

El tercer test es el importante: vincular por un mail **no verificado** permitiría que cualquiera se cree una cuenta de Google con el mail de un vecino y entre. Es una vulnerabilidad conocida y este test la cierra.

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd api && npx vitest run tests/google.test.ts`
Expected: FAIL — no existe `services/google.js`.

- [ ] **Step 4: Escribir `api/src/services/google.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { AppError } from '../lib/errors.js'

export type GooglePayload = { sub: string; email: string; emailVerified: boolean }

export async function linkOrLoginWithGoogle(payload: GooglePayload): Promise<string> {
  // 1) Si ya está vinculado, el sub manda. El mail puede haber cambiado en Google.
  const [linked] = await db.select().from(people)
    .where(and(eq(people.googleSub, payload.sub), eq(people.status, 'active')))
    .limit(1)
  if (linked) {
    await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, linked.id))
    return linked.id
  }

  // 2) Primera vez: solo se vincula por mail VERIFICADO. Sin esto, cualquiera
  //    crea una cuenta de Google con el mail de un vecino y se la roba.
  if (!payload.emailVerified) throw new AppError(400, 'email_not_verified')

  const [person] = await db.select().from(people)
    .where(and(eq(people.email, payload.email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  // 3) No hay registro abierto: si no está en el padrón, no entra.
  if (!person) throw new AppError(403, 'not_in_padron')

  await db.update(people)
    .set({ googleSub: payload.sub, lastLoginAt: new Date() })
    .where(eq(people.id, person.id))

  return person.id
}
```

- [ ] **Step 5: Escribir `api/src/routes/google.ts`**

```ts
import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { linkOrLoginWithGoogle } from '../services/google.js'
import { createSession, setSessionCookie } from '../services/sessions.js'
import { AppError } from '../lib/errors.js'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = `${process.env.API_ORIGIN ?? 'http://localhost:8080'}/auth/google/callback`
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

export const googleRoutes = Router()

googleRoutes.get('/google', (_req, res) => {
  if (!clientId || !clientSecret) throw new AppError(501, 'google_not_configured')
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri })
  res.redirect(client.generateAuthUrl({ scope: ['openid', 'email'], prompt: 'select_account' }))
})

googleRoutes.get('/google/callback', async (req, res) => {
  if (!clientId || !clientSecret) throw new AppError(501, 'google_not_configured')
  const code = String(req.query.code ?? '')
  if (!code) throw new AppError(400, 'missing_code')

  const client = new OAuth2Client({ clientId, clientSecret, redirectUri })
  const { tokens } = await client.getToken(code)
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: clientId })
  const p = ticket.getPayload()
  if (!p?.sub || !p.email) throw new AppError(400, 'invalid_google_token')

  try {
    const personId = await linkOrLoginWithGoogle({
      sub: p.sub, email: p.email, emailVerified: p.email_verified === true,
    })
    setSessionCookie(res, await createSession(personId, req.get('user-agent')))
    res.redirect(webOrigin)
  } catch (err) {
    // Los errores de Google vuelven al front como query param, no como JSON:
    // el usuario está en medio de un redirect del navegador.
    const code = err instanceof AppError ? err.code : 'google_failed'
    res.redirect(`${webOrigin}/login?error=${code}`)
  }
})
```

- [ ] **Step 6: Montar en `api/src/app.ts`**

```ts
import { googleRoutes } from './routes/google.js'
  app.use('/auth', googleRoutes)
```

- [ ] **Step 7: Agregar el botón al front**

En `web/src/app/login/page.tsx` y en `web/src/app/acceso/page.tsx`, debajo del formulario:

```tsx
<a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/auth/google`}
   className="rounded border p-3 text-center">
  Continuar con Google
</a>
```

En `login/page.tsx`, leer `useSearchParams().get('error')` y mostrar un mensaje si vale `not_in_padron`: *"Tu mail no está en el padrón del barrio. Pedile el alta a la administración."*

- [ ] **Step 8: Correr los tests**

Run: `cd api && npx vitest run tests/google.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Verificar a mano**

Con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`, entrar a `/login`, tocar "Continuar con Google" y confirmar que vuelve logueado. Después probar con una cuenta de Google que **no** esté en el padrón: tiene que volver a `/login?error=not_in_padron`.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: entrar con Google con vinculacion por mail verificado"
```

---

## Cobertura del spec

| Sección del spec | Tareas |
|---|---|
| 4. Arquitectura | 1, 13 |
| 5. Modelo de datos | 2 |
| 6. `canEnter()` y transacción del cupo | 9, 11 |
| 7. Auth: alta, contraseña, reset, sesiones, multi-dispositivo | 4, 5, 6, 7, 13 |
| 8. Pantallas vecino / garita / admin | 13, 14, 15 |
| 9. Seguridad del QR (cupo, ventana, revocación, token) | 9, 10, 11 |
| 10. Auditoría, bitácora, dashboard | 5, 8, 12, 15 |
| 11. Docker | 1, 13 |
| 7. Google con linking por mail verificado | 16 |
| 12. Testing | 9 (tabla), 11 (concurrencia), 16 (takeover), 15 (smoke manual) |

**No implementado a propósito** (sección 13 del spec, diferidos): anonimización por retención (ley 25.326), notificaciones al vecino, lista nominal de invitados en eventos, UI multi-barrio, pantalla de sesiones activas.

**Nota sobre el detalle de las tareas 14 y 15.** Las pantallas con lógica real —el formulario único de invitación, el compartir por Web Share, y la vista de garita— van con código completo. Las tablas de administración (unidades, usuarios, guardias, bitácora) van descriptas con su contrato de endpoints en lugar de código, porque son CRUD mecánico contra endpoints ya especificados y testeados. Si el ejecutor es un agente sin contexto, conviene que pida el código de esas pantallas antes de arrancarlas.
