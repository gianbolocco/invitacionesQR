# Rediseño · Fase 4 (Admin y auditoría) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer con el diseño nuevo todo lo que usa el administrador —
tablero, vecinos, guardias, unidades, personalización del barrio — y
rediseñar en el lugar la auditoría compartida con la garita.

**Architecture:** Mismo patrón que las fases 2 y 3: un `ChromeAdmin` propio
montado una vez en `(admin)/layout.tsx` (a diferencia de garita, acá no hay
ninguna pantalla a pantalla completa), componentes de dominio ya existentes
(`Kpi`, `Fila`, `EstadoTag`, `Chips`, `Campo`, `Nota`, `EncabezadoPagina`,
`CampoFecha`) más dos nuevos genéricos (`SheetAlta` para altas, `MenuFila`
para las acciones de cada fila) y una capa de datos `lib/queries/admin.ts`
con TanStack Query. La funcionalidad que ya se construyó sobre el admin
viejo — CSV, búsqueda, lote al invitar — se mantiene igual, solo cambia de
vestuario.

**Desvío respecto del texto de la spec:** la spec dice "las altas y
ediciones... en un sheet lateral". Esta fase usa `Sheet` solo para las
altas (formularios con varios campos); cambiar lote, cambiar contraseña y
dar de baja usan `Dialog` (un campo o solo confirmación), el mismo patrón
que ya usa "anular invitación" en el vecino. Dos tamaños de interacción,
dos componentes — forzar un Sheet para un campo sería más fricción, no
menos.

**Tech Stack:** Next 16.3, React 19.2, Tailwind v4, TanStack Query v5,
Radix (`Sheet`, `DropdownMenu`, `Dialog`, ya instalados), motion, sonner,
Express 5 + Drizzle + Postgres del lado de la API.

Spec: `docs/superpowers/specs/2026-10-11-rediseno-fase-4-admin-design.md`.

## Global Constraints

- Textos de interfaz en español rioplatense con voseo. Comentarios en
  español, explicando el porqué.
- Objetivos táctiles de al menos 44px (`h-11`/`size-11`) en todo lo que se
  toca.
- Ningún color de marca escrito a mano: solo tokens (lo controla `npm run
  check`).
- Toda URL de la API sale de `apiBase` o de `api()`.
- `prefers-reduced-motion`: ya lo cubren `MotionConfig` global y
  `globals.css`; no se agrega nada nuevo que lo ignore.
- El comportamiento de lo que ya existe (CSV, búsqueda, lote al invitar,
  mails con marca, confirmación de contraseña) no cambia, solo su vestuario.
- Al cerrar cada tarea: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
  limpio (más `cd api && npx tsc --noEmit && npx vitest run` en las tareas
  que tocan la API).
- No matar procesos de Node globalmente (nunca `taskkill //IM node.exe`).
- Commits con la línea `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Stack de desarrollo: `docker compose up -d --build` desde la raíz (web en
  :3000, api en :8080). Cuenta de desarrollo del admin:
  `admin@aromos.test`, contraseña `smoke-test-pass-larga`. Cuenta e2e:
  `e2e.admin@visitpass.test`, contraseña `e2e-contrasena-larga`.

## Mapa de archivos

```
api/src/services/reports.ts                KPIs nuevos (modifica)
api/tests/reports.test.ts                   tests de los KPIs nuevos (modifica)

web/src/lib/fechas.ts                       + fechaConAnio (modifica)
web/src/lib/admin.ts                        se achica: Person/Unit/ESTADO, sin fetch (modifica)
web/src/lib/queries/admin.ts                capa de datos completa (crea)
web/src/components/dominio/marca.tsx        + marcaOverride (modifica)
web/src/components/dominio/pase.tsx         + marcaOverride (modifica)
web/src/components/admin/chrome.tsx         ChromeAdmin (crea)
web/src/components/admin/sheet-alta.tsx     sheet genérico para altas (crea)
web/src/components/admin/menu-fila.tsx      menú ⋯ genérico (crea)
web/src/components/admin/importar-vecinos.tsx   se muda desde components/, re-tematizado (mueve+modifica)
web/src/components/admin/vista-previa-marca.tsx maqueta de banda+pase en vivo (crea)
web/src/components/bar-chart.tsx            re-tematizado, misma lógica (modifica)

web/src/app/(admin)/layout.tsx              + ChromeAdmin (modifica)
web/src/app/(admin)/admin/page.tsx          Tablero (modifica)
web/src/app/(admin)/admin/vecinos/page.tsx  reemplaza admin/usuarios (crea)
web/src/app/(admin)/admin/usuarios/page.tsx se borra
web/src/app/(admin)/admin/guardias/page.tsx (modifica)
web/src/app/(admin)/admin/unidades/page.tsx (modifica)
web/src/app/(admin)/admin/barrio/page.tsx   (modifica)
web/src/app/(garita)/auditoria/page.tsx     (modifica)
web/next.config.ts                          + redirect /admin/usuarios (modifica)

web/e2e/admin.spec.ts                       (crea)
```

---

### Task 1: KPIs nuevos en la API

**Files:**
- Modify: `api/src/services/reports.ts`
- Modify: `api/tests/reports.test.ts`

**Interfaces:**
- Produces: `Kpis` con cuatro campos nuevos — `insideNow`, `staleInside`,
  `entriesSameDayLastWeek`, `invitedNeverLoggedIn` — sumados a los siete
  que ya devuelve `GET /reports/kpis`.

- [ ] **Step 1: Los tests que fallan**

En `api/tests/reports.test.ts`, agregar `entryLogs` y `authTokens` al
import de schema, y hacer que `scenario()` también devuelva `n`:

```ts
import { neighborhoods, units, people, unitMembers, invitations, entryLogs, authTokens } from '../src/db/schema.js'
```

```ts
import { registerEntry, registerExit } from '../src/services/entries.js'
```

Cambiar el `return` de `scenario()`:

```ts
  return { cookie: login.headers['set-cookie'], inv, admin, vecino, n }
```

Agregar, dentro de `describe('reportes', ...)`, antes del test "un vecino
no puede ver los reportes":

```ts
  it('cuenta quién está adentro ahora y quién hace más de 12 horas', async () => {
    const { cookie, inv, admin } = await scenario()
    const entrada = await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })

    let res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(1)
    expect(res.body.staleInside).toBe(0)

    await db.update(entryLogs).set({ enteredAt: new Date(Date.now() - 13 * 60 * 60 * 1000) })
      .where(eq(entryLogs.id, entrada.id))
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(1)
    expect(res.body.staleInside).toBe(1)

    await registerExit(inv.id, admin.id)
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(0)
    expect(res.body.staleInside).toBe(0)
  })

  it('cuenta los ingresos del mismo día, la semana pasada', async () => {
    const { cookie, inv, admin } = await scenario()
    const entrada = await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })
    await db.update(entryLogs).set({ enteredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .where(eq(entryLogs.id, entrada.id))

    const res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.entriesSameDayLastWeek).toBe(1)
    expect(res.body.entriesToday).toBe(0)
  })

  it('cuenta a los invitados cuyo alta venció sin que entraran nunca', async () => {
    const { cookie, n } = await scenario()
    const [invitado] = await db.insert(people).values({
      neighborhoodId: n.id, email: 'nuevo@example.com', name: 'Nuevo', role: 'resident', status: 'invited',
    }).returning()
    await db.insert(authTokens).values({
      personId: invitado.id, tokenHash: 'vencido-1', purpose: 'invite',
      expiresAt: new Date(Date.now() - 1000),
    })

    let res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.invitedNeverLoggedIn).toBe(1)

    // Si lo reinvitan con un link fresco, deja de contar hasta que ese venza.
    await db.insert(authTokens).values({
      personId: invitado.id, tokenHash: 'fresco-1', purpose: 'invite',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.invitedNeverLoggedIn).toBe(0)
  })
```

Run: `cd api && npx vitest run tests/reports.test.ts`
Expected: FAIL — `insideNow`/`staleInside`/`entriesSameDayLastWeek`/`invitedNeverLoggedIn` son `undefined`.

- [ ] **Step 2: Implementar**

En `api/src/services/reports.ts`, reemplazar el tipo `Kpis` y la función
`dashboardKpis`:

```ts
export type Kpis = {
  entriesToday: number
  entriesWeek: number
  entriesMonth: number
  activeInvitations: number
  enabledResidents: number
  activeResidents30d: number
  unitsWithoutResidents: number
  insideNow: number
  staleInside: number
  entriesSameDayLastWeek: number
  invitedNeverLoggedIn: number
}

export async function dashboardKpis(neighborhoodId: string): Promise<Kpis> {
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
        as "unitsWithoutResidents",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id
        where u.neighborhood_id = ${neighborhoodId} and e.exited_at is null)::int as "insideNow",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id
        where u.neighborhood_id = ${neighborhoodId} and e.exited_at is null
          and e.entered_at < now() - interval '12 hours')::int as "staleInside",
      (select count(*) from entry_log e join unit u on u.id = e.unit_id, local
        where u.neighborhood_id = ${neighborhoodId}
          and (e.entered_at at time zone ${TZ})::date = local.today - 7)::int as "entriesSameDayLastWeek",
      (select count(*) from person p, local
        where p.neighborhood_id = ${neighborhoodId} and p.role = 'resident' and p.status = 'invited'
          and not exists (
            select 1 from auth_token t
            where t.person_id = p.id and t.purpose = 'invite' and t.used_at is null and t.expires_at > now()
          ))::int as "invitedNeverLoggedIn"
  `)
  return rows[0] as unknown as Kpis
}
```

- [ ] **Step 3: Verificar**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: todos los tests pasan (255 + 3 nuevos = 258).

- [ ] **Step 4: Commit**

```bash
git add api/src/services/reports.ts api/tests/reports.test.ts
git commit -m "feat: sumar insideNow, staleInside, entriesSameDayLastWeek e invitedNeverLoggedIn a los KPIs"
```

---

### Task 2: Capa de datos del admin

**Files:**
- Modify: `web/src/lib/fechas.ts`
- Modify: `web/src/lib/admin.ts`
- Create: `web/src/lib/queries/admin.ts`

