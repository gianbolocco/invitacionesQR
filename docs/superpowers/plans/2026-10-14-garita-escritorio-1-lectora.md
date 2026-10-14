# Garita en escritorio · Plan 1: la lectora al frente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `/garita` (≥ 768 px) un recuadro "Lectora" reemplaza al botón de escanear como protagonista y muestra la última lectura (spec 3.1). Siguen el plan 2 (veredicto en dos columnas) y el 3 (autorizar igual).

**Architecture:** La última lectura es un dato en memoria en la caché de TanStack (`['lectora','ultima']`), escrito por el `leer` de `/garita` y del veredicto con el resultado ya resuelto, y leído por un componente nuevo `EstadoLectora`. El botón de la cámara se muestra solo con puntero táctil (`pointer-coarse:` de Tailwind v4.3).

**Tech Stack:** Next.js 16 / React 19, TanStack Query 5, Tailwind 4.3, lucide-react, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-garita-escritorio-design.md`

## Global Constraints

- Código, nombres y comentarios en español; UI en voseo. Colores solo con tokens de `web/src/app/globals.css` (nada de verdes: el estado se dice con palabra + ícono).
- Del DNI, en la última lectura, solo el número formateado y el nombre de la invitación encontrada; nunca en la URL.
- Mobile (< 768 px) no cambia: el aside ya es `hidden md:flex`.
- Antes de usar una API de Next, ver `web/AGENTS.md`.
- Commits `feat:`/`fix:` en español minúscula + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git commit -am` / `git add -A`: hay cambios ajenos sin commitear.

---

### Task 1: Última lectura y recuadro "Lectora"

**Files:**
- Modify: `web/src/lib/lectora.ts`, `web/src/lib/lectora.check.ts` (`formatearDni`)
- Modify: `web/src/lib/queries/garita.ts` (`useAbrirQr` devuelve el resultado; `useUltimaLectura`, `useAnotarLectura`)
- Create: `web/src/components/garita/estado-lectora.tsx`
- Modify: `web/src/app/(garita)/garita/page.tsx`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`
- Test: `web/e2e/garita.spec.ts`

**Produces:** `formatearDni(doc: string): string`; `useAbrirQr()` → `(token, reemplazar?) => Promise<Resultado>`; `type UltimaLectura = { descripcion: string; cuando: string }`; `useUltimaLectura(): UltimaLectura | null`; `useAnotarLectura(): (descripcion: string) => void`; `<EstadoLectora />`.

- [ ] **Step 1: `formatearDni` con su check.** En `lectora.check.ts`, antes del `console.log`:

```ts
assert.equal(formatearDni('46116502'), '46.116.502')
assert.equal(formatearDni('7123456'), '7.123.456')
```

(importarlo junto a los demás). Correr `cd web && node src/lib/lectora.check.ts` → falla. En `lectora.ts`, debajo de `soloDigitos`:

```ts
/** "46116502" → "46.116.502": así lo lee el guardia en la tarjeta. */
export const formatearDni = (doc: string) => doc.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
```

Correr de nuevo → `lectora: ok`.

- [ ] **Step 2: `queries/garita.ts`.** `useAbrirQr` devuelve `r` al final del callback (`return r`), sin otro cambio. Agregar debajo de `useDocumentoLeido`:

```ts
export type UltimaLectura = { descripcion: string; cuando: string }
const CLAVE_ULTIMA = ['lectora', 'ultima'] as const

/**
 * La última lectura y qué pasó con ella, para el recuadro "Lectora" de la
 * garita: la confirmación de que la lectora leyó, que un toast que se va no da.
 * En memoria (fuera de ['garita']) y sin gc: sobrevive al ir y volver del veredicto.
 */
