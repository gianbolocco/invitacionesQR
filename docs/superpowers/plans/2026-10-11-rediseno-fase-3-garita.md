# Rediseño · Fase 3 (Garita) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer con el diseño nuevo todo lo que usa el guardia: la pantalla "Hoy" (agenda, buscador, acceso al escáner), el escáner de QR y el veredicto de ingreso/egreso, que pasa de ser estado en memoria a ser una ruta propia.

**Architecture:** Mismo patrón que la fase 2 (vecino): componentes de dominio ya existentes (`Fila`, `EstadoTag`, `CampoFecha`, `BarraSeccion`, `Marca`, `SelectorTema`) más una capa de datos con TanStack Query (`lib/queries/garita.ts`) que envuelve las funciones ya existentes de `lib/gate.ts`. A diferencia de `ChromeVecino`, `ChromeGarita` **no** vive en `layout.tsx`: solo lo usa la pantalla "Hoy". Escanear y el veredicto siguen siendo pantallas a pantalla completa, sin chrome, igual que hoy — eso es lo que permite que el veredicto "se coma la pantalla entera".

**Tech Stack:** Next 16.3, React 19.2, Tailwind v4, TanStack Query v5, motion, sonner, lucide-react, html5-qrcode (sin cambios), Playwright.

Spec: `docs/superpowers/specs/2026-10-11-rediseno-fase-3-garita-design.md`.

**Desvío respecto del texto de la spec:** la spec dice "Mobile: título con el día (`EncabezadoPagina`), buscador, agenda". `AgendaDia` ya trae su propio título con el día y la navegación de fechas (heredado de `components/agenda.tsx`, que reemplaza). Agregar un `EncabezadoPagina` aparte duplicaría ese título. La pantalla "Hoy" no lleva un encabezado propio — exactamente como hace el código actual — y el título del día vive una sola vez, dentro de `AgendaDia`.

**Comportamiento no especificado que fija este plan:** toda salida del veredicto (cancelar, "Volver" en un rechazo, y la confirmación tras registrar un movimiento, con o sin deshacer) navega a `/garita/escanear`, nunca a `/garita`. Es así tanto si se llegó al veredicto escaneando como buscando: después de atender a cualquier invitado, lo natural en la barrera es quedar listo para el siguiente auto. Un solo destino de salida, no dos casos a mantener.

## Global Constraints

- Textos de interfaz en español rioplatense con voseo. Comentarios en español, explicando el porqué.
- Objetivos táctiles de al menos 44px (`h-11`) en todo lo que se toca.
- Ningún color de marca escrito a mano: solo tokens (lo controla `npm run check`).
- Toda URL de la API sale de `apiBase` o de `api()` (`web/src/lib/api.ts`).
- `prefers-reduced-motion`: nada se desplaza; quedan solo fundidos (ya cubierto por `MotionConfig` global y el CSS de `globals.css`).
- El breakpoint del layout de dos columnas de la garita es **768px** (`md:` de Tailwind), no 640px (`sm:`) como usa el chrome del vecino: la columna derecha necesita más ancho para no apretarse.
- Mantener `html5-qrcode` para el lector — no se evalúan alternativas en esta fase.
- Sin atajos de teclado (`E`, `/`) en esta fase.
- `/auditoria` no se toca: sigue con el `Shell` viejo hasta la fase 4.
- Sin cambios en la API: todo sale de endpoints que ya existen (`/gate/agenda`, `/gate/search`, `/gate/check/:token`, `/gate/invitation/:id`, `/gate/entries`, `/gate/exits`, `/gate/entries/:id/undo`).
- Al cerrar cada tarea: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check` limpio.
- No matar procesos de Node globalmente (nunca `taskkill //IM node.exe`).
- Commits con la línea `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Stack de desarrollo: `docker compose up -d --build` desde la raíz (web en :3000, api en :8080). Cuenta de desarrollo de garita: `guardia.prueba@aromos.test`, contraseña `smoke-test-pass-larga`. Cuentas e2e con contraseña `e2e-contrasena-larga`: `e2e.vecino@visitpass.test`, `e2e.guardia@visitpass.test`.

## Mapa de archivos

```
web/src/lib/queries/garita.ts             capa de datos: agenda, búsqueda, veredicto, mutaciones
web/src/lib/ultimos-movimientos.ts (+ .check.ts)   función pura: agenda → eventos recientes
web/src/components/garita/chrome.tsx      ChromeGarita
web/src/components/garita/agenda-dia.tsx  reemplaza components/agenda.tsx
web/src/components/garita/buscar-invitado.tsx
web/src/components/garita/ultimos-movimientos.tsx
web/src/app/(garita)/garita/invitacion/[id]/page.tsx   el veredicto, reemplaza components/verdict.tsx
web/src/app/(garita)/garita/escanear/page.tsx    navega al veredicto en vez de guardar estado
web/src/app/(garita)/garita/page.tsx      "Hoy", reescrita
web/e2e/garita.spec.ts

Se borran (en la Tarea 8, cuando ya no quede ningún importador):
  web/src/components/agenda.tsx
  web/src/components/verdict.tsx
```

---

### Task 1: Capa de datos de la garita

**Files:**
- Create: `web/src/lib/queries/garita.ts`

**Interfaces:**
- Consumes: `porToken`, `porId`, `registrarIngreso`, `registrarEgreso`, `deshacer`, `MOTIVO`, y los tipos `Hit`, `Resultado`, `Movimiento` de `@/lib/gate` (sin cambios). `api` de `@/lib/api`.
- Produces:
  - `type AgendaRow = { id: string; guestName: string; guestDoc: string | null; plate: string | null; kind: 'visita' | 'frecuente' | 'proveedor'; unitLabel: string; inviterName: string; capacity: number; enteredCount: number; lastEntryAt: string | null; lastExitAt: string | null; adentro: boolean }`
  - `claves = { agenda(fecha), busqueda(q), veredicto(id) }`
  - `useAgenda(fecha: string)` → `UseQueryResult<AgendaRow[]>`
  - `useBusqueda(q: string)` → `UseQueryResult<Hit[]>`, deshabilitada si `q` está vacío
  - `useVeredicto(id: string)` → `UseQueryResult<Resultado>`
  - `usePrecargarVeredicto()` → `(id: string, resultado: Resultado) => void`
  - `useRegistrarIngreso()`, `useRegistrarEgreso()` → mutaciones sobre `registrarIngreso`/`registrarEgreso`
  - `useDeshacerMovimiento()` → mutación `(entryId: string) => Promise<{ deshecho: 'ingreso' | 'egreso' }>`

- [ ] **Step 1: Crear el archivo**

```ts
'use client'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  porId, registrarIngreso, registrarEgreso, deshacer,
  type Hit, type Resultado,
} from '@/lib/gate'