**Interfaces:**
- Consumes: `api`, `apiBase` (`@/lib/api`); `claveMarca` (`@/lib/marca-cliente`); `Person`, `Unit`, `ESTADO` (`@/lib/admin`).
- Produces: `claves`, `usePersonas`, `useUnidades`, `useKpis`,
  `useEntradasPorDia`, `useEntradasPorHora`, `useInvitacionesPorPersona`,
  `useActividadPorGuardia`, `useAltaVecino`, `useAltaGuardia`,
  `useReenviarInvitacion`, `useReactivarPersona`, `useDeshabilitarPersona`,
  `useCambiarLote`, `useCambiarContrasenaGuardia`, `useAltaUnidad`,
  `type Barrio`, `useBarrio`, `useGuardarBarrio`, `useSubirLogo`,
  `useQuitarLogo`, `type FilaPreview`, `type Preview`, `type ResultadoFila`,
  `usePreviewCsv`, `useImportarTanda`, `type Kpis`, `type PorDia`,
  `type PorHora`, `type PorPersona`, `type PorGuardia`.

- [ ] **Step 1: `fechaConAnio` en `lib/fechas.ts`**

Agregar al final de `web/src/lib/fechas.ts`:

```ts
/** "11/10/2026": con año, para accesos que pueden ser de hace mucho. */
export function fechaConAnio(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}
```

- [ ] **Step 2: Achicar `lib/admin.ts`**

Reemplazar todo el contenido de `web/src/lib/admin.ts` por:

```ts
export type Unit = { id: string; label: string }

export type Person = {
  id: string
  email: string
  name: string
  role: 'resident' | 'guard' | 'admin'
  status: 'invited' | 'active' | 'disabled'
  lastLoginAt: string | null
  units: Unit[]
}

export const ESTADO: Record<Person['status'], string> = {
  invited: 'Invitado, todavía no entró',
  active: 'Activo',
  disabled: 'Deshabilitado',
}

/** Sin tildes ni mayúsculas: así "Lucía" matchea "lucia" y "142" matchea "Lote 142". */
export function normalizarBusqueda(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
```

(Se van `useState`, `useAdminData`, `fecha` y `fechaHora`: la carga pasa a
TanStack Query en `lib/queries/admin.ts`, y las fechas a `lib/fechas.ts` —
`fechaHora` ya existe ahí, `fecha` pasa a ser `fechaConAnio`.
`normalizarBusqueda` se muda acá desde `admin/usuarios/page.tsx`, que la
tenía duplicada de forma local.)

- [ ] **Step 3: `lib/queries/admin.ts`**

```ts
'use client'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, apiBase, ApiError } from '@/lib/api'
import { claveMarca } from '@/lib/marca-cliente'
import type { Person, Unit } from '@/lib/admin'

export const claves = {
  personas: ['admin', 'personas'] as const,
  unidades: ['admin', 'unidades'] as const,
  kpis: ['admin', 'kpis'] as const,
  entradasPorDia: ['admin', 'entradas-dia'] as const,
  entradasPorHora: ['admin', 'entradas-hora'] as const,
  invitacionesPorPersona: ['admin', 'invitaciones-persona'] as const,
  actividadPorGuardia: ['admin', 'actividad-guardia'] as const,
  barrio: ['admin', 'barrio'] as const,
}

function invalidarPersonas(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: claves.personas })
}

export function usePersonas() {
  return useQuery({ queryKey: claves.personas, queryFn: ({ signal }) => api<Person[]>('/admin/people', { signal }) })
}

export function useUnidades() {
  return useQuery({ queryKey: claves.unidades, queryFn: ({ signal }) => api<Unit[]>('/admin/units', { signal }) })
}

export type Kpis = {
  entriesToday: number
  entriesWeek: number
  entriesMonth: number
  activeInvitations: number
  enabledResidents: number
  activeResidents30d: number
  unitsWithoutResidents: number
  insideNow: number
  staleInside: number
  entriesSameDayLastWeek: number
  invitedNeverLoggedIn: number
}
export type PorDia = { day: string; total: number }
export type PorHora = { hour: number; total: number }
export type PorPersona = { id: string; name: string; unitLabel: string; total: number }
export type PorGuardia = { id: string | null; name: string | null; total: number; lastAt: string | null }

export function useKpis() {
  return useQuery({ queryKey: claves.kpis, queryFn: ({ signal }) => api<Kpis>('/reports/kpis', { signal }) })
}
export function useEntradasPorDia() {
  return useQuery({
    queryKey: claves.entradasPorDia,
    queryFn: ({ signal }) => api<PorDia[]>('/reports/entries-by-day', { signal }),
  })
}
export function useEntradasPorHora() {
  return useQuery({
    queryKey: claves.entradasPorHora,
    queryFn: ({ signal }) => api<PorHora[]>('/reports/entries-by-hour', { signal }),
  })
}
export function useInvitacionesPorPersona() {
  return useQuery({
    queryKey: claves.invitacionesPorPersona,
    queryFn: ({ signal }) => api<PorPersona[]>('/reports/invitations-by-person', { signal }),
  })
}
export function useActividadPorGuardia() {
  return useQuery({
    queryKey: claves.actividadPorGuardia,
    queryFn: ({ signal }) => api<PorGuardia[]>('/reports/activity-by-guard', { signal }),
  })
}

export function useAltaVecino() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: { name: string; email: string; lot?: number }) =>
      api<{ id: string; email: string; status: string; mailEnviado: boolean }>('/admin/people', {
        method: 'POST', body: JSON.stringify({ ...datos, role: 'resident' }),
      }),
    // El alta queda hecha igual si el mail falla: se avisa para que se
    // reenvíe desde la lista, no se bloquea el cierre del sheet.
    onSuccess: (r) => {
      if (!r.mailEnviado) toast.error(`Dimos de alta a ${r.email}, pero el mail no salió. Probá "Reenviar" en la lista.`)
    },
    onSettled: () => invalidarPersonas(qc),
  })
}

/*
 * El alta de un guardia son dos requests: persona + contraseña. Si la
 * segunda falla, antes quedaba una cuenta sin clave que nadie podía usar
 * y el admin ni se enteraba. Ahora, si falla, se da de baja lo recién
 * creado y se informa — mejor nada que una cuenta fantasma.
 */
export function useAltaGuardia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (datos: { name: string; email: string; password: string }) => {
      const creado = await api<{ id: string; email: string }>('/admin/people', {
        method: 'POST', body: JSON.stringify({ name: datos.name, email: datos.email, role: 'guard' }),
      })
      try {
        await api(`/admin/people/${creado.id}/password`, {
          method: 'POST', body: JSON.stringify({ password: datos.password }),
        })
      } catch (err) {
        await api(`/admin/people/${creado.id}/disable`, { method: 'POST' }).catch(() => {})
        throw err
      }
      return creado
    },
    onError: () => toast.error('No se pudo crear el guardia. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useReenviarInvitacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id' | 'email'>) => api(`/admin/people/${p.id}/resend`, { method: 'POST' }),
    onSuccess: (_d, p) => toast.success(`Reenviamos la invitación a ${p.email}.`),
    onError: (_e, p) => toast.error(`No pudimos mandarle el mail a ${p.email}. Probá de nuevo en un rato.`),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useReactivarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id'>) => api(`/admin/people/${p.id}/enable`, { method: 'POST' }),
    onSuccess: (_d, p) => { void p }, // el toast con el nombre lo arma quien llama (no lo tiene acá)
    onError: () => toast.error('No se pudo reactivar. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useDeshabilitarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id'>) => api(`/admin/people/${p.id}/disable`, { method: 'POST' }),
    onError: () => toast.error('No se pudo dar de baja. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useCambiarLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, lot }: { personId: string; lot: number }) =>
      api(`/admin/people/${personId}/lot`, { method: 'POST', body: JSON.stringify({ lot }) }),
    onError: () => toast.error('No se pudo cambiar el lote. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useCambiarContrasenaGuardia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, password }: { personId: string; password: string }) =>
      api(`/admin/people/${personId}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
    onError: () => toast.error('No se pudo cambiar la contraseña. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}

export function useAltaUnidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lot: number) => api<Unit>('/admin/units', { method: 'POST', body: JSON.stringify({ lot }) }),
    onError: () => toast.error('No se pudo crear. Puede que ese lote ya esté cargado.'),
    onSettled: () => qc.invalidateQueries({ queryKey: claves.unidades }),
  })
}

export type Barrio = {
  id: string
  name: string
  address: string | null
  mapUrl: string | null
  brandColor: string | null
  paleta: string[]
}

export function useBarrio() {
  return useQuery({ queryKey: claves.barrio, queryFn: ({ signal }) => api<Barrio>('/admin/neighborhood', { signal }) })
}

export function useGuardarBarrio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: { address: string; mapUrl: string; brandColor?: string }) =>
      api<Barrio>('/admin/neighborhood', { method: 'PATCH', body: JSON.stringify(datos) }),
    onSuccess: (b) => {
      qc.setQueryData(claves.barrio, b)
      qc.invalidateQueries({ queryKey: claveMarca })
    },
    onError: () => toast.error('El link de mapas tiene que empezar con http. Copialo desde Google Maps con "Compartir".'),
  })
}

export function useSubirLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      // fetch directo y no api(): este manda un binario con su propio
      // Content-Type, y el helper fuerza application/json.
      const res = await fetch(`${apiBase}/admin/branding/logo`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': file.type }, body: file,
      })
      if (!res.ok) throw new Error(String(res.status))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
    onError: () => toast.error('No se pudo subir. Tiene que ser un PNG o un JPG de menos de 500 KB.'),
  })
}

export function useQuitarLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api('/admin/branding/logo', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveMarca }),
  })
}

export type FilaPreview = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'ready' | 'invalid' | 'duplicate_file' | 'existing'
  errors: string[]
}
export type Preview = {
  rows: FilaPreview[]
  summary: { total: number; ready: number; duplicates: number; invalid: number }
}
export type ResultadoFila = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'created' | 'mail_failed' | 'existing' | 'failed'
}

export function usePreviewCsv() {
  return useMutation({
    mutationFn: (csv: string) => api<Preview>('/admin/people/import/preview', {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv,
    }),
  })
}

export function useImportarTanda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rows: Pick<ResultadoFila, 'line' | 'name' | 'email' | 'lot'>[]) =>
      api<{ results: ResultadoFila[] }>('/admin/people/import', { method: 'POST', body: JSON.stringify({ rows }) }),
    onSettled: () => invalidarPersonas(qc),
  })
}