export function useUltimaLectura() {
  const { data } = useQuery<UltimaLectura | null>({
    queryKey: CLAVE_ULTIMA,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data ?? null
}

export function useAnotarLectura() {
  const qc = useQueryClient()
  return useCallback((descripcion: string) => {
    qc.setQueryData<UltimaLectura>(CLAVE_ULTIMA, { descripcion, cuando: new Date().toISOString() })
  }, [qc])
}
```

(`new Date()` acá es un instante, no un día: la hora se muestra con `hora()` de `fechas.ts`, en Buenos Aires.)

- [ ] **Step 3: `EstadoLectora`** — `web/src/components/garita/estado-lectora.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { CircleCheck, ScanBarcode } from 'lucide-react'
import { hora } from '@/lib/fechas'
import { useUltimaLectura } from '@/lib/queries/garita'

/**
 * El lugar de la lectora en la garita de escritorio. No dice "conectada" antes
 * de leer: para el navegador una lectora es un teclado, no hay forma de saber
 * si está enchufada. Lo afirma recién cuando lee.
 */
export function EstadoLectora() {
  const ultima = useUltimaLectura()
  return (
    <section aria-label="Lectora" className="rounded-lg border border-border p-4">
      {ultima ? (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <CircleCheck className="size-4 shrink-0" aria-hidden />Lectora funcionando
          </p>
          <p role="status" className="mt-1 text-sm tabular">{ultima.descripcion} · {hora(ultima.cuando)}</p>
        </>
      ) : (
        <p className="flex items-center gap-2 font-semibold">
          <ScanBarcode className="size-4 shrink-0" aria-hidden />Escaneá un QR o un DNI con la lectora
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>¿No tenés lectora? <Link href="/garita/escanear" className="underline underline-offset-4">Usar la cámara</Link></span>
        <Link href="/garita/lectora" className="underline underline-offset-4">Probar lectora</Link>
      </p>
    </section>
  )
}
```

- [ ] **Step 4: El aside de `/garita`.** Reemplazar el `Link` "Escanear QR" y el de "Probar lectora" por:

```tsx
          {/* Táctil (una tablet desde 768 px): la cámara al frente, como siempre.
              Con mouse, la lectora; la cámara queda como link del recuadro. */}
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'hidden w-full pointer-coarse:inline-flex')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <EstadoLectora />
```

- [ ] **Step 5: Anotar cada lectura en `/garita`.** `const anotar = useAnotarLectura()` junto a los otros hooks; importar `formatearDni`. En `leer` y `resolverDni`, sin cambiar la lógica, anotar el resultado:
  - `!l` → `anotar('No reconocido')` (además del toast).
  - QR ok → `const r = await abrirQr(l.token); anotar(\`QR · ${r.invitation.guestName}\`)`; QR error → `anotar(\`QR · ${mensajeDeError(e)}\`)`.
  - DNI (con `const dni = \`DNI ${formatearDni(l.documento)}\``): una invitación exacta → `` `${dni} · ${hit.guestName}` ``; varias o coincidencia parcial → `` `${dni} · ${n} posibles, elegí en la lista` ``; solo por apellido → `` `${dni} · sin coincidencia exacta, revisá la lista` ``; nada → `` `${dni} · sin invitación, alta exprés` ``; error de red → `` `${dni} · no se pudo buscar` ``.
  - Con el alta abierta, un DNI → `` `${dni} · completó el alta exprés` ``.
  - Respetar el guard de secuencia existente: anotar solo si el resultado no quedó viejo.

- [ ] **Step 6: Anotar en el veredicto.** `const anotar = useAnotarLectura()`. En `leer`: `!l` → `anotar('No reconocido')`; QR como en el step 5; DNI que completa el documento → `` anotar(`DNI ${formatearDni(l.documento)} · completó el documento`) ``. El DNI que se va a `/garita` lo anota `/garita` al resolverlo.

- [ ] **Step 7: E2E** (al final de `web/e2e/garita.spec.ts`, reusa `leerConLectora`):

```ts
test('el recuadro de la lectora confirma que leyó', async ({ page, isMobile }) => {
  test.skip(isMobile, 'el recuadro vive en la columna de escritorio')
  await entrar(page, 'guardia')
  await page.goto('/garita')
  const recuadro = page.getByRole('region', { name: 'Lectora' })
  await expect(recuadro).toContainText('Escaneá un QR o un DNI con la lectora')
  // Mouse: el botón de la cámara no está; la cámara es el link del recuadro.
  await expect(page.getByRole('link', { name: 'Escanear QR' })).toBeHidden()
  await expect(recuadro.getByRole('link', { name: 'Usar la cámara' })).toBeVisible()

  await leerConLectora(page, 'ESTONOESUNCODIGO123')
  await expect(recuadro).toContainText('Lectora funcionando')
  await expect(recuadro).toContainText('No reconocido')
})
```

- [ ] **Step 8: Verificar.** `cd web && npm run check && npm run lint && npx tsc --noEmit`; stack: `docker compose up -d --build` (raíz), luego `cd web && npm run e2e -- garita` → todos pasan en los dos proyectos.

- [ ] **Step 9: Commit** — stagear por path los 7 archivos: `git commit -m "feat: la garita de escritorio muestra el estado de la lectora"` (+ trailer).