export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor'
  unitLabel: string
  inviterName: string
  capacity: number
  enteredCount: number
  lastEntryAt: string | null
  lastExitAt: string | null
  adentro: boolean
}

/*
 * Todas cuelgan de ['garita']: después de un ingreso, un egreso o un
 * deshacer, se invalida ese prefijo entero y la agenda, la búsqueda y
 * "últimos movimientos" quedan al día juntas.
 */
export const claves = {
  agenda: (fecha: string) => ['garita', 'agenda', fecha] as const,
  busqueda: (q: string) => ['garita', 'busqueda', q] as const,
  veredicto: (id: string) => ['garita', 'veredicto', id] as const,
}

export function useAgenda(fecha: string) {
  return useQuery({
    queryKey: claves.agenda(fecha),
    queryFn: ({ signal }) => api<AgendaRow[]>(`/gate/agenda?date=${fecha}`, { signal }),
  })
}

export function useBusqueda(q: string) {
  return useQuery({
    queryKey: claves.busqueda(q),
    queryFn: ({ signal }) => api<Hit[]>(`/gate/search?q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length > 0,
  })
}

export function useVeredicto(id: string) {
  return useQuery({
    queryKey: claves.veredicto(id),
    queryFn: () => porId(id),
  })
}

/**
 * El escáner ya trae el resultado completo al validar el token. Se precarga
 * acá antes de navegar, así la pantalla del veredicto no lo vuelve a pedir
 * ni parpadea con un skeleton que ya tiene los datos.
 */
export function usePrecargarVeredicto() {
  const qc = useQueryClient()
  return (id: string, resultado: Resultado) => qc.setQueryData(claves.veredicto(id), resultado)
}

function invalidarGarita(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: ['garita'] })
}

export function useRegistrarIngreso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: registrarIngreso,
    onError: () => toast.error('No se pudo registrar. Probá de nuevo.'),
    onSettled: () => invalidarGarita(qc),
  })
}

export function useRegistrarEgreso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: registrarEgreso,
    onError: () => toast.error('No se pudo registrar. Probá de nuevo.'),
    onSettled: () => invalidarGarita(qc),
  })
}

export function useDeshacerMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => deshacer(entryId),
    onError: () => toast.error('No se pudo deshacer. Revisalo en la auditoría.'),
    onSettled: () => invalidarGarita(qc),
  })
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. Estos hooks todavía no los usa nadie: se prueban de punta a punta en las tareas 3 a 8.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/queries/garita.ts
git commit -m "feat: capa de datos de la garita (agenda, busqueda, veredicto, mutaciones)"
```

---

### Task 2: `ChromeGarita`

**Files:**
- Create: `web/src/components/garita/chrome.tsx`

**Interfaces:**
- Consumes: `useSesion` (`@/lib/sesion-contexto`), `logout` (`@/lib/session`), `Marca`, `SelectorTema`, `BarraSeccion` + `ItemBarra` (`@/components/dominio/barra-seccion`), `cn` (`@/lib/utils`).
- Produces: `ChromeGarita({ children }: { children: React.ReactNode })`.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, LogOut, ScanLine, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, type ItemBarra } from '@/components/dominio/barra-seccion'
import { cn } from '@/lib/utils'

/**
 * El marco de la garita: banda del barrio, quién está de turno — se AFIRMA,
 * no se elige: hace visible una sesión que quedó abierta del turno
 * anterior — y la navegación. El escáner va en el centro de la barra
 * inferior en mobile; en escritorio, el botón grande vive en la columna
 * derecha de "Hoy" (no acá), así que no es parte de `items`.
 *
 * A diferencia de `ChromeVecino`, esto NO se usa desde el layout de la
 * sección: solo lo monta la pantalla "Hoy". Escanear y el veredicto quedan
 * a pantalla completa, sin este marco.
 */
export function ChromeGarita({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()

  const items: ItemBarra[] = [
    { href: '/garita', etiqueta: 'Hoy', icono: CalendarDays, activo: path === '/garita' },
    { href: '/auditoria', etiqueta: 'Auditoría', icono: ClipboardList, activo: path.startsWith('/auditoria') },
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 bg-marca text-sobre-marca">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/garita" aria-label="Inicio" className="min-w-0"><Marca variante="banda" /></Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={i.activo ? 'page' : undefined}
                className={cn('rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
                  i.activo ? 'bg-white/20' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                {i.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm opacity-85 sm:inline">{me.name}</span>
            {me.role === 'admin' && (
              <Link href="/admin" aria-label="Ir a administración"
                className="grid size-9 place-items-center rounded-full hover:bg-white/10">
                <Settings2 className="size-[18px]" aria-hidden />
              </Link>
            )}
            <SelectorTema />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="grid size-9 place-items-center rounded-full text-sobre-marca hover:bg-white/10">
              <LogOut className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>

      <BarraSeccion items={items} central={
        <Link href="/garita/escanear" aria-label="Escanear QR"
          className="grid size-14 -translate-y-5 place-items-center rounded-full bg-marca text-sobre-marca shadow-flotante">
          <ScanLine className="size-6" aria-hidden />
        </Link>
      } />
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. No se usa todavía (se monta en la Tarea 8).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/garita/chrome.tsx
git commit -m "feat: marco de la garita con banda del barrio y escaner central en mobile"
```

---

### Task 3: `AgendaDia`

**Files:**
- Create: `web/src/components/garita/agenda-dia.tsx`

**Interfaces:**
- Consumes: `useAgenda`, `type AgendaRow` (Tarea 1); `Fila`, `EstadoTag`, `CampoFecha`, `ErrorConReintento`, `SkeletonFilas`, `Vacio` (ya existen); `Button` (`@/components/ui/button`); `hoyISO`, `sumarDias`, `tituloDia`, `hora` (`@/lib/fechas`).
- Produces: `AgendaDia({ onAbrir }: { onAbrir: (id: string) => void })`.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'
import { useState } from 'react'
import { CalendarX, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag, type Estado } from '@/components/dominio/estado-tag'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { hoyISO, sumarDias, tituloDia, hora } from '@/lib/fechas'
import { useAgenda, type AgendaRow } from '@/lib/queries/garita'

function filaDe(r: AgendaRow, onAbrir: (id: string) => void) {
  /*
   * `adentro` se pregunta PRIMERO, antes que `enteredCount`. Alguien que
   * entró ayer y nadie le registró la salida tiene enteredCount 0 para hoy
   * pero sigue adentro: preguntando al revés aparecería como "Esperando".
   */
  const estado: Estado = r.adentro ? 'adentro' : r.enteredCount === 0 ? 'esperando' : 'salio'
  const detalle = estado === 'adentro'
    ? (r.lastEntryAt ? hora(r.lastEntryAt) : undefined)
    : estado === 'salio'
      ? (r.lastExitAt ? hora(r.lastExitAt) : undefined)
      : undefined
  const meta = [
    r.unitLabel,
    `invita ${r.inviterName}`,
    r.plate,
    r.capacity > 1 && r.enteredCount > 1 ? `${r.enteredCount} ingresos hoy` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Fila key={r.id} titulo={r.guestName} meta={meta} onClick={() => onAbrir(r.id)}
      extremo={<EstadoTag estado={estado} detalle={detalle} />} />
  )
}

/**
 * La agenda del día, en el panel en reposo de la garita.
 *
 * La división principal es esperando / ya entraron, no alfabética: es la
 * pregunta que el guardia tiene a las 21, ¿quién falta? Los frecuentes van
 * aparte y colapsados, porque aparecen todos los días y el guardia deja de
 * leerlos.
 */
export function AgendaDia({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [verFrecuentes, setVerFrecuentes] = useState(false)
  const q = useAgenda(fecha)

  const todas = q.data ?? []
  const frecuentes = todas.filter((r) => r.kind === 'frecuente')
  const personas = todas.filter((r) => r.kind !== 'frecuente')
  const esperando = personas.filter((r) => !r.adentro && r.enteredCount === 0)
  const entraron = personas.filter((r) => r.adentro || r.enteredCount > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Día anterior"
          onClick={() => setFecha((f) => sumarDias(f, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => setFecha(hoyISO())}>Hoy</Button>
        <Button variant="outline" size="icon" aria-label="Día siguiente"
          onClick={() => setFecha((f) => sumarDias(f, 1))}>
          <ChevronRight aria-hidden />
        </Button>
        <CampoFecha id="agenda-fecha" valor={fecha} onCambio={setFecha} className="w-44" />
      </div>

      <h2 className="font-display text-2xl font-extrabold capitalize tracking-[-0.02em]">{tituloDia(fecha)}</h2>

      {q.isPending ? (
        <SkeletonFilas filas={4} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : todas.length === 0 ? (
        <Vacio icono={CalendarX} titulo="Nadie tiene autorización para este día" />
      ) : (
        <>
          {esperando.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Esperando ({esperando.length})
              </p>
              <div>{esperando.map((r) => filaDe(r, onAbrir))}</div>
            </section>
          )}
          {entraron.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Ya entraron ({entraron.length})
              </p>
              <div className="opacity-70">{entraron.map((r) => filaDe(r, onAbrir))}</div>
            </section>
          )}
          {frecuentes.length > 0 && (
            <section className="flex flex-col gap-2">
              <Button variant="ghost" size="sm" className="self-start"
                onClick={() => setVerFrecuentes((v) => !v)}>
                {verFrecuentes ? 'Ocultar' : 'Mostrar'} frecuentes habilitados ({frecuentes.length})
              </Button>
              {verFrecuentes && <div>{frecuentes.map((r) => filaDe(r, onAbrir))}</div>}
            </section>
          )}
        </>
      )}
    </div>
  )
}
```

Confirmado: `estado-tag.tsx` exporta `export type Estado` y `export function EstadoTag`, así que el import tal como está arriba es correcto.

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. No se usa todavía (se monta en la Tarea 8).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/garita/agenda-dia.tsx
git commit -m "feat: agenda del dia con Fila, EstadoTag y CampoFecha"
```

---

### Task 4: `BuscarInvitado`

**Files:**
- Create: `web/src/components/garita/buscar-invitado.tsx`

**Interfaces:**
- Consumes: `useBusqueda` (Tarea 1); `useDemora` (`@/lib/use-demora`); `Fila`, `EstadoTag`; `Input` (`@/components/ui/input`).
- Produces: `BuscarInvitado({ onAbrir }: { onAbrir: (id: string) => void })`.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Fila } from '@/components/dominio/fila'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { useDemora } from '@/lib/use-demora'
import { useBusqueda } from '@/lib/queries/garita'

/** Búsqueda en vivo, sin botón: el guardia escribe y los resultados aparecen solos. */
export function BuscarInvitado({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [q, setQ] = useState('')
  const qDemorada = useDemora(q)
  const busqueda = useBusqueda(qDemorada.trim())

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Apellido, documento, unidad o patente" aria-label="Buscar invitado"
          className="h-12 pl-10 text-base" />
      </div>

      {busqueda.data?.length === 0 && (
        <p className="text-sm text-ink-soft">Sin resultados. Probá con el apellido o la unidad.</p>
      )}

      {busqueda.data && busqueda.data.length > 0 && (
        <div>
          {busqueda.data.map((h) => (
            <Fila key={h.id} titulo={h.guestName} onClick={() => onAbrir(h.id)}
              meta={[h.unitLabel, h.guestDoc, h.plate].filter(Boolean).join(' · ')}
              extremo={h.adentro ? <EstadoTag estado="adentro" /> : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio. No se usa todavía (se monta en la Tarea 8).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/garita/buscar-invitado.tsx
git commit -m "feat: busqueda de invitados en vivo para la garita"
```

---

### Task 5: Últimos movimientos

**Files:**
- Create: `web/src/lib/ultimos-movimientos.ts`, `web/src/lib/ultimos-movimientos.check.ts`, `web/src/components/garita/ultimos-movimientos.tsx`
- Modify: `web/package.json` (script `check`)

**Interfaces:**
- Consumes: `type AgendaRow` (Tarea 1); `useAgenda` (Tarea 1); `hora`, `hoyISO` (`@/lib/fechas`); `EstadoTag`.
- Produces (en `@/lib/ultimos-movimientos`): `type MovimientoAgenda = { invitationId: string; guestName: string; tipo: 'ingreso' | 'egreso'; cuando: string }`, `ultimosMovimientos(filas: Pick<AgendaRow, 'id' | 'guestName' | 'lastEntryAt' | 'lastExitAt'>[], tope?: number): MovimientoAgenda[]`.
- Produces (en `@/components/garita/ultimos-movimientos`): `UltimosMovimientos()`.

- [ ] **Step 1: El chequeo que falla**

Crear `web/src/lib/ultimos-movimientos.check.ts`:

```ts
/** `node src/lib/ultimos-movimientos.check.ts`. */
import assert from 'node:assert/strict'
import { ultimosMovimientos } from './ultimos-movimientos.ts'

const filas = [
  { id: '1', guestName: 'Martín Gómez', lastEntryAt: '2026-10-11T17:06:00Z', lastExitAt: null },
  { id: '2', guestName: 'Rosa Benítez', lastEntryAt: '2026-10-11T16:40:00Z', lastExitAt: '2026-10-11T17:40:00Z' },
  { id: '3', guestName: 'Sofía Ledesma', lastEntryAt: null, lastExitAt: null },
]

const eventos = ultimosMovimientos(filas)
// Dos filas con movimiento dan dos o tres eventos (Rosa entró Y salió): el
// más reciente primero.
assert.equal(eventos.length, 3)
assert.deepEqual(eventos[0], { invitationId: '2', guestName: 'Rosa Benítez', tipo: 'egreso', cuando: '2026-10-11T17:40:00Z' })
assert.deepEqual(eventos[1], { invitationId: '1', guestName: 'Martín Gómez', tipo: 'ingreso', cuando: '2026-10-11T17:06:00Z' })
assert.deepEqual(eventos[2], { invitationId: '2', guestName: 'Rosa Benítez', tipo: 'ingreso', cuando: '2026-10-11T16:40:00Z' })

// El tope corta, no filtra: sigue siendo el más reciente primero.
assert.equal(ultimosMovimientos(filas, 1).length, 1)
assert.equal(ultimosMovimientos(filas, 1)[0]?.tipo, 'egreso')

assert.deepEqual(ultimosMovimientos([]), [])

console.log('ultimos-movimientos: ok')
```

En `web/package.json`, el script `check` pasa a:

```json
    "check": "node src/lib/nav.check.ts && node src/lib/fechas.check.ts && node src/lib/estado-invitacion.check.ts && node src/lib/ultimos-movimientos.check.ts && node scripts/colores.check.mjs",
```

Run: `cd web && npm run check`
Expected: FAIL con `Cannot find module` para `ultimos-movimientos.ts`.

- [ ] **Step 2: Implementar**

Crear `web/src/lib/ultimos-movimientos.ts` (sin imports, para que Node lo corra directo):

```ts
export type MovimientoAgenda = {
  invitationId: string
  guestName: string
  tipo: 'ingreso' | 'egreso'
  cuando: string
}

/**
 * Los últimos ingresos y egresos del día, para el panel de la columna
 * derecha en escritorio. Se arma de las filas que ya trae `/gate/agenda`
 * (cada una ya sabe su último ingreso y su último egreso): no hace falta un
 * endpoint nuevo.
 */
export function ultimosMovimientos(
  filas: { id: string; guestName: string; lastEntryAt: string | null; lastExitAt: string | null }[],
  tope = 5,
): MovimientoAgenda[] {
  const eventos: MovimientoAgenda[] = []
  for (const f of filas) {
    if (f.lastEntryAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'ingreso', cuando: f.lastEntryAt })
    if (f.lastExitAt) eventos.push({ invitationId: f.id, guestName: f.guestName, tipo: 'egreso', cuando: f.lastExitAt })
  }
  return eventos.sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, tope)
}
```

Run: `cd web && npm run check`
Expected: `nav: ok`, `fechas: ok`, `estado-invitacion: ok`, `ultimos-movimientos: ok`, `colores: ok`.

- [ ] **Step 3: El componente**

Crear `web/src/components/garita/ultimos-movimientos.tsx`:

```tsx
'use client'
import { History } from 'lucide-react'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { hora, hoyISO } from '@/lib/fechas'
import { ultimosMovimientos } from '@/lib/ultimos-movimientos'
import { useAgenda } from '@/lib/queries/garita'

/** Ingresos y egresos recientes, para no perder de vista lo que acaba de pasar. */
export function UltimosMovimientos() {
  const q = useAgenda(hoyISO())
  const eventos = ultimosMovimientos(q.data ?? [])

  if (eventos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        <History className="size-3.5" aria-hidden />Últimos movimientos
      </p>
      <ul className="flex flex-col gap-1.5">
        {eventos.map((e) => (
          <li key={`${e.invitationId}-${e.tipo}-${e.cuando}`} className="flex items-center gap-2 text-sm">
            <EstadoTag estado={e.tipo === 'ingreso' ? 'adentro' : 'salio'} />
            <span className="min-w-0 flex-1 truncate font-medium">{e.guestName}</span>
            <span className="shrink-0 text-ink-soft tabular">{hora(e.cuando)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Verificar y commit**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check`
Expected: limpio.

```bash
git add web/src/lib/ultimos-movimientos.ts web/src/lib/ultimos-movimientos.check.ts web/src/components/garita/ultimos-movimientos.tsx web/package.json
git commit -m "feat: ultimos movimientos, derivados de la agenda sin tocar la API"
```

---

### Task 6: El veredicto como ruta

**Files:**
- Create: `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`

**Interfaces:**
- Consumes: `useVeredicto`, `useRegistrarIngreso`, `useRegistrarEgreso`, `useDeshacerMovimiento` (Tarea 1); `MOTIVO`, `hora`, `type Movimiento` (`@/lib/gate`, sin cambios); `ErrorConReintento`; `Input`.
- Produces: la ruta `/garita/invitacion/[id]`. Cualquier salida navega a `/garita/escanear` (ver "Comportamiento no especificado" al principio del plan).

- [ ] **Step 1: Crear la ruta**

Crear el directorio y el archivo `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`:

```tsx
'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { MOTIVO, hora, type Movimiento } from '@/lib/gate'
import {
  useDeshacerMovimiento, useRegistrarEgreso, useRegistrarIngreso, useVeredicto,
} from '@/lib/queries/garita'
import { Input } from '@/components/ui/input'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'

/** Segundos que la confirmación espera antes de volver sola al escáner. */
const SEGUNDOS_CONFIRMACION = 8

/**
 * Lo que se registró, con un Deshacer al alcance. Vuelve sola al escáner
 * para que el camino común no sume ni un toque; "Siguiente" la saltea para
 * el que está despachando una fila.
 */
function Confirmacion({ movimiento, esEgreso, guestName, onListo, onDeshacer, deshaciendo }: {
  movimiento: Movimiento
  esEgreso: boolean
  guestName: string
  onListo: () => void
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  const [restan, setRestan] = useState(SEGUNDOS_CONFIRMACION)

  useEffect(() => {
    const t = setInterval(() => setRestan((n) => n - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (restan <= 0) onListo() }, [restan, onListo])

  const cuando = esEgreso ? movimiento.exitedAt : movimiento.enteredAt

  return (
    <main aria-live="polite" className="flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden bg-pass-field p-6 text-pass-ink sm:p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Registrado</p>
        <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
          className="font-display mt-1 text-4xl font-extrabold tracking-[-0.02em] sm:text-6xl">
          {esEgreso ? 'EGRESO' : 'INGRESO'}
        </motion.h1>
        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{guestName}</p>
        {cuando && <p className="mt-1 text-xl tabular opacity-80 sm:text-2xl">a las {hora(cuando)}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <button onClick={onDeshacer} disabled={deshaciendo}
          className="min-h-16 rounded border-2 border-pass-ink/40 text-xl font-bold disabled:opacity-60">
          {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
        </button>
        <button onClick={onListo} className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field">
          Siguiente ({Math.max(0, restan)})
        </button>
      </div>
    </main>
  )
}

/**
 * El veredicto se come la pantalla entera: el guardia no está usando una
 * app, está leyendo un dato a dos metros con un auto esperando.
 *
 * Tres canales, ninguno de los cuales es el color: la palabra, el "sello" de
 * entrada y la luminancia del campo. INGRESO y EGRESO comparten el campo
 * claro porque los dos significan "abrí"; se distinguen por palabra, que es
 * una lectura de segundo orden y alcanza.
 */
export default function VeredictoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const q = useVeredicto(id)
  const ingresar = useRegistrarIngreso()
  const egresar = useRegistrarEgreso()
  const deshacerMov = useDeshacerMovimiento()
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [hecho, setHecho] = useState<Movimiento | null>(null)
  const accionRef = useRef<HTMLButtonElement>(null)

  const salir = () => router.push('/garita/escanear')

  // El foco cae en el botón de acción recién cuando deja de cargar: Enter
  // registra sin tocar el mouse.
  useEffect(() => {
    if (!q.isPending) accionRef.current?.focus()
  }, [q.isPending])

  // Escape siempre vuelve. En la barrera no hay tiempo de buscar un botón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') salir() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (q.data) { setDoc(q.data.invitation.guestDoc ?? ''); setPlate(q.data.invitation.plate ?? '') }
  }, [q.data?.invitation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-escaner-fondo text-escaner-texto">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </main>
    )
  }

  if (q.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface p-6">
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      </main>
    )
  }

  const resultado = q.data
  const { invitation: inv, check, adentro } = resultado
  // Un egreso no se valida: si está adentro, sale. `check` es del ingreso.
  const esEgreso = Boolean(adentro)
  const ok = esEgreso || check.ok

  async function registrar() {
    try {
      const mov = esEgreso
        ? await egresar.mutateAsync(inv.id)
        : await ingresar.mutateAsync({
          invitationId: inv.id, guestName: inv.guestName,
          guestDoc: doc || undefined, plate: plate || undefined,
        })
      // No sale: pasa a la confirmación, que es donde vive el Deshacer.
      setHecho(mov)
    } catch {
      // El toast de error ya lo muestra la mutación.
    }
  }

  if (hecho) {
    return (
      <Confirmacion movimiento={hecho} esEgreso={esEgreso} guestName={inv.guestName}
        onListo={salir}
        onDeshacer={() => deshacerMov.mutate(hecho.id, { onSuccess: salir })}
        deshaciendo={deshacerMov.isPending} />
    )
  }

  const motivo = !ok ? MOTIVO[(check as { reason: string }).reason] ?? 'Rechazado' : ''
  const sinCupo = !ok && (check as { reason: string }).reason === 'no_capacity'
  const palabra = esEgreso ? 'EGRESO' : ok ? 'INGRESO' : 'NO PASA'
  const registrando = ingresar.isPending || egresar.isPending

  return (
    <main aria-live="assertive"
      className={`flex min-h-dvh flex-col justify-between gap-6 overflow-x-hidden p-6 sm:p-8 ${
        ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
      }`}>
      <div>
        <motion.h1 initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.9, 0.3, 1] }}
          className="font-display text-5xl font-extrabold tracking-[-0.02em] sm:text-7xl">
          {palabra}
        </motion.h1>

        {!ok && (
          <p className="mt-3 text-2xl font-semibold sm:text-3xl">
            {motivo}
            {sinCupo && resultado.lastEntryAt && (
              <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
            )}
          </p>
        )}

        <p className="mt-6 break-words text-3xl font-semibold sm:text-4xl">{inv.guestName}</p>
        <p className="mt-1 text-xl tabular opacity-80 sm:text-2xl">
          {inv.unitLabel}
          {inv.capacity > 1 && ` · ${resultado.usedCount} de ${inv.capacity} entraron`}
        </p>

        {adentro && (
          <p className="mt-2 text-xl font-semibold tabular sm:text-2xl">entró a las {hora(adentro.enteredAt)}</p>
        )}
      </div>

      {ok ? (
        <div className="flex flex-col gap-3">
          {/* Los datos se cargan al entrar, no al salir: a la salida ya están. */}
          {!esEgreso && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Documento
                <Input value={doc} onChange={(e) => setDoc(e.target.value)} className="tabular h-14 text-xl" />
              </label>
              <label className="flex flex-1 flex-col gap-1 font-semibold">
                Patente
                <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="tabular h-14 text-xl uppercase" />
              </label>
            </div>
          )}
          <button ref={accionRef} onClick={registrar} disabled={registrando}
            className="min-h-16 rounded bg-pass-ink text-xl font-bold text-pass-field disabled:opacity-60">
            {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso' : 'Registrar ingreso'}
          </button>
          <button onClick={salir} className="underline underline-offset-4 opacity-70">
            Cancelar (Esc)
          </button>
        </div>
      ) : (
        <button ref={accionRef} onClick={salir}
          className="min-h-16 rounded border-2 border-deny-ink/40 text-xl font-bold">
          Volver (Esc)
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verificar con una invitación real**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`. Conseguir el id de una invitación vigente:
```bash
curl -s -c /tmp/cjg -H 'Content-Type: application/json' \
  -d '{"email":"guardia.prueba@aromos.test","password":"smoke-test-pass-larga"}' \
  http://localhost:8080/auth/login >/dev/null
curl -s -b /tmp/cjg 'http://localhost:8080/gate/search?q=a' | head -c 400
```
Abrir `http://localhost:3000/garita/invitacion/<id>` en el navegador (con sesión de `guardia.prueba@aromos.test` ya iniciada).
Expected: pantalla completa INGRESO o NO PASA según corresponda, con los campos Documento/Patente si aplica. Registrar: pasa a la confirmación con el contador; "Deshacer" revierte y navega a `/garita/escanear`; dejar que el contador llegue a 0 también navega ahí.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(garita)/garita/invitacion"
git commit -m "feat: el veredicto pasa a ser una ruta, ya no estado en memoria"
```

---

### Task 7: Escanear navega al veredicto

**Files:**
- Modify: `web/src/app/(garita)/garita/escanear/page.tsx`

**Interfaces:**
- Consumes: `usePrecargarVeredicto` (Tarea 1); `porToken` (`@/lib/gate`, sin cambios).

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { useMe } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { porToken } from '@/lib/gate'
import { usePrecargarVeredicto } from '@/lib/queries/garita'

function tokenDelQr(texto: string): string | null {
  try {
    const url = new URL(texto)
    return url.pathname.match(/^\/i\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null
  } catch {
    return /^[A-Za-z0-9_-]+$/.test(texto) ? texto : null
  }
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'
    if (error.status === 403) return 'Esta cuenta no tiene permiso para usar la garita.'
    if (error.status === 404) return 'El QR no corresponde a una invitación válida.'
  }
  return 'No se pudo validar el QR. Revisá la conexión e intentá de nuevo.'
}

export default function EscanearPage() {
  const me = useMe()
  const router = useRouter()
  const precargarVeredicto = usePrecargarVeredicto()
  const [estado, setEstado] = useState<'abriendo' | 'listo' | 'sin_camara'>('abriendo')
  const [error, setError] = useState<string | null>(null)
  const [validando, setValidando] = useState(false)
  const [marco, setMarco] = useState(240)
  const ultimoQr = useRef<string | null>(null)
  const procesando = useRef(false)

  useEffect(() => {
    if (!me) return
    const scanner = new Html5Qrcode('reader', { verbose: false })
    let vivo = true

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        qrbox: (ancho, alto) => {
          const size = Math.floor(Math.min(280, ancho * 0.76, alto * 0.68))
          setMarco(size)
          return { width: size, height: size }
        },
      },
      async (texto) => {
        if (procesando.current || ultimoQr.current === texto) return
        procesando.current = true
        ultimoQr.current = texto
        setError(null)
        setValidando(true)

        const token = tokenDelQr(texto)
        if (!token) {
          if (vivo) {
            setError('No reconozco este código. Enfocá una invitación de VisitPass dentro del marco.')
            setValidando(false)
          }
          procesando.current = false
          return
        }

        try {
          const r = await porToken(token)
          if (vivo) {
            precargarVeredicto(r.invitation.id, r)
            router.push(`/garita/invitacion/${r.invitation.id}`)
          }
        } catch (e) {
          if (vivo) {
            setError(mensajeDeError(e))
            setValidando(false)
          }
        } finally {
          procesando.current = false
        }
      },
      () => {},
    )
      .then(() => { if (vivo) setEstado('listo') })
      .catch(() => { if (vivo) setEstado('sin_camara') })

    return () => {
      vivo = false
      scanner.stop().catch(() => {})
    }
  }, [me, router, precargarVeredicto])

  const salir = useCallback(() => router.push('/garita'), [router])
  const reintentar = useCallback(() => {
    ultimoQr.current = null
    setError(null)
  }, [])

  if (!me) return <main className="p-6">Cargando…</main>

  const camaraLista = estado === 'listo'

  return (
    <main className="flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-escaner-fondo text-escaner-texto">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[calc(0.7rem+env(safe-area-inset-top,0px))] sm:px-6">
        <button onClick={salir} aria-label="Volver a garita"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow" style={{ color: 'inherit', opacity: 0.56 }}>Control de acceso</p>
          <p className="display text-lg leading-tight">Garita</p>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 text-[0.65rem] font-semibold tracking-[0.12em]">
          <span className={`size-2 rounded-full ${camaraLista ? 'bg-[#88dda2]' : estado === 'sin_camara' ? 'bg-[#ff8b82]' : 'bg-[#e5c879]'}`} />
          {camaraLista ? 'LECTOR ACTIVO' : estado === 'sin_camara' ? 'SIN CÁMARA' : 'CONECTANDO'}
        </div>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:pt-5">
        <div className="flex shrink-0 items-end justify-between gap-3">
          <div>
            <p className="eyebrow" style={{ color: 'inherit', opacity: 0.58 }}>Lector QR</p>
            <h1 className="display mt-1 text-[1.7rem] leading-tight sm:text-3xl">Escanear invitación</h1>
          </div>
          <span className="mb-1 hidden rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.12em] opacity-70 sm:inline-flex">
            AUTOMÁTICO
          </span>
        </div>

        <div className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-[1.35rem] border border-white/15 bg-[#07100c] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div id="reader" aria-label="Vista de cámara para leer el código QR"
            className="absolute inset-0 overflow-hidden [&_video]:size-full [&_video]:object-cover" />

          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="relative rounded-xl" style={{ width: marco, height: marco }}>
              <span className="absolute left-0 top-0 size-9 rounded-tl-xl border-l-[3px] border-t-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute right-0 top-0 size-9 rounded-tr-xl border-r-[3px] border-t-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute bottom-0 left-0 size-9 rounded-bl-xl border-b-[3px] border-l-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute bottom-0 right-0 size-9 rounded-br-xl border-b-[3px] border-r-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
            </div>
          </div>

          {estado === 'abriendo' && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 px-6 text-center">
              <p className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm">Abriendo la cámara…</p>
            </div>
          )}

          {estado === 'sin_camara' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07100c]/95 px-8 text-center">
              <p className="display text-2xl">No se pudo abrir la cámara</p>
              <p className="max-w-sm text-sm leading-relaxed text-white/70">
                Revisá el permiso de cámara del navegador y que estés entrando por HTTPS.
              </p>
              <button onClick={salir} className="mt-2 min-h-12 rounded-full border border-white/20 px-5 text-sm font-semibold">
                Volver a garita
              </button>
            </div>
          )}

          {validando && (
            <div role="status" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-[#07100c]/85 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur">
              Validando invitación…
            </div>
          )}
        </div>

        <footer aria-live="polite" className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
          <div aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg">
            {error ? '!' : '⌗'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{error ? 'No se pudo leer la invitación' : 'Escaneo automático'}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/65">
              {error ?? 'Centrala dentro del marco y subí el brillo de la pantalla del invitado.'}
            </p>
          </div>
          {error && (
            <button onClick={reintentar} className="min-h-10 shrink-0 rounded-full border border-white/20 px-3 text-xs font-semibold">
              Reintentar
            </button>
          )}
        </footer>
      </section>
    </main>
  )
}
```

Qué cambió respecto del archivo actual: se saca el import de `Verdict` y de `Resultado`; desaparecen el estado `resultado` y el bloque `if (resultado) return <Verdict …/>`; el efecto de la cámara ya no depende de `resultado` (ahora una validación exitosa navega fuera de la página, así que el `return` del efecto la desmonta sola); al validar, en vez de `setResultado(r)`, se precarga el veredicto en caché y se navega a su ruta.

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: limpio.

Run: `cd .. && docker compose up -d --build web`. Entrar como `guardia.prueba@aromos.test`, ir a "Escanear" y escanear (o pegar en la URL) el link de una invitación vigente.
Expected: aparece "Validando invitación…" y navega a `/garita/invitacion/<id>` con el veredicto correcto. Si el QR no corresponde a ninguna invitación, el mensaje de error se ve en el pie y "Reintentar" permite otro intento sin recargar.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(garita)/garita/escanear/page.tsx"
git commit -m "feat: el escaner navega al veredicto en vez de guardarlo en memoria"
```

---

### Task 8: Pantalla "Hoy"

**Files:**
- Modify: `web/src/app/(garita)/garita/page.tsx` (reescritura)
- Delete: `web/src/components/agenda.tsx`, `web/src/components/verdict.tsx`

**Interfaces:**
- Consumes: `ChromeGarita` (Tarea 2), `AgendaDia` (Tarea 3), `BuscarInvitado` (Tarea 4), `UltimosMovimientos` (Tarea 5); `buttonVariants` (`@/components/ui/button`).

- [ ] **Step 1: Reemplazar la página**

```tsx
'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { AgendaDia } from '@/components/garita/agenda-dia'
import { BuscarInvitado } from '@/components/garita/buscar-invitado'
import { UltimosMovimientos } from '@/components/garita/ultimos-movimientos'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * "Hoy": buscador y agenda siempre visibles. El botón de escanear vive en el
 * centro de la barra inferior en mobile (lo pone `ChromeGarita`); acá, en la
 * columna derecha, solo aparece a partir de 768px —agenda a la izquierda,
 * escanear + buscar + últimos movimientos a la derecha—, porque antes de ese
 * ancho la columna se aprieta.
 */
export default function GaritaHoy() {
  const router = useRouter()
  const abrir = (id: string) => router.push(`/garita/invitacion/${id}`)

  return (
    <ChromeGarita>
      <div className="grid gap-8 md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <BuscarInvitado onAbrir={abrir} />
          <AgendaDia onAbrir={abrir} />
        </div>
        <aside className="hidden flex-col gap-6 md:flex">
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <UltimosMovimientos />
        </aside>
      </div>
    </ChromeGarita>
  )
}
```

- [ ] **Step 2: Borrar lo viejo**

Confirmar que nada más importa lo que se borra:

Run: `cd web && grep -rln "components/agenda\|components/verdict" src`
Expected: ningún resultado (la Tarea 6 y la Tarea 7 ya sacaron las únicas referencias). Si aparece algo, no borrar y reportarlo como NEEDS_CONTEXT.

Run:
```bash
git rm web/src/components/agenda.tsx web/src/components/verdict.tsx
```

- [ ] **Step 3: Verificar**

Run: `cd web && rm -rf .next && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
Expected: limpio. El build sigue listando `/garita`, `/garita/escanear` y suma `/garita/invitacion/[id]`.

Run: `cd .. && docker compose up -d --build web`. Entrar como `guardia.prueba@aromos.test` y abrir `http://localhost:3000/garita` en 390, 768 y 1280 px.
Expected: en 390, buscador + agenda, sin columna derecha, escanear en el centro de la barra inferior. En 768 y 1280, agenda a la izquierda, "Escanear QR" + buscador (en la izquierda, no se duplicó) + "Últimos movimientos" a la derecha. Buscar algo en vivo abre el veredicto correcto. Tocar una fila de la agenda también.

- [ ] **Step 4: Commit**

```bash
git add -A "web/src/app/(garita)/garita/page.tsx" web/src/components/agenda.tsx web/src/components/verdict.tsx
git commit -m "feat: pantalla Hoy de la garita con agenda, busqueda y ultimos movimientos"
```

---

### Task 9: E2E de la garita

**Files:**
- Create: `web/e2e/garita.spec.ts`

**Interfaces:**
- Consumes: `entrar` (`web/e2e/sesion.ts`, sin cambios); las cuentas `e2e.vecino@visitpass.test` y `e2e.guardia@visitpass.test`.

- [ ] **Step 1: Los recorridos**

Crear `web/e2e/garita.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { entrar } from './sesion'

test('el guardia busca un invitado, registra el ingreso y lo deshace', async ({ page, browser }) => {
  // Lo crea el vecino, para tener una invitación vigente y fresca.
  const nombre = `Garita E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  // Otra ventana, con la sesión del guardia.
  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')

  await g.getByLabel('Buscar invitado').fill(nombre)
  await expect(g.getByText(nombre)).toBeVisible()
  await g.getByText(nombre).click()
  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByText('INGRESO', { exact: true })).toBeVisible()

  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await expect(g.getByText('Deshacer')).toBeVisible()

  await g.getByRole('button', { name: 'Deshacer' }).click()
  await expect(g).toHaveURL(/\/garita\/escanear$/)

  await guardia.close()
})

test('la agenda se mueve relativa al día elegido, no a hoy', async ({ page }) => {
  await entrar(page, 'guardia')
  await page.goto('/garita')

  const siguiente = page.getByRole('button', { name: 'Día siguiente' })
  const anterior = page.getByRole('button', { name: 'Día anterior' })

  // +2, -1: si el botón fuera relativo a hoy en vez de al día elegido,
  // terminaría mostrando "Hoy" en lugar de "Mañana".
  await siguiente.click()
  await siguiente.click()
  await anterior.click()

  await expect(page.locator('h2')).toHaveText('Mañana')
})

test('una invitación anulada no pasa', async ({ page, browser }) => {
  const nombre = `Rechazo E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/([0-9a-f-]{36})\?creada=1$/)
  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByText('NO PASA')).toBeVisible()
  await expect(g.getByText('La anularon')).toBeVisible()
  await guardia.close()
})
```

- [ ] **Step 2: Correr**

Run: `cd .. && docker compose up -d --build && cd web && npm run e2e`
Expected: 26 passed (los 20 de las fases 1-2, más 3 recorridos nuevos × 2 proyectos). Si algún recorrido falla por la app y no por el test, investigar y arreglar la app; no debilitar la aserción.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/garita.spec.ts
git commit -m "test: e2e de la garita (buscar, ingreso, deshacer, rechazo, agenda relativa)"
```

---

### Task 10: Verificación final de la fase

**Files:** ninguno nuevo.

- [ ] **Step 1: Todo en verde**

Run:
```bash
cd api && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build
cd .. && docker compose up -d --build && cd web && npm run e2e
```
Expected: 247 tests de API; `check` con `nav`, `fechas`, `estado-invitacion`, `ultimos-movimientos` y `colores` en ok; build limpio; 26 e2e en verde.

- [ ] **Step 2: Revisión visual**

En 390, 768 y 1280 px, en claro y oscuro, con `guardia.prueba@aromos.test`:
- `/garita` (con y sin resultados de búsqueda; con y sin frecuentes desplegados)
- `/garita/escanear` (se mantiene oscuro siempre, no sigue el tema)
- `/garita/invitacion/[id]` para un ingreso, un egreso (buscar a alguien que ya esté adentro) y un rechazo (una invitación anulada o vencida)
- la pantalla de confirmación tras registrar, con el contador bajando

Expected: sin scroll horizontal en ningún ancho; en 768 y 1280 la columna derecha aparece recién ahí, nunca antes; el veredicto se lee bien en los tres canales (palabra, sello, luminancia) en los dos temas; nada de "Cargando…" en texto plano.

- [ ] **Step 3: Cerrar**

Anotar lo que queda para la fase 4 (auditoría, atajos de teclado si se deciden) y pasar a `superpowers:finishing-a-development-branch`.