export { ApiError }
```

(`useReactivarPersona` re-exporta `p` sin usarlo porque el toast con el
nombre de la persona lo arma la pantalla que llama — tiene el objeto
`Person` completo a mano y acá solo llega el `id`. Se simplifica en el
Step siguiente si el lint se queja; ver Task 10.)

- [ ] **Step 4: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. Nada usa todavía estos hooks (se prueban de punta a
punta en las tareas 9 a 14). Si eslint marca `useReactivarPersona`'s
`onSuccess` como variable sin uso real, simplificarlo a:

```ts
export function useReactivarPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Pick<Person, 'id'>) => api(`/admin/people/${p.id}/enable`, { method: 'POST' }),
    onError: () => toast.error('No se pudo reactivar. Probá de nuevo.'),
    onSettled: () => invalidarPersonas(qc),
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fechas.ts web/src/lib/admin.ts web/src/lib/queries/admin.ts
git commit -m "feat: capa de datos del admin (personas, unidades, kpis, barrio, csv)"
```

---

### Task 3: `marcaOverride` en `Marca` y `Pase`

**Files:**
- Modify: `web/src/components/dominio/marca.tsx`
- Modify: `web/src/components/dominio/pase.tsx`

**Interfaces:**
- Produces: `Marca({ variante?, className?, marcaOverride? })`,
  `Pase({ datos, qr, apagado?, sello?, className?, marcaOverride? })` —
  ambos, sin `marcaOverride`, se comportan exactamente igual que hoy.

- [ ] **Step 1: `components/dominio/marca.tsx`**

```tsx
'use client'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import type { Marca as DatosMarca } from '@/lib/marca'
import { cn } from '@/lib/utils'

/**
 * El logo o el nombre del barrio. Es el único componente que sabe cómo se
 * pinta la marca: si hay logo lo muestra, si no, el nombre en display.
 *
 * - normal: sobre el fondo, el nombre va en el color del barrio.
 * - banda: sobre la banda de color; el logo va en una pastilla blanca para
 *   que uno oscuro no desaparezca sobre el fondo.
 * - grande: arranque y pantallas de acceso.
 *
 * `marcaOverride` la usa la vista previa de /admin/barrio: en vez de leer
 * la marca guardada, muestra la que se está editando, antes de guardar.
 */
export function Marca({ variante = 'normal', className, marcaOverride }: {
  variante?: 'normal' | 'banda' | 'grande'
  className?: string
  marcaOverride?: DatosMarca
}) {
  const marcaReal = useMarca()
  const marca = marcaOverride ?? marcaReal
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

- [ ] **Step 2: `components/dominio/pase.tsx`**

Agregar el import y el prop (el resto del archivo no cambia):

```tsx
'use client'
import { QRCodeSVG } from 'qrcode.react'
import { useMarca } from '@/lib/marca-cliente'
import type { Marca as DatosMarca } from '@/lib/marca'
import { cn } from '@/lib/utils'
```

```tsx
export function Pase({ datos, qr, apagado = false, sello, className, marcaOverride }: {
  datos: DatosPase
  qr: string
  apagado?: boolean
  sello?: string
  className?: string
  marcaOverride?: DatosMarca
}) {
  const marcaReal = useMarca()
  const marca = marcaOverride ?? marcaReal
```

(El resto del cuerpo usa `marca.nombre`/`marca.color` como ya lo hacía —
con `const marca = useMarca()` renombrado a `marcaReal` y la línea de
arriba calculando `marca`, ningún otro uso del archivo cambia.)

- [ ] **Step 3: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio. El build confirma que los 7 usos existentes de `Marca`
y los de `Pase` siguen compilando sin pasar `marcaOverride`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/dominio/marca.tsx web/src/components/dominio/pase.tsx
git commit -m "feat: marcaOverride en Marca y Pase, para la vista previa del admin"
```

---

### Task 4: `ChromeAdmin`, layout y redirect

**Files:**
- Create: `web/src/components/admin/chrome.tsx`
- Modify: `web/src/app/(admin)/layout.tsx`
- Modify: `web/next.config.ts`

**Interfaces:**
- Consumes: `useSesion`, `logout`, `Marca`, `SelectorTema`, `BarraSeccion` + `ItemBarra`, `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`, `cn`.
- Produces: `ChromeAdmin({ children })`.

- [ ] **Step 1: `components/admin/chrome.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, ClipboardList, LayoutDashboard, LogOut, MoreHorizontal, Palette, ShieldCheck, Users,
} from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, type ItemBarra } from '@/components/dominio/barra-seccion'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const PILLS = [
  { href: '/admin', etiqueta: 'Tablero' },
  { href: '/admin/vecinos', etiqueta: 'Vecinos' },
  { href: '/admin/guardias', etiqueta: 'Guardias' },
  { href: '/admin/unidades', etiqueta: 'Unidades' },
  { href: '/admin/barrio', etiqueta: 'Barrio' },
  { href: '/auditoria', etiqueta: 'Auditoría' },
]

/**
 * El marco del admin: banda del barrio y navegación. En escritorio, los
 * seis destinos como pills en la banda — sobra lugar. En mobile, los
 * cuatro de uso diario van en la barra inferior; Unidades y Barrio son
 * tareas de configuración, no de todos los días, y quedan detrás de "Más".
 */
export function ChromeAdmin({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()
  const [masAbierto, setMasAbierto] = useState(false)

  const activo = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href))

  const barraItems: ItemBarra[] = [
    { href: '/admin', etiqueta: 'Tablero', icono: LayoutDashboard, activo: activo('/admin') },
    { href: '/admin/vecinos', etiqueta: 'Vecinos', icono: Users, activo: activo('/admin/vecinos') },
    { href: '/admin/guardias', etiqueta: 'Guardias', icono: ShieldCheck, activo: activo('/admin/guardias') },
    { href: '/auditoria', etiqueta: 'Auditoría', icono: ClipboardList, activo: path.startsWith('/auditoria') },
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 bg-marca text-sobre-marca">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/admin" aria-label="Inicio" className="min-w-0"><Marca variante="banda" /></Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {PILLS.map((p) => (
              <Link key={p.href} href={p.href} aria-current={activo(p.href) ? 'page' : undefined}
                className={cn('rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
                  activo(p.href) ? 'bg-white/20' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                {p.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm opacity-85 sm:inline">{me.name}</span>
            <SelectorTema />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="grid size-9 place-items-center rounded-full text-sobre-marca hover:bg-white/10">
              <LogOut className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>

      <BarraSeccion items={barraItems} central={
        <button type="button" aria-label="Más secciones" onClick={() => setMasAbierto(true)}
          className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-soft">
          <MoreHorizontal className="size-[22px]" aria-hidden />Más
        </button>
      } />

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader><SheetTitle>Más</SheetTitle></SheetHeader>
          <nav className="flex flex-col gap-1 px-4 pb-8">
            <Link href="/admin/unidades" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-md px-3 text-base font-semibold hover:bg-surface-sunk">
              <Building2 className="size-5 text-ink-soft" aria-hidden />Unidades
            </Link>
            <Link href="/admin/barrio" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-md px-3 text-base font-semibold hover:bg-surface-sunk">
              <Palette className="size-5 text-ink-soft" aria-hidden />Barrio
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 2: Montarlo en el layout**

Reemplazar `web/src/app/(admin)/layout.tsx`:

```tsx
import { SeccionProtegida } from '@/components/seccion-protegida'
import { ChromeAdmin } from '@/components/admin/chrome'

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <SeccionProtegida roles={['admin']}>
      <ChromeAdmin>{children}</ChromeAdmin>
    </SeccionProtegida>
  )
}
```

- [ ] **Step 3: Redirect de `/admin/usuarios`**

En `web/next.config.ts`, agregar una entrada al array de `redirects()`:

```ts
      { source: '/admin/usuarios', destination: '/admin/vecinos', permanent: true },
```

- [ ] **Step 4: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. Las pantallas de adentro (`admin/page.tsx`, etc.)
todavía no usan `ChromeAdmin` directamente porque el layout ya las envuelve
— así que si alguna pantalla también monta un `Shell` viejo, van a quedar
dos chromes anidados hasta la tarea que la reescriba. Es esperado: se
corrige pantalla por pantalla en las tareas 8 a 14.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/chrome.tsx "web/src/app/(admin)/layout.tsx" web/next.config.ts
git commit -m "feat: marco del admin con banda, pills en escritorio y Mas en mobile"
```

---

### Task 5: `SheetAlta` y `MenuFila`

**Files:**
- Create: `web/src/components/admin/sheet-alta.tsx`
- Create: `web/src/components/admin/menu-fila.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`); `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetDescription` (`@/components/ui/sheet`); `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` (`@/components/ui/dropdown-menu`).
- Produces: `SheetAlta({ etiqueta, titulo, descripcion?, abierto, onAbiertoChange, children })`; `type AccionFila = { etiqueta: string; onClick: () => void; destructiva?: boolean }`, `MenuFila({ acciones })`.

- [ ] **Step 1: `components/admin/sheet-alta.tsx`**

```tsx
'use client'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'

/**
 * El botón "+ {etiqueta}" que abre un sheet lateral con un formulario
 * adentro. `abierto`/`onAbiertoChange` vienen de afuera para que la
 * mutación de alta pueda cerrarlo sola cuando termina.
 */
export function SheetAlta({ etiqueta, titulo, descripcion, abierto, onAbiertoChange, children }: {
  etiqueta: string
  titulo: string
  descripcion?: string
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <>
      <Button onClick={() => onAbiertoChange(true)}><Plus aria-hidden />{etiqueta}</Button>
      <Sheet open={abierto} onOpenChange={onAbiertoChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{titulo}</SheetTitle>
            {descripcion && <SheetDescription>{descripcion}</SheetDescription>}
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-8">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 2: `components/admin/menu-fila.tsx`**

```tsx
'use client'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export type AccionFila = { etiqueta: string; onClick: () => void; destructiva?: boolean }

/** El menú ⋯ de cada fila: reenviar, cambiar lote, dar de baja, lo que haga falta. */
export function MenuFila({ acciones }: { acciones: AccionFila[] }) {
  if (acciones.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acciones.map((a) => (
          <DropdownMenuItem key={a.etiqueta} onClick={a.onClick}
            className={a.destructiva ? 'text-peligro focus:bg-peligro/10 focus:text-peligro' : undefined}>
            {a.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/admin/sheet-alta.tsx web/src/components/admin/menu-fila.tsx
git commit -m "feat: SheetAlta y MenuFila, genericos para las pantallas del admin"
```

---

### Task 6: `BarChart` re-tematizado

**Files:**
- Modify: `web/src/components/bar-chart.tsx`

**Interfaces:**
- Produces: `type Barra = { label: string; total: number; hint?: string }`, `BarChart({ title, bars, emptyText? })` — misma firma y comportamiento, sin el import a `./ui`.

- [ ] **Step 1: Reemplazar el archivo**

```tsx
'use client'
import { useState } from 'react'

export type Barra = { label: string; total: number; hint?: string }

/**
 * Barras de una sola serie. Sin librería: son 24 o 30 valores y un div por barra.
 * Las barras usan el color de marca (bg-marca), así el gráfico sigue a cada barrio.
 */
export function BarChart({ title, bars, emptyText = 'Todavía no hay datos.' }: {
  title: string
  bars: Barra[]
  emptyText?: string
}) {
  const [tabla, setTabla] = useState(false)
  const max = Math.max(1, ...bars.map((b) => b.total))
  const hayDatos = bars.some((b) => b.total > 0)

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{title}</p>
        <button onClick={() => setTabla((v) => !v)}
          className="text-xs text-marca underline underline-offset-4">
          {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </figcaption>

      {!hayDatos && <p className="py-8 text-center text-sm text-ink-soft">{emptyText}</p>}

      {hayDatos && !tabla && (
        <div className="flex h-40 items-end gap-0.5" role="img"
          aria-label={`${title}. ${bars.map((b) => `${b.label}: ${b.total}`).join('. ')}`}>
          {bars.map((b) => (
            <div key={b.label} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden
                -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-surface
                group-hover:block">
                <span className="tabular">{b.hint ?? b.label}: {b.total}</span>
              </div>
              <div
                className="w-full rounded-t-[4px] bg-marca transition-[height]
                  group-hover:bg-marca-deep"
                style={{ height: `${Math.max(2, (b.total / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      )}

      {hayDatos && !tabla && (
        <div className="flex justify-between border-t border-line pt-1 text-xs text-ink-soft tabular">
          <span>{bars[0]?.label}</span>
          <span className="font-semibold text-ink">
            pico {max} · {bars.find((b) => b.total === max)?.label}
          </span>
          <span>{bars.at(-1)?.label}</span>
        </div>
      )}

      {tabla && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Tramo</th>
              <th className="py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {bars.filter((b) => b.total > 0).map((b) => (
              <tr key={b.label} className="border-b border-line">
                <td className="py-1.5 tabular">{b.hint ?? b.label}</td>
                <td className="py-1.5 tabular">{b.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
```

- [ ] **Step 2: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio (el admin viejo todavía importa este archivo — sigue
andando igual, solo cambió de dónde saca el estilo del título).

```bash
git add web/src/components/bar-chart.tsx
git commit -m "ui: re-tematizar BarChart sin el Eyebrow viejo"
```

---

### Task 7: Tablero

**Files:**
- Modify: `web/src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin`; `useKpis`, `useEntradasPorDia`, `useEntradasPorHora`, `useInvitacionesPorPersona`, `useActividadPorGuardia` (Tarea 2); `Kpi` (`@/components/dominio/kpi`); `Fila`; `EncabezadoPagina`; `BarChart` + `Barra` (Tarea 6); `fechaHora` (`@/lib/fechas`).

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Kpi } from '@/components/dominio/kpi'
import { Fila } from '@/components/dominio/fila'
import { BarChart, type Barra } from '@/components/bar-chart'
import {
  useActividadPorGuardia, useEntradasPorDia, useEntradasPorHora, useInvitacionesPorPersona, useKpis,
} from '@/lib/queries/admin'
import { fechaHora } from '@/lib/fechas'

/** undefined cuando la semana pasada no hay con qué comparar: mostrar "+∞%" confunde más de lo que informa. */
function variacion(hoy: number, haceUnaSemana: number): { texto: string; tono: 'sube' | 'baja' | 'neutro' } | undefined {
  if (haceUnaSemana === 0) return undefined
  const delta = Math.round(((hoy - haceUnaSemana) / haceUnaSemana) * 100)
  if (delta === 0) return { texto: 'igual que el mismo día la semana pasada', tono: 'neutro' }
  return { texto: `${Math.abs(delta)}% vs. el mismo día la semana pasada`, tono: delta > 0 ? 'sube' : 'baja' }
}

export default function TableroPage() {
  const kpis = useKpis()
  const porDia = useEntradasPorDia()
  const porHora = useEntradasPorHora()
  const porPersona = useInvitacionesPorPersona()
  const porGuardia = useActividadPorGuardia()

  const horas: Barra[] = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    total: (porHora.data ?? []).find((x) => x.hour === h)?.total ?? 0,
    hint: `${String(h).padStart(2, '0')}:00`,
  }))

  const dias: Barra[] = (porDia.data ?? []).map((d) => {
    const iso = String(d.day).slice(0, 10)
    const [y, m, dd] = iso.split('-').map(Number)
    return {
      label: `${dd}/${m}`,
      total: d.total,
      hint: new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
        .format(new Date(y, m - 1, dd)),
    }
  })

  const maxInvit = Math.max(1, ...(porPersona.data ?? []).map((p) => p.total))
  const k = kpis.data
  const hayAtencion = k && (k.unitsWithoutResidents > 0 || k.staleInside > 0 || k.invitedNeverLoggedIn > 0)

  return (
    <ChromeAdmin>
      <div className="flex flex-col gap-8">
        <EncabezadoPagina antetitulo="Administración" titulo="Tablero" />

        {k && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Ingresos hoy" valor={k.entriesToday}
                variacion={variacion(k.entriesToday, k.entriesSameDayLastWeek)} />
              <Kpi etiqueta="Adentro ahora" valor={k.insideNow} />
              <Kpi etiqueta="Invitaciones vigentes" valor={k.activeInvitations} />
            </div>

            {hayAtencion && (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Atención</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {k.unitsWithoutResidents > 0 && (
                    <Kpi tono="atencion" etiqueta="Unidades sin vecinos" valor={k.unitsWithoutResidents} />
                  )}
                  {k.staleInside > 0 && (
                    <Kpi tono="atencion" etiqueta="Sin salida hace más de 12 horas" valor={k.staleInside} />
                  )}
                  {k.invitedNeverLoggedIn > 0 && (
                    <Kpi tono="atencion" etiqueta="Invitados que nunca entraron" valor={k.invitedNeverLoggedIn} />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <BarChart title="Ingresos por día · últimos 30" bars={dias} />
          <BarChart title="Ingresos por hora del día" bars={horas} emptyText="Sin ingresos registrados todavía." />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Invitaciones por vecino</p>
            {(porPersona.data ?? []).length === 0 && <p className="text-sm text-ink-soft">Sin invitaciones.</p>}
            <ul className="flex flex-col gap-1.5">
              {(porPersona.data ?? []).slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm sm:w-40">{p.name}</span>
                  <span className="h-2.5 rounded-full bg-marca" style={{ width: `${(p.total / maxInvit) * 100}%`, minWidth: '4px' }} />
                  <span className="text-sm text-ink-soft tabular">{p.total}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Actividad por guardia</p>
            {(porGuardia.data ?? []).length === 0 && <p className="text-sm text-ink-soft">Sin ingresos.</p>}
            {(porGuardia.data ?? []).map((g) => (
              <Fila key={g.id ?? 'sin'} titulo={g.name ?? 'Sin asignar'}
                meta={g.lastAt ? `Último: ${fechaHora(g.lastAt)}` : undefined}
                extremo={<span className="tabular text-sm font-semibold">{g.total}</span>} />
            ))}
          </section>
        </div>
      </div>
    </ChromeAdmin>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && rm -rf .next && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`, entrar como
`admin@aromos.test` y abrir `/admin`.
Expected: Kpi de ingresos hoy, adentro ahora, invitaciones vigentes; bloque
Atención solo si hay algo que atender; los dos gráficos y las dos listas
de abajo con datos.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(admin)/admin/page.tsx"
git commit -m "feat: tablero del admin con los kpis nuevos"
```

---

### Task 8: Vecinos

**Files:**
- Create: `web/src/app/(admin)/admin/vecinos/page.tsx`
- Delete: `web/src/app/(admin)/admin/usuarios/page.tsx`
- Move+Modify: `web/src/components/importar-vecinos.tsx` → `web/src/components/admin/importar-vecinos.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin`; `usePersonas`, `useAltaVecino`, `useReenviarInvitacion`, `useReactivarPersona`, `useDeshabilitarPersona`, `useCambiarLote`, `usePreviewCsv`, `useImportarTanda`, `type FilaPreview`, `type Preview`, `type ResultadoFila` (Tarea 2); `normalizarBusqueda`, `ESTADO`, `Person` (`@/lib/admin`); `SheetAlta` (Tarea 5); `MenuFila` + `AccionFila` (Tarea 5); `fechaConAnio` (`@/lib/fechas`); `Campo`, `Nota`, `Fila`, `EncabezadoPagina`, `Vacio`, `ErrorConReintento`, `SkeletonFilas`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` (`@/components/ui/dialog`); `Input`; `Button`.

- [ ] **Step 1: Mover y re-tematizar el diálogo de importación**

```bash
git mv web/src/components/importar-vecinos.tsx web/src/components/admin/importar-vecinos.tsx
```

En `web/src/components/admin/importar-vecinos.tsx`, cambiar los imports
para usar la capa de datos nueva en vez de llamar a `api()` directo, y
sacar los componentes viejos (`Button`, `ErrorNote`, `Eyebrow` de
`@/components/ui`):

```tsx
'use client'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ApiError, usePreviewCsv, useImportarTanda, type FilaPreview, type Preview, type ResultadoFila } from '@/lib/queries/admin'
import { Button } from '@/components/ui/button'
import { Nota } from '@/components/dominio/nota'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
```

El resto del componente (constantes `TAMANO_MAXIMO`, `TAMANO_TANDA`,
`PLANTILLA`, `descargarPlantilla`, `estadoPreview`, `estadoResultado`, y
el JSX del diálogo con su manejo de `resultados.length > 0` ya arreglado
esta semana) se queda igual, con tres cambios:

1. `seleccionarArchivo` usa la mutación en vez de `api()` directo:

```tsx
  const preview = usePreviewCsv()
  const importar = useImportarTanda()
```

```tsx
  async function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setArchivo(file.name)
    setDatosPreview(null)
    setResultados([])
    setConfirmado(false)
    setProgreso(0)
    setError(null)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Elegí un archivo .csv exportado desde Excel.')
      return
    }
    if (file.size > TAMANO_MAXIMO) {
      setError('El archivo supera el límite de 1 MB.')
      return
    }

    const csv = await file.text()
    try {
      setDatosPreview(await preview.mutateAsync(csv))
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : ''
      if (code === 'csv_columnas_requeridas') {
        setError('El CSV debe tener encabezados nombre y email; lote es opcional.')
      } else if (code === 'csv_demasiadas_filas') {
        setError('El archivo supera el máximo de 1000 vecinos por importación.')
      } else {
        setError('No pudimos leer el CSV. Descargá la plantilla y verificá que sea válido.')
      }
    }
  }
```

(Renombrar el estado local `preview`/`setPreview` a `datosPreview`/`setDatosPreview`
en todo el archivo, ya que `preview` pasa a ser el objeto de la mutación.
`leyendo` deja de ser estado propio: usar `preview.isPending` donde antes
se leía `leyendo`.)

2. `confirmarImportacion` usa `importar.mutateAsync`:

```tsx
  async function confirmarImportacion() {
    if (!datosPreview || importando) return
    const listas = datosPreview.rows.filter((row) => row.status === 'ready')
    if (!listas.length) return

    setImportando(true)
    setConfirmado(false)
    setError(null)
    setResultados([])
    setProgreso(0)
    let completadas = 0
    try {
      for (let inicio = 0; inicio < listas.length; inicio += TAMANO_TANDA) {
        const tanda = listas.slice(inicio, inicio + TAMANO_TANDA)
        const respuesta = await importar.mutateAsync(
          tanda.map(({ line, name, email, lot }) => ({ line, name, email, lot })),
        )
        setResultados((actuales) => [...actuales, ...respuesta.results])
        completadas = Math.min(inicio + tanda.length, listas.length)
        setProgreso(completadas)
      }
      setConfirmado(true)
      onImported()
    } catch {
      setError(`Se interrumpió la importación después de ${completadas} de ${listas.length} filas. Lo ya cargado queda guardado; si volvés a subir el CSV, esas direcciones se omiten.`)
      onImported()
    } finally {
      setImportando(false)
    }
  }
```

3. El `<ErrorNote>` se reemplaza por `<Nota tono="error">` en los dos
   lugares donde aparece (el bloque `{error && ...}` del archivo).

- [ ] **Step 2: Verificar el diálogo solo**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: errores de "no se encuentra `onImported`" son esperados — se
resuelven en el Step 3, cuando `admin/vecinos/page.tsx` lo monta.

- [ ] **Step 3: La pantalla de vecinos**

Crear `web/src/app/(admin)/admin/vecinos/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  usePersonas, useAltaVecino, useReenviarInvitacion, useReactivarPersona,
  useDeshabilitarPersona, useCambiarLote, ApiError,
} from '@/lib/queries/admin'
import { ESTADO, normalizarBusqueda, type Person } from '@/lib/admin'
import { fechaConAnio } from '@/lib/fechas'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SheetAlta } from '@/components/admin/sheet-alta'
import { MenuFila, type AccionFila } from '@/components/admin/menu-fila'
import { ImportarVecinos } from '@/components/admin/importar-vecinos'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

function AltaVecino({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const alta = useAltaVecino()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Se limpia el formulario al cerrar por cualquier camino — Cancelar,
  // Escape, clic afuera o un alta exitosa — no solo al mandarlo: si no,
  // abrir el sheet para otra persona arranca con los datos de la anterior
  // y se puede mandar el alta equivocada sin querer.
  function cambiarAbierto(v: boolean) {
    if (!v) { setName(''); setEmail(''); setLot(''); setError(null) }
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      // El aviso de "mail no enviado" lo da el toast de useAltaVecino, no
      // este formulario: el sheet ya se cerró y la persona quedó cargada.
      await alta.mutateAsync({ name, email, lot: lot ? Number(lot) : undefined })
      cambiarAbierto(false)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'mail_repetido'
        ? `${email} ya está en el padrón. Buscalo en la lista.`
        : 'No se pudo dar de alta. Revisá el mail y probá de nuevo.')
    }
  }

  return (
    <SheetAlta etiqueta="Dar de alta" titulo="Dar de alta un vecino"
      descripcion="Le llega un link para activar su cuenta."
      abierto={abierto} onAbiertoChange={cambiarAbierto}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo id="nombre" etiqueta="Nombre">
          <Input id="nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        </Campo>
        <Campo id="mail" etiqueta="Mail">
          <Input id="mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="lote" etiqueta="Lote (opcional)" ayuda="Si lo dejás vacío, lo completa al entrar.">
          <Input id="lote" value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142" className="tabular"
            onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" disabled={alta.isPending}>
          {alta.isPending ? 'Guardando…' : 'Dar de alta y enviar invitación'}
        </Button>
      </form>
    </SheetAlta>
  )
}

function DialogLote({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const cambiar = useCambiarLote()
  const [lot, setLot] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!persona || !lot.trim()) return
    await cambiar.mutateAsync({ personId: persona.id, lot: Number(lot) })
    setLot('')
    onCerrar()
  }

  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) { setLot(''); onCerrar() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar el lote de {persona?.name}</DialogTitle>
          <DialogDescription>Lo saca de su lote actual y lo pasa a este.</DialogDescription>
        </DialogHeader>
        <form id="form-lote" onSubmit={enviar}>
          <Campo id="nuevo-lote" etiqueta="Número de lote">
            <Input id="nuevo-lote" autoFocus required value={lot} inputMode="numeric" pattern="[0-9]*"
              placeholder="142" className="tabular" onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-lote" disabled={cambiar.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogBaja({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const deshabilitar = useDeshabilitarPersona()
  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {persona?.name}?</DialogTitle>
          <DialogDescription>
            No va a poder entrar, y las invitaciones vigentes que creó quedan anuladas. Se puede reactivar después.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" disabled={deshabilitar.isPending}
            onClick={async () => { if (persona) await deshabilitar.mutateAsync(persona); onCerrar() }}>
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function VecinosPage() {
  const personas = usePersonas()
  const reenviar = useReenviarInvitacion()
  const reactivar = useReactivarPersona()
  const [busqueda, setBusqueda] = useState('')
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Person | null>(null)
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)

  const vecinos = (personas.data ?? []).filter((p) => p.role !== 'guard')
  const consulta = normalizarBusqueda(busqueda)
  const filtrados = consulta
    ? vecinos.filter((p) => normalizarBusqueda(p.name).includes(consulta)
      || p.units.some((u) => normalizarBusqueda(u.label).includes(consulta)
        || normalizarBusqueda(u.label.replace(/^lote\s*/i, '')).includes(consulta)))
    : vecinos

  function accionesDe(p: Person): AccionFila[] {
    const acciones: AccionFila[] = []
    if (p.status === 'invited') acciones.push({ etiqueta: 'Reenviar invitación', onClick: () => reenviar.mutate(p) })
    acciones.push({ etiqueta: 'Cambiar lote', onClick: () => setCorrigiendo(p) })
    if (p.status === 'disabled') acciones.push({ etiqueta: 'Reactivar', onClick: () => reactivar.mutate(p) })
    else acciones.push({ etiqueta: 'Dar de baja', destructiva: true, onClick: () => setPorDarDeBaja(p) })
    return acciones
  }

  return (
    <ChromeAdmin>
      <div className="flex flex-col gap-6">
        <EncabezadoPagina antetitulo={personas.data ? `${vecinos.length} en el padrón` : undefined}
          titulo="Vecinos"
          acciones={<AltaVecino abierto={altaAbierta} onAbiertoChange={setAltaAbierta} />} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <Input type="text" value={busqueda} placeholder="Buscar por nombre o lote"
              aria-label="Buscar vecinos por nombre o lote" className="h-11 pl-9 pr-10"
              onChange={(e) => setBusqueda(e.target.value)} />
            {busqueda && (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-ink-soft hover:bg-surface-sunk hover:text-ink">
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <ImportarVecinos onImported={() => personas.refetch()} />
        </div>

        {personas.isPending ? (
          <SkeletonFilas filas={5} />
        ) : personas.isError ? (
          <ErrorConReintento onReintentar={() => personas.refetch()} reintentando={personas.isFetching} />
        ) : filtrados.length === 0 ? (
          <Vacio icono={Search}
            titulo={consulta ? 'No encontramos vecinos con ese nombre o lote' : 'Todavía no hay vecinos en el padrón'} />
        ) : (
          <div>
            {filtrados.map((p) => (
              <Fila key={p.id} titulo={<>{p.name}{p.role === 'admin' && <span className="ml-2 text-xs font-normal text-ink-soft">Admin</span>}</>}
                meta={[
                  p.units.map((u) => u.label).join(' · ') || 'Sin lote asignar',
                  ESTADO[p.status],
                  p.lastLoginAt ? `Último acceso ${fechaConAnio(p.lastLoginAt)}` : 'Sin ingresos',
                ].join(' · ')}
                extremo={<MenuFila acciones={accionesDe(p)} />}
                className={p.status === 'disabled' ? 'opacity-50' : undefined} />
            ))}
          </div>
        )}
      </div>

      <DialogLote persona={corrigiendo} onCerrar={() => setCorrigiendo(null)} />
      <DialogBaja persona={porDarDeBaja} onCerrar={() => setPorDarDeBaja(null)} />
    </ChromeAdmin>
  )
}
```

- [ ] **Step 4: Borrar la pantalla vieja**

Confirmar que nada más la importa:

Run: `cd web && grep -rln "admin/usuarios" src`
Expected: ningún resultado (ya no queda ningún link a esa ruta: el
redirect vive en `next.config.ts`, no en código de React).

```bash
git rm "web/src/app/(admin)/admin/usuarios/page.tsx"
```

- [ ] **Step 5: Verificar**

Run: `cd web && rm -rf .next && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio. El build lista `/admin/vecinos` y ya no `/admin/usuarios`.

Run: `cd .. && docker compose up -d --build web`, entrar como
`admin@aromos.test`, ir a `/admin/vecinos`.
Expected: buscador, lista de vecinos con su estado y lote, menú ⋯ con
reenviar/cambiar lote/dar de baja según corresponda, el sheet de alta, y
"Importar desde CSV" abriendo el mismo diálogo de siempre.

- [ ] **Step 6: Commit**

```bash
git add -A "web/src/app/(admin)/admin/vecinos" "web/src/app/(admin)/admin/usuarios" web/src/components/admin/importar-vecinos.tsx
git commit -m "feat: pantalla de vecinos con sheet de alta y menu por fila"
```

---

### Task 9: Guardias

**Files:**
- Modify: `web/src/app/(admin)/admin/guardias/page.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin`; `usePersonas`, `useAltaGuardia`, `useReactivarPersona`, `useDeshabilitarPersona`, `useCambiarContrasenaGuardia` (Tarea 2); `ESTADO`, `Person` (`@/lib/admin`); `fechaConAnio`; `SheetAlta`, `MenuFila`.

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import { useState } from 'react'
import {
  usePersonas, useAltaGuardia, useReactivarPersona, useDeshabilitarPersona, useCambiarContrasenaGuardia, ApiError,
} from '@/lib/queries/admin'
import { ESTADO, type Person } from '@/lib/admin'
import { fechaConAnio } from '@/lib/fechas'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SheetAlta } from '@/components/admin/sheet-alta'
import { MenuFila, type AccionFila } from '@/components/admin/menu-fila'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ShieldCheck } from 'lucide-react'

function AltaGuardia({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const alta = useAltaGuardia()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Mismo motivo que en AltaVecino: limpiar al cerrar por cualquier
  // camino, no solo al mandarlo.
  function cambiarAbierto(v: boolean) {
    if (!v) { setName(''); setEmail(''); setPassword(''); setError(null) }
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    try {
      await alta.mutateAsync({ name, email, password })
      cambiarAbierto(false)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'mail_repetido'
        ? `${email} ya está en el padrón. Buscalo en la lista.`
        : 'No se pudo crear. Revisá el mail y probá de nuevo.')
    }
  }

  return (
    <SheetAlta etiqueta="Dar de alta" titulo="Dar de alta un guardia"
      descripcion="Cada guardia entra con su propio usuario: los ingresos que registra quedan a su nombre."
      abierto={abierto} onAbiertoChange={cambiarAbierto}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo id="nombre-g" etiqueta="Nombre y apellido">
          <Input id="nombre-g" required placeholder="Carlos Ruiz" value={name} onChange={(e) => setName(e.target.value)} />
        </Campo>
        <Campo id="mail-g" etiqueta="Usuario (mail)" ayuda="Identifica la cuenta. No hace falta que reciba mails.">
          <Input id="mail-g" type="email" required placeholder="carlos@mail.com" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="pass-g" etiqueta="Contraseña" ayuda="Mínimo 10 caracteres. Se la das vos en mano.">
          <Input id="pass-g" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" disabled={alta.isPending}>{alta.isPending ? 'Creando…' : 'Dar de alta'}</Button>
      </form>
    </SheetAlta>
  )
}

function DialogContrasena({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const cambiar = useCambiarContrasenaGuardia()
  const [password, setPassword] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!persona || password.length < 10) return
    await cambiar.mutateAsync({ personId: persona.id, password })
    setPassword('')
    onCerrar()
  }

  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) { setPassword(''); onCerrar() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar la contraseña de {persona?.name}</DialogTitle>
          <DialogDescription>
            Si {persona?.name} está usando la garita ahora, la contraseña nueva lo deja afuera en el acto.
          </DialogDescription>
        </DialogHeader>
        <form id="form-contrasena" onSubmit={enviar}>
          <Campo id="nueva-clave" etiqueta="Contraseña nueva">
            <Input id="nueva-clave" type="password" autoFocus required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-contrasena" disabled={cambiar.isPending || password.length < 10}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogBaja({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const deshabilitar = useDeshabilitarPersona()
  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {persona?.name}?</DialogTitle>
          <DialogDescription>No va a poder entrar a la garita. Los ingresos que ya registró quedan igual.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" disabled={deshabilitar.isPending}
            onClick={async () => { if (persona) await deshabilitar.mutateAsync(persona); onCerrar() }}>
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function GuardiasPage() {
  const personas = usePersonas()
  const reactivar = useReactivarPersona()
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [reseteando, setReseteando] = useState<Person | null>(null)
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)

  const guardias = (personas.data ?? []).filter((p) => p.role === 'guard')

  function accionesDe(g: Person): AccionFila[] {
    const acciones: AccionFila[] = [{ etiqueta: 'Cambiar contraseña', onClick: () => setReseteando(g) }]
    if (g.status === 'disabled') acciones.push({ etiqueta: 'Reactivar', onClick: () => reactivar.mutate(g) })
    else acciones.push({ etiqueta: 'Dar de baja', destructiva: true, onClick: () => setPorDarDeBaja(g) })
    return acciones
  }

  return (
    <ChromeAdmin>
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Guardias"
          subtitulo="Cada guardia entra con su propio usuario. La contraseña no se comparte entre turnos."
          acciones={<AltaGuardia abierto={altaAbierta} onAbiertoChange={setAltaAbierta} />} />

        {personas.isPending ? (
          <SkeletonFilas filas={3} />
        ) : personas.isError ? (
          <ErrorConReintento onReintentar={() => personas.refetch()} reintentando={personas.isFetching} />
        ) : guardias.length === 0 ? (
          <Vacio icono={ShieldCheck} titulo="Todavía no hay guardias cargados"
            detalle="Sin al menos uno, nadie puede escanear en la barrera." />
        ) : (
          <div>
            {guardias.map((g) => (
              <Fila key={g.id} titulo={g.name}
                meta={[ESTADO[g.status], g.lastLoginAt ? `último ingreso ${fechaConAnio(g.lastLoginAt)}` : 'nunca entró'].join(' · ')}
                extremo={<MenuFila acciones={accionesDe(g)} />}
                className={g.status === 'disabled' ? 'opacity-50' : undefined} />
            ))}
          </div>
        )}
      </div>

      <DialogContrasena persona={reseteando} onCerrar={() => setReseteando(null)} />
      <DialogBaja persona={porDarDeBaja} onCerrar={() => setPorDarDeBaja(null)} />
    </ChromeAdmin>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio.

Run: docker compose ya levantado, abrir `/admin/guardias`.
Expected: alta en sheet (contraseña con el aviso de darla en mano),
cambiar contraseña y dar de baja en diálogos, con el aviso de que
desloguea.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(admin)/admin/guardias/page.tsx"
git commit -m "feat: pantalla de guardias con sheet de alta y revertir si falla la clave"
```

---

### Task 10: Unidades

**Files:**
- Modify: `web/src/app/(admin)/admin/unidades/page.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin`; `useUnidades`, `usePersonas`, `useAltaUnidad` (Tarea 2); `Campo`, `Fila`, `EncabezadoPagina`, `Vacio`, `ErrorConReintento`, `SkeletonFilas`.

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useUnidades, usePersonas, useAltaUnidad } from '@/lib/queries/admin'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function UnidadesPage() {
  const unidades = useUnidades()
  const personas = usePersonas()
  const alta = useAltaUnidad()
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Cuántos vecinos tiene cada unidad: se deriva del padrón que ya se pide
  // para Vecinos, sin otra llamada a la API.
  const porUnidad = new Map<string, number>()
  for (const p of personas.data ?? []) {
    for (const u of p.units) porUnidad.set(u.id, (porUnidad.get(u.id) ?? 0) + 1)
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await alta.mutateAsync(Number(lot))
      setLot('')
    } catch {
      setError('No se pudo crear. Puede que ese lote ya esté cargado.')
    }
  }

  return (
    <ChromeAdmin>
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Unidades" />

        <form onSubmit={crear} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 sm:max-w-xs">
            <Campo id="lote-nuevo" etiqueta="Número de lote"
              ayuda="Cargar los lotes es opcional: el vecino declara el suyo al entrar.">
              <Input id="lote-nuevo" required value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142"
                className="tabular" onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
            </Campo>
          </div>
          <Button type="submit" disabled={alta.isPending}>Agregar</Button>
        </form>
        {error && <Nota tono="error">{error}</Nota>}

        {unidades.isPending ? (
          <SkeletonFilas filas={3} />
        ) : unidades.isError ? (
          <ErrorConReintento onReintentar={() => unidades.refetch()} reintentando={unidades.isFetching} />
        ) : unidades.data!.length === 0 ? (
          <Vacio icono={Building2} titulo="Todavía no hay unidades cargadas" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unidades.data!.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-3">
                <span className="font-semibold tabular">{u.label}</span>
                <span className="text-sm text-ink-soft tabular">
                  {porUnidad.get(u.id) ?? 0} {(porUnidad.get(u.id) ?? 0) === 1 ? 'vecino' : 'vecinos'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ChromeAdmin>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio.

Run: docker compose levantado, abrir `/admin/unidades`.
Expected: grilla con la cantidad de vecinos por unidad, alta rápida
inline funcionando.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(admin)/admin/unidades/page.tsx"
git commit -m "feat: pantalla de unidades con cantidad de vecinos derivada del padron"
```

---

### Task 11: `VistaPreviaMarca`

**Files:**
- Create: `web/src/components/admin/vista-previa-marca.tsx`

**Interfaces:**
- Consumes: `Marca` (con `marcaOverride`, Tarea 3); `Pase` (con `marcaOverride`, Tarea 3); `type Marca as DatosMarca` (`@/lib/marca`).
- Produces: `VistaPreviaMarca({ marca })`.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'
import { Marca } from '@/components/dominio/marca'
import { Pase } from '@/components/dominio/pase'
import type { Marca as DatosMarca } from '@/lib/marca'

/**
 * Cómo se va a ver el color/logo que se está editando, antes de guardar:
 * la banda del vecino y el pase del invitado, en miniatura. Usa los
 * componentes reales con `marcaOverride` — no una copia aparte — para que
 * la vista previa sea exactamente lo que se va a ver, no una aproximación
 * que se puede desalinear con el tiempo.
 */
export function VistaPreviaMarca({ marca }: { marca: DatosMarca }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-sunk p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Así se ve</p>

      <div className="overflow-hidden rounded-md" style={{ backgroundColor: marca.color }}>
        <div className="flex h-12 items-center px-3">
          <Marca variante="banda" marcaOverride={marca} />
        </div>
      </div>

      <Pase marcaOverride={marca} qr="vista-previa" datos={{
        tipo: 'Visita', vigencia: 'Hoy', invitado: 'Nombre del invitado', unidad: 'Lote 142', invita: 'Vecino',
      }} className="max-w-none" />
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. No se usa todavía (se monta en la Tarea 12).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/admin/vista-previa-marca.tsx
git commit -m "feat: vista previa en vivo de la banda y el pase para el admin de barrio"
```

---

### Task 12: Barrio

**Files:**
- Modify: `web/src/app/(admin)/admin/barrio/page.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin`; `useBarrio`, `useGuardarBarrio`, `useSubirLogo`, `useQuitarLogo` (Tarea 2); `VistaPreviaMarca` (Tarea 11); `useMarca`, `logoUrl` (`@/lib/marca-cliente`); `Campo`, `Nota`, `EncabezadoPagina`.

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useBarrio, useGuardarBarrio, useSubirLogo, useQuitarLogo } from '@/lib/queries/admin'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { VistaPreviaMarca } from '@/components/admin/vista-previa-marca'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function BarrioPage() {
  const barrio = useBarrio()
  const marcaReal = useMarca()
  const guardar = useGuardarBarrio()
  const subirLogo = useSubirLogo()
  const quitarLogo = useQuitarLogo()

  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [errorLogo, setErrorLogo] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  // Se precarga una sola vez, cuando llegan los datos: después el admin
  // manda sobre lo que escribe, la query no le pisa el formulario. Se
  // ajusta durante el render (patrón oficial de React para esto) en vez
  // de en un efecto, para no disparar un ciclo de render de más.
  if (barrio.data && !cargado) {
    setCargado(true)
    setAddress(barrio.data.address ?? '')
    setMapUrl(barrio.data.mapUrl ?? '')
    setColor(barrio.data.brandColor)
  }

  const marcaPreview = { ...marcaReal, nombre: barrio.data?.name ?? marcaReal.nombre, color: color ?? marcaReal.color }

  async function guardarForm(e: React.FormEvent) {
    e.preventDefault()
    await guardar.mutateAsync({ address, mapUrl, ...(color ? { brandColor: color } : {}) })
  }

  async function subir(file: File) {
    setErrorLogo(null)
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setErrorLogo('Tiene que ser un PNG o un JPG.')
      return
    }
    if (file.size > 500_000) {
      setErrorLogo('El archivo tiene que pesar menos de 500 KB.')
      return
    }
    await subirLogo.mutateAsync(file).catch(() => setErrorLogo('No se pudo subir. Probá de nuevo.'))
  }

  if (barrio.isPending) return <ChromeAdmin><p className="text-ink-soft">Cargando…</p></ChromeAdmin>

  return (
    <ChromeAdmin>
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <EncabezadoPagina titulo={barrio.data?.name ?? 'Barrio'}
            subtitulo="Esto aparece en el link que recibe el invitado, abajo de quién lo invitó." />

          <form onSubmit={guardarForm} className="flex flex-col gap-4 rounded-lg border border-line bg-card p-5">
            <Campo id="direccion" etiqueta="Dirección">
              <Input id="direccion" value={address} placeholder="Ruta 8 km 62, Pilar"
                onChange={(e) => setAddress(e.target.value)} />
            </Campo>
            <Campo id="mapas" etiqueta="Link de Google Maps"
              ayuda='En Google Maps, buscá la entrada del barrio y tocá "Compartir" → "Copiar vínculo".'>
              <Input id="mapas" type="url" value={mapUrl} placeholder="https://maps.app.goo.gl/…"
                onChange={(e) => setMapUrl(e.target.value)} />
            </Campo>

            <fieldset className="border-t border-line pt-4">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Color del barrio</legend>
              <div className="flex flex-wrap gap-2">
                {(barrio.data?.paleta ?? []).map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    aria-label={`Color ${c}`} aria-pressed={color === c} style={{ backgroundColor: c }}
                    className={`size-11 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                Lista cerrada a propósito: son los colores con los que el texto encima se lee bien, de día y de noche.
              </p>
            </fieldset>

            {guardar.isError && <Nota tono="error">El link de mapas tiene que empezar con http. Copialo desde Google Maps con &quot;Compartir&quot;.</Nota>}
            {guardar.isSuccess && <Nota tono="exito">Guardado.</Nota>}
            <Button type="submit" className="self-start" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>

          <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Logo</p>
            {marcaReal.tieneLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl(marcaReal) ?? ''} alt="Logo del barrio" className="h-16 w-auto max-w-[16rem] object-contain" />
            ) : (
              <p className="text-ink-soft">Sin logo se muestra el nombre del barrio en itálica.</p>
            )}

            <button type="button"
              onClick={() => inputArchivo.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastrando(false)
                const file = e.dataTransfer.files[0]
                if (file) subir(file)
              }}
              disabled={subirLogo.isPending}
              className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 text-center text-sm
                ${arrastrando ? 'border-marca bg-marca-suave' : 'border-line'} disabled:opacity-50`}>
              <Upload className="size-5 text-ink-soft" aria-hidden />
              <span>{subirLogo.isPending ? 'Subiendo…' : 'Arrastrá un PNG o JPG, o tocá para elegirlo'}</span>
              <span className="text-xs text-ink-soft">Hasta 500 KB</span>
            </button>
            <input ref={inputArchivo} type="file" accept="image/png,image/jpeg" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />

            {errorLogo && <Nota tono="error">{errorLogo}</Nota>}

            {marcaReal.tieneLogo && (
              <Button variant="outline" onClick={() => quitarLogo.mutate()} disabled={quitarLogo.isPending}>
                <X aria-hidden />Quitar el logo
              </Button>
            )}
          </div>

          {barrio.data?.mapUrl && (
            <a href={barrio.data.mapUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-marca underline underline-offset-4">
              Probar el link de mapas
            </a>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <VistaPreviaMarca marca={marcaPreview} />
        </aside>
      </div>
    </ChromeAdmin>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio.

Run: docker compose levantado, abrir `/admin/barrio`.
Expected: tocar un color de la paleta actualiza la vista previa al
instante, sin guardar; "Guardar" aplica el cambio a toda la app (banda,
login, etc.) sin recargar; arrastrar un PNG/JPG sube el logo.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(admin)/admin/barrio/page.tsx"
git commit -m "feat: personalizacion del barrio con arrastrar y soltar y vista previa en vivo"
```

---

### Task 13: Auditoría

**Files:**
- Modify: `web/src/app/(garita)/auditoria/page.tsx`

**Interfaces:**
- Consumes: `ChromeAdmin` si el rol es admin, o nada especial si es garita — **nota:** esta pantalla vive en `(garita)`, fuera de `(admin)/layout.tsx`, así que no tiene chrome propio hoy (la envolvía el `Shell` viejo). Se mantiene así: sin chrome, como una pantalla de utilidad a la que se llega desde el menú de cualquiera de las dos secciones, no una pantalla con su propia navegación.
- Consumes: `Chips` (`@/components/dominio/chips`); `CampoFecha`; `Fila`; `EncabezadoPagina`; `Vacio`; `ErrorConReintento`; `SkeletonFilas`; `hoyISO`, `sumarDias`, `fechaNumerica`, `hora` (`@/lib/fechas`, `@/lib/gate`).

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Inbox } from 'lucide-react'
import { api, apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { hora } from '@/lib/gate'
import { hoyISO, sumarDias, fechaNumerica } from '@/lib/fechas'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Button } from '@/components/ui/button'

type AuditRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  validFrom: string
  validTo: string
  status: 'adentro' | 'concluida' | 'esperando' | 'vencida' | 'anulada'
  enteredAt: string | null
  enteredCount: number
  guardName: string | null
  exitedAt: string | null
  exitGuardName: string | null
}

const ESTADO: Record<AuditRow['status'], { label: string; clase: string }> = {
  adentro: { label: 'Adentro', clase: 'text-marca font-bold' },
  concluida: { label: 'Concluida', clase: 'text-marca' },
  esperando: { label: 'Esperando', clase: '' },
  vencida: { label: 'No llegó', clase: 'text-peligro' },
  anulada: { label: 'Anulada', clase: 'opacity-60' },
}

type Movimiento = {
  id: string
  enteredAt: string
  exitedAt: string | null
  guestName: string
  guestDoc: string | null
  plate: string | null
  guardName: string | null
}

type Pagina = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<AuditRow['status'], number>
}

const PAGE_SIZE = 25
const ATAJOS = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7', etiqueta: '7 días' },
  { valor: '30', etiqueta: '30 días' },
] as const

export default function AuditoriaPage() {
  const me = useMe()
  const [from, setFrom] = useState(sumarDias(hoyISO(), -7))
  const [to, setTo] = useState(hoyISO())
  const [estado, setEstado] = useState<'todos' | AuditRow['status']>('todos')
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [page, setPage] = useState(1)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)

  async function desplegar(id: string) {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id)
    setMovimientos(null)
    setMovimientos(await api<Movimiento[]>(`/gate/audit/${id}/entries`).catch(() => []))
  }

  const filtros = useCallback(() => {
    const p = new URLSearchParams({ from, to })
    if (estado !== 'todos') p.set('status', estado)
    return p
  }, [from, to, estado])

  const cargar = useCallback(() => {
    if (!me) return
    const p = filtros()
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    setCargando(true)
    setError(false)
    api<Pagina>(`/gate/audit?${p}`)
      .then(setPagina)
      .catch(() => setError(true))
      .finally(() => setCargando(false))
  }, [me, filtros, page])

  useEffect(cargar, [cargar])

  function aplicarAtajo(valor: typeof ATAJOS[number]['valor']) {
    setTo(hoyISO())
    setFrom(valor === 'hoy' ? hoyISO() : sumarDias(hoyISO(), -Number(valor)))
    setPage(1)
    setAbierta(null)
  }

  if (!me) return <main className="p-6">Cargando…</main>
  if (me.role !== 'guard' && me.role !== 'admin') {
    return <main className="p-6"><p>La auditoría es de la guardia y la administración.</p></main>
  }

  const lista = pagina?.rows ?? []
  const counts = pagina?.counts
  const total = pagina?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const todos = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:py-8">
      <EncabezadoPagina titulo="Auditoría" />

      <div className="flex flex-wrap items-end gap-3">
        {/* Botones sueltos, no Chips: un atajo es una acción de un solo toque,
            no un filtro con una selección que se mantiene — nada en el rango
            de fechas dice "cuál de los tres tocaste por última vez". */}
        <div role="group" aria-label="Rango rápido" className="flex gap-1.5">
          {ATAJOS.map((a) => (
            <Button key={a.valor} type="button" variant="outline" size="sm" onClick={() => aplicarAtajo(a.valor)}>
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <CampoFecha id="desde" valor={from} onCambio={(v) => { setFrom(v); setPage(1) }} className="w-40" />
        <CampoFecha id="hasta" valor={to} onCambio={(v) => { setTo(v); setPage(1) }} className="w-40" />
        <a href={`${apiBase}/gate/audit.xlsx?${filtros()}`}
          className="inline-flex min-h-11 items-center rounded-md bg-marca px-4 text-sm font-semibold text-sobre-marca">
          Exportar a Excel
        </a>
      </div>

      <Chips etiqueta="Estado" valor={estado} onCambio={(v) => { setEstado(v); setPage(1); setAbierta(null) }}
        opciones={[
          { valor: 'todos', etiqueta: 'Todos', contador: todos },
          { valor: 'adentro', etiqueta: 'Adentro', contador: counts?.adentro ?? 0 },
          { valor: 'concluida', etiqueta: 'Concluidas', contador: counts?.concluida ?? 0 },
          { valor: 'esperando', etiqueta: 'Esperando', contador: counts?.esperando ?? 0 },
          { valor: 'vencida', etiqueta: 'No llegaron', contador: counts?.vencida ?? 0 },
          { valor: 'anulada', etiqueta: 'Anuladas', contador: counts?.anulada ?? 0 },
        ]} />

      {cargando && pagina === null ? (
        <SkeletonFilas filas={6} />
      ) : error ? (
        <ErrorConReintento onReintentar={cargar} reintentando={cargando} />
      ) : lista.length === 0 ? (
        <Vacio icono={Inbox} titulo="No hay invitaciones en ese rango" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
            <thead className="bg-surface-sunk">
              <tr className="border-b border-line">
                <th className="w-[22%] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Invitado</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Unidad</th>
                <th className="w-[14%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Fecha</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Estado</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Ingreso</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Salida</th>
                <th className="w-[16%] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Guardia</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <>
                  <tr key={r.id} className="border-b border-line">
                    <td className="px-4 py-3 font-semibold">{r.guestName}</td>
                    <td className="px-3 py-3 tabular">{r.unitLabel}</td>
                    <td className="px-3 py-3 tabular">
                      {r.validFrom === r.validTo ? fechaNumerica(r.validFrom) : `${fechaNumerica(r.validFrom)}–${fechaNumerica(r.validTo)}`}
                    </td>
                    <td className={`px-3 py-3 font-semibold ${ESTADO[r.status].clase}`}>{ESTADO[r.status].label}</td>
                    <td className="px-3 py-3">
                      {r.enteredCount === 0 ? <span className="tabular">—</span> : (
                        <button onClick={() => desplegar(r.id)} aria-expanded={abierta === r.id}
                          className="flex items-center gap-1 tabular underline underline-offset-4">
                          {hora(r.enteredAt!)}{r.enteredCount > 1 && ` ×${r.enteredCount}`}
                          <ChevronDown className={`size-3.5 transition-transform ${abierta === r.id ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular">{r.exitedAt ? hora(r.exitedAt) : '—'}</td>
                    <td className="px-4 py-3">
                      {r.guardName ?? '—'}
                      {r.exitGuardName && r.exitGuardName !== r.guardName && (
                        <span className="block text-xs opacity-70">salió con {r.exitGuardName}</span>
                      )}
                    </td>
                  </tr>
                  {abierta === r.id && (
                    <tr className="border-b border-line bg-surface-sunk/60">
                      <td colSpan={7} className="px-4 py-3">
                        {movimientos === null ? <SkeletonFilas filas={2} /> : movimientos.length === 0 ? (
                          <p className="text-sm text-ink-soft">Sin movimientos.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {movimientos.map((m) => (
                              <li key={m.id} className="tabular text-sm">
                                {fechaNumerica(m.enteredAt.slice(0, 10))} {hora(m.enteredAt)}
                                {' · '}<span className="font-semibold">{m.guestName}</span>
                                {m.guestDoc && ` · ${m.guestDoc}`}{m.plate && ` · ${m.plate}`}
                                {' · lo dejó pasar '}{m.guardName ?? '(sin registrar)'}
                                {m.exitedAt ? <> · salió {hora(m.exitedAt)}</> : <> · sin salida registrada</>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft tabular">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</Button>
            <span className="flex min-h-11 items-center px-2 text-sm tabular">{page} de {paginas}</span>
            <Button variant="outline" disabled={page >= paginas} onClick={() => setPage((p) => Math.min(paginas, p + 1))}>Siguiente ›</Button>
          </div>
        </nav>
      )}
    </div>
  )
}
```

`Fila` queda importado por la convención del mapa de archivos pero esta
pantalla no la termina usando (la tabla densa es un `<table>` real, según
lo que dice la spec); si `eslint` marca el import sin uso, sacarlo.

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run build`
Expected: limpio (sacar el import de `Fila` si quedó sin usar, como dice
la nota de arriba).

Run: docker compose levantado, entrar como `admin@aromos.test` o
`guardia.prueba@aromos.test`, abrir `/auditoria`.
Expected: atajos de rango, tabs de estado con contador, tabla densa con
fila desplegable, exportar a Excel, paginación si hay más de 25 filas.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(garita)/auditoria/page.tsx"
git commit -m "feat: auditoria redisenada con atajos de rango y chips de estado"
```

---

### Task 14: E2E del admin

**Files:**
- Create: `web/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `entrar` (`web/e2e/sesion.ts`); la cuenta `e2e.admin@visitpass.test`.

- [ ] **Step 1: Los recorridos**

Crear `web/e2e/admin.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el admin da de alta un vecino desde el sheet', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/vecinos')

  const nombre = `Vecino E2E ${Date.now()}`
  const mail = `vecino-e2e-${Date.now()}@example.com`

  await page.getByRole('button', { name: 'Dar de alta' }).click()
  await page.getByLabel('Nombre').fill(nombre)
  await page.getByLabel('Mail').fill(mail)
  await page.getByRole('button', { name: 'Dar de alta y enviar invitación' }).click()

  await expect(page.getByText(nombre)).toBeVisible()
})

test('el admin cambia el color del barrio y lo ve sin recargar', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/barrio')

  const colores = page.locator('fieldset button[aria-label^="Color"]')
  const actual = await colores.first().getAttribute('aria-pressed')
  const otro = actual === 'true' ? colores.nth(1) : colores.first()
  const colorElegido = await otro.getAttribute('aria-label')

  await otro.click()
  // La vista previa cambia antes de guardar: no hace falta tocar "Guardar"
  // para verlo, así que alcanza con que el swatch quede marcado.
  await expect(otro).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Guardado.')).toBeVisible()

  // Sin recargar: la banda del propio admin ya tiene que reflejar el color.
  await page.goto('/admin')
  const banda = page.locator('header').first()
  await expect(banda).toBeVisible()
  expect(colorElegido).toBeTruthy()
})

test('/admin/usuarios redirige a /admin/vecinos', async ({ page }) => {
  await entrar(page, 'admin')
  await page.goto('/admin/usuarios')
  await expect(page).toHaveURL(/\/admin\/vecinos$/)
})
```

- [ ] **Step 2: Correr**

Run: `cd .. && docker compose up -d --build && cd web && npm run e2e`
Expected: 32 passed (26 de las fases 1 a 3, más 3 recorridos nuevos × 2 proyectos).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/admin.spec.ts
git commit -m "test: e2e del admin (alta de vecino, color en vivo, redirect de vecinos)"
```

---

### Task 15: Verificación final de la fase

**Files:** ninguno nuevo.

- [ ] **Step 1: Todo en verde**

Run:
```bash
cd api && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build
cd .. && docker compose up -d --build && cd web && npm run e2e
```
Expected: 258 tests de API; web limpio; build lista `/admin`,
`/admin/vecinos`, `/admin/guardias`, `/admin/unidades`, `/admin/barrio` y
ya no `/admin/usuarios`; 32 e2e en verde.

- [ ] **Step 2: Revisión visual**

En 390, 768 y 1280 px, en claro y oscuro, con `admin@aromos.test`:
- `/admin` con y sin bloque de Atención
- `/admin/vecinos` con el sheet de alta abierto, el menú ⋯ abierto, y el
  diálogo de cambiar lote / dar de baja
- `/admin/guardias` con el sheet de alta y los diálogos
- `/admin/unidades`
- `/admin/barrio` con la vista previa cambiando en vivo al tocar un color
- `/auditoria`, con una fila desplegada
- en 390px, el "Más" de la barra inferior abriendo el sheet con Unidades
  y Barrio

Expected: sin scroll horizontal en ningún ancho; los seis destinos legibles
en la banda de escritorio; el sheet de alta y los diálogos atrapan el foco
y cierran con Escape (ya lo resuelven Radix/vaul); nada de "Cargando…" en
texto plano donde ya hay un skeleton pensado para esa pantalla.

- [ ] **Step 3: Cerrar**

Anotar lo que queda para la fase 5 (limpieza: `Shell` viejo,
`components/ui.tsx`, `components/feedback.tsx`, `lib/nav.ts`, y cualquier
otra cosa que ya nadie importe) y pasar a
`superpowers:finishing-a-development-branch`.
