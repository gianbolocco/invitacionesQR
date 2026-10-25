# Padrón y seguro del auto — fase 2: web de la garita

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La garita ve y carga los dos seguros (proveedor y auto) en un veredicto ordenado por secciones, que se recalcula al cambiar el documento o la patente. El vecino y el alta exprés dejan de cargar seguro, el proveedor lo carga desde su link con su DNI y el admin prende el pedido del seguro del auto.

**Architecture:** La web no tiene `canEnter`: cuando el guardia cambia el documento o la patente, la pantalla pide `POST /gate/invitation/:id/verdict` (con 300 ms de espera después de la última tecla) y usa esa respuesta en lugar de la inicial. Cada seguro se muestra con un componente nuevo, `SeccionSeguro`, que alterna entre texto (con "Corregir") y campos. La lógica pura nueva va en `web/src/lib/padron.ts` y en `web/src/lib/seguro.ts`, con sus `*.check.ts`.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TanStack Query 5, Tailwind 4 con tokens de `globals.css`, motion, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-padron-seguros-contactos-design.md`
**Depende de:** plan `2026-10-24-padron-1-api.md` completo (los endpoints y las formas de respuesta están en su Task 6).

## Global Constraints

- Leer `web/AGENTS.md` antes de usar una API de Next.
- Textos de la UI en voseo rioplatense. Código, nombres y comentarios en español.
- Colores: solo tokens de `web/src/app/globals.css` (`bg-no-pasa`, `text-no-pasa-texto`, `bg-verde-tint`, `text-ink`, `text-espera`, `text-alto`, `text-verde`, `border-current/…`). Nada de hex.
- Títulos de sección y estados sobre NO PASA e INGRESO tienen que cumplir contraste AA: no bajar de `opacity-80` en texto chico.
- Hora de Buenos Aires: `hoyISO()` de `web/src/lib/fechas.ts`. Nunca `new Date()` para calcular un día.
- Un DNI nunca va en la URL.
- Sin tests de componentes: la lógica pura va en `web/src/lib/*.ts` con su `*.check.ts`, sumado al script `check` de `web/package.json`.
- Verificar: `cd web && npm run check && npm run lint && npx tsc --noEmit`, y `cd web && npm run e2e` con el stack levantado (`docker compose up -d --build`; si se pone intermitente, `--workers=1`).
- Commits: `feat:` / `fix:` / `style:` + descripción en español en minúscula, cerrando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Archivos

| Archivo | Qué cambia |
|---|---|
| `web/src/lib/padron.ts` + `padron.check.ts` (nuevos) | `normalizarDoc`, `normalizarPatente`, `mismaPatente` |
| `web/src/lib/seguro.ts` + `seguro.check.ts` | `estadoDe()` y `textoEstado()` |
| `web/src/lib/gate.ts` | tipos de `Resultado`, motivos del auto, `veredictoCon`, `corregirSeguroProveedor`, `corregirSeguroAuto`; `registrarIngreso` y `altaExpres` |
| `web/src/lib/queries/garita.ts` | `useVeredictoEnVivo`, `useCorregirSeguro` |
| `web/src/components/garita/seccion-seguro.tsx` (nuevo) | un seguro: texto + "Corregir", o campos |
| `web/src/app/(garita)/garita/invitacion/[id]/page.tsx` | la ficha por secciones, el auto, Viene a pie, Autorizar igual |
| `web/src/components/garita/alta-expres.tsx` | sin bloque de seguro |
| `web/src/components/vecino/formulario-invitacion.tsx`, `web/src/app/(vecino)/invitaciones/nueva/page.tsx`, `web/src/lib/invitations.ts`, `web/src/lib/queries/invitaciones.ts` | el vecino no carga seguro |
| `web/src/app/i/[token]/page.tsx` | el proveedor carga su seguro con su DNI |
| `web/src/app/(admin)/admin/barrio/page.tsx`, `web/src/lib/queries/admin.ts` | los dos switches |
| `web/e2e/seguro-proveedor.spec.ts`, `web/e2e/seguro-auto.spec.ts` (nuevo) | e2e |
| `web/package.json` | `padron.check.ts` en `check` |

---

### Task 1: Lógica pura del padrón y del estado del seguro

**Files:**
- Create: `web/src/lib/padron.ts`, `web/src/lib/padron.check.ts`
- Modify: `web/src/lib/seguro.ts`, `web/src/lib/seguro.check.ts`, `web/package.json`

**Interfaces:**
- Produces:
  - `normalizarDoc(s: string): string`, `normalizarPatente(s: string): string`, `mismaPatente(a: string | null, b: string | null): boolean`
  - `type SeguroDatos = { company: string; policy: string; expiresOn: string }`
  - `estadoDe(s: SeguroDatos | null, pide: boolean, hoy: string, warnDays: number | null): EstadoSeguro`
  - `textoEstado(e: EstadoSeguro, expiresOn: string | null, hoy: string): string`, que devuelve `'Seguro vigente' | 'Vence hoy' | 'Vence en N días' | 'Seguro vencido' | 'Falta el seguro' | ''`

- [ ] **Step 1: Write the failing check**

`web/src/lib/padron.check.ts`:

```ts
/** `node src/lib/padron.check.ts`. */
import assert from 'node:assert/strict'
import { mismaPatente, normalizarDoc, normalizarPatente } from './padron.ts'
assert.equal(normalizarDoc('30.123.456'), '30123456')
assert.equal(normalizarDoc('aaa 123-456'), 'AAA123456')
assert.equal(normalizarPatente('ab-123 cd'), 'AB123CD')
assert.equal(normalizarPatente(' - '), '')
assert.equal(mismaPatente('AB 123 CD', 'ab123cd'), true)
assert.equal(mismaPatente('AB 123 CD', 'AB 123 CE'), false)
assert.equal(mismaPatente(null, ''), true)
console.log('padron: ok')
```

En `web/src/lib/seguro.check.ts`, sumar `estadoDe, textoEstado` al import y, antes del `console.log`:

```ts
const datos = (expiresOn: string) => ({ company: 'La Caja', policy: '4410', expiresOn })
assert.equal(estadoDe(null, false, HOY, 15), 'no_aplica')
assert.equal(estadoDe(null, true, HOY, 15), 'sin_cargar')
assert.equal(estadoDe(datos('2026-10-20'), true, HOY, 15), 'vencido')
assert.equal(estadoDe(datos('2026-10-26'), true, HOY, 15), 'por_vencer')
assert.equal(estadoDe(datos('2027-10-26'), true, HOY, 15), 'vigente')
assert.equal(textoEstado('vigente', '2027-10-26', HOY), 'Seguro vigente')
assert.equal(textoEstado('por_vencer', '2026-10-26', HOY), 'Vence en 5 días')
assert.equal(textoEstado('por_vencer', '2026-10-21', HOY), 'Vence hoy')
assert.equal(textoEstado('vencido', '2026-10-20', HOY), 'Seguro vencido')
assert.equal(textoEstado('sin_cargar', null, HOY), 'Falta el seguro')
assert.equal(textoEstado('no_aplica', null, HOY), '')
```

En `web/package.json`, script `check`: sumar ` && node src/lib/padron.check.ts` después de `seguro.check.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && node src/lib/padron.check.ts`
Expected: FAIL, "Cannot find module './padron.ts'"

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/padron.ts`:

```ts
/*
 * El espejo de api/src/lib/padron.ts: la garita compara la patente tipeada con
 * la sugerida ("última vez: AB 123 CD") con la misma regla que usa el padrón.
 */

/** Solo dígitos y letras ASCII, en mayúscula: '30.123.456' → '30123456'. */
export const normalizarDoc = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** La misma regla: 'ab-123 cd' → 'AB123CD'. */
export const normalizarPatente = normalizarDoc

export const mismaPatente = (a: string | null, b: string | null) =>
  normalizarPatente(a ?? '') === normalizarPatente(b ?? '')
```

En `web/src/lib/seguro.ts`, al final:

```ts
export type SeguroDatos = { company: string; policy: string; expiresOn: string }

/** El estado de un seguro suelto (el del padrón: proveedor o auto). Mismas reglas que estadoSeguro. */
export function estadoDe(s: SeguroDatos | null, pide: boolean, hoy: string, warnDays: number | null): EstadoSeguro {
  return estadoSeguro({
    requiresInsurance: pide,
    insuranceCompany: s?.company ?? null, insurancePolicy: s?.policy ?? null, insuranceExpiresOn: s?.expiresOn ?? null,
  }, hoy, warnDays)
}

/** Lo que va al lado del título de la sección en el veredicto. */
export function textoEstado(e: EstadoSeguro, expiresOn: string | null, hoy: string): string {
  if (e === 'vigente') return 'Seguro vigente'
  if (e === 'vencido') return 'Seguro vencido'
  if (e === 'sin_cargar') return 'Falta el seguro'
  if (e === 'por_vencer' && expiresOn) {
    const dias = diasHasta(expiresOn, hoy)
    return dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`
  }
  return ''
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm run check`
Expected: todas las líneas `…: ok`, incluidas `padron: ok` y `seguro: ok`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/padron.ts web/src/lib/padron.check.ts web/src/lib/seguro.ts web/src/lib/seguro.check.ts web/package.json
git commit -m "feat: lógica del padrón y del estado del seguro en el front"
```

---

### Task 2: Cliente de la garita: tipos, motivos y llamadas nuevas

**Files:**
- Modify: `web/src/lib/gate.ts`, `web/src/lib/queries/garita.ts`

**Interfaces:**
- Consumes: la respuesta del check del plan 1, Task 6.
- Produces:
  - `Resultado` suma `provider: { insurance: SeguroDatos | null; insuranceSource: 'garita' | 'link' | null; updatedAt: string | null } | null`, `vehicle: { plate: string; insurance: SeguroDatos; updatedByName: string | null; updatedAt: string } | null`, `lastPlate: string | null`, `vehicleInsuranceRequired: boolean`, `vehicleInsuranceOverride: boolean`.
  - `MOTIVO.no_vehicle_insurance = 'Sin seguro del auto'`, `MOTIVO.vehicle_insurance_expired = 'Seguro del auto vencido'`.
  - `rechazoPorSeguro(c)` también da true con los dos motivos del auto. `rechazoPorAuto(c)` es true solo con esos dos.
  - `detalleRechazo(reason, inv, extra)` acepta `extra.vehicle` y `extra.plate`.
  - `veredictoCon(id, datos: { doc: string; plate: string }): Promise<Resultado>`
  - `registrarIngreso({ …, vehicleInsurance?: SeguroDatos })`
  - `corregirSeguroProveedor({ doc, name, insurance })`, `corregirSeguroAuto({ plate, insurance })`
  - `altaExpres` sin `insurance`.
  - `useVeredictoEnVivo(id: string, datos: { doc: string; plate: string } | null)`: `null` la deshabilita.
  - `useCorregirSeguro()`: mutación `{ tipo: 'proveedor', doc, name, insurance } | { tipo: 'auto', plate, insurance }`.

- [ ] **Step 1: Escribir los tipos y las llamadas**

En `web/src/lib/gate.ts`:

1. Import: `import type { SeguroDatos } from './seguro'` y `import { fechaNumerica } from './fechas'` (ya está).

2. En `Resultado`, después de `adentro: Adentro`:

```ts
  /** El proveedor en el padrón, por el DNI cargado. null = no está (o no es proveedor). */
  provider: { insurance: SeguroDatos | null; insuranceSource: 'garita' | 'link' | null; updatedAt: string | null } | null
  /** El auto en el padrón, por la patente cargada. null = no está cargado. */
  vehicle: { plate: string; insurance: SeguroDatos; updatedByName: string | null; updatedAt: string } | null
  /** La última patente con la que entró este DNI: una sugerencia, no un vínculo. */
  lastPlate: string | null
  vehicleInsuranceRequired: boolean
  /** La portería puede autorizar igual un auto sin seguro. */
  vehicleInsuranceOverride: boolean
```

3. En `MOTIVO`, después de `insurance_expired`:

```ts
  no_vehicle_insurance: 'Sin seguro del auto',
  vehicle_insurance_expired: 'Seguro del auto vencido',
```

4. Reemplazar `rechazoPorSeguro` por:

```ts
/** Los rechazos del auto: se resuelven cargando su seguro o entrando a pie. */
export const rechazoPorAuto = (c: Check) => !c.ok && (c.reason === 'no_vehicle_insurance' || c.reason === 'vehicle_insurance_expired')

/** Los rechazos que la guardia puede resolver cargando un seguro ahí mismo. */
export const rechazoPorSeguro = (c: Check) =>
  !c.ok && (c.reason === 'no_insurance' || c.reason === 'insurance_expired' || rechazoPorAuto(c))
```

5. En `detalleRechazo`, la firma de `extra` pasa a `extra?: { franjas: Franja[]; tradeName: string | null; plate?: string; vehicle?: Resultado['vehicle'] }`, y al principio del cuerpo:

```ts
  if (reason === 'no_vehicle_insurance') return `${extra?.plate || 'El auto'} no tiene seguro cargado. Pedile el certificado.`
  if (reason === 'vehicle_insurance_expired' && extra?.vehicle) {
    const s = extra.vehicle.insurance
    return `Venció el ${fechaNumerica(s.expiresOn)} · ${s.company} · Póliza ${s.policy}`
  }
```

6. Después de `porId`:

```ts
/** El veredicto con lo que el guardia tiene tipeado. POST: el DNI no va en la URL. */
export const veredictoCon = (id: string, datos: { doc: string; plate: string }, signal?: AbortSignal) =>
  api<Resultado>(`/gate/invitation/${id}/verdict`, { method: 'POST', body: JSON.stringify(datos), signal })

export const corregirSeguroProveedor = (datos: { doc: string; name: string; insurance: SeguroDatos }) =>
  api<{ ok: true }>('/gate/providers/insurance', { method: 'PUT', body: JSON.stringify(datos) })

export const corregirSeguroAuto = (datos: { plate: string; insurance: SeguroDatos }) =>
  api<{ ok: true }>('/gate/vehicles/insurance', { method: 'PUT', body: JSON.stringify(datos) })
```

7. `registrarIngreso`: sumar `vehicleInsurance?: SeguroDatos` al tipo de `datos`. `altaExpres`: sacar `insurance?: …` del tipo. `mensajeAltaExpres`: sacar `seguro_no_aplica`.

En `web/src/lib/queries/garita.ts`, imports: sumar `veredictoCon, corregirSeguroProveedor, corregirSeguroAuto` de `@/lib/gate` y `type SeguroDatos` de `@/lib/seguro`. Después de `useVeredicto`:

```ts
/**
 * El veredicto recalculado con el documento y la patente que tiene tipeados el
 * guardia: el único canEnter vive en la API. `datos` null = todavía son los de
 * la invitación y alcanza con el veredicto inicial. Mientras llega uno nuevo
 * queda el anterior: el NO PASA no parpadea con cada tecla.
 */
export function useVeredictoEnVivo(id: string, datos: { doc: string; plate: string } | null) {
  return useQuery({
    queryKey: [...claves.veredicto(id), 'vivo', datos?.doc ?? '', datos?.plate ?? ''] as const,
    queryFn: ({ signal }) => veredictoCon(id, datos!, signal),
    enabled: datos !== null,
    placeholderData: keepPreviousData,
  })
}

export type Correccion =
  | { tipo: 'proveedor'; doc: string; name: string; insurance: SeguroDatos }
  | { tipo: 'auto'; plate: string; insurance: SeguroDatos }

/** "Corregir" sin registrar: queda en el padrón aunque el guardia apriete Volver. */
export function useCorregirSeguro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tipo, ...datos }: Correccion) => tipo === 'auto'
      ? corregirSeguroAuto(datos as { plate: string; insurance: SeguroDatos })
      : corregirSeguroProveedor(datos as { doc: string; name: string; insurance: SeguroDatos }),
    onSuccess: () => toast.success('Seguro actualizado.'),
    onError: () => toast.error('No se pudo guardar el seguro. Probá de nuevo.'),
    onSettled: () => invalidarGarita(qc),
  })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd web && npx tsc --noEmit`
Expected: errores solo en `alta-expres.tsx` (todavía manda `insurance`). Se arreglan en la Task 4. El resto compila.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/gate.ts web/src/lib/queries/garita.ts
git commit -m "feat: cliente de la garita para el padrón y el seguro del auto"
```

---

### Task 3: La sección de un seguro

**Files:**
- Create: `web/src/components/garita/seccion-seguro.tsx`

**Interfaces:**
- Consumes: `CamposSeguro`, `ValorSeguro`, `estadoSeguroCargado` (`web/src/components/dominio/campos-seguro.tsx`), `textoEstado`, `EstadoSeguro`, `SeguroDatos` (Task 1), `fechaCompleta` (`web/src/lib/fechas.ts`).
- Produces:

```tsx
<SeccionSeguro
  titulo: string                 // 'Proveedor' | 'Visitante' | 'Vehículo'
  estado: EstadoSeguro           // 'no_aplica' no muestra ni estado ni seguro
  guardado: SeguroDatos | null   // lo que hay en el padrón
  quien?: string | null          // "lo cargó Julio Benítez el 02/10" / "lo cargó él desde su link"
  abierto: boolean               // campos visibles
  valor: ValorSeguro; onCambio: (v: ValorSeguro) => void
  onCorregir?: () => void        // sin él no hay botón Corregir
  onGuardar?: () => void         // "Guardar corrección" (solo cuando se corrige algo que ya estaba)
  guardando?: boolean
  idBase: string
  fechaPasada?: boolean          // el vencimiento tipeado ya pasó
>{children}</SeccionSeguro>      // filas <Dato> de la sección (documento, tipo, patente…)
```

- [ ] **Step 1: Escribir el componente**

`web/src/components/garita/seccion-seguro.tsx`:

```tsx
'use client'
import { CamposSeguro, estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
import { textoEstado, type EstadoSeguro, type SeguroDatos } from '@/lib/seguro'
import { fechaCompleta, hoyISO } from '@/lib/fechas'

/**
 * Una sección de la ficha del veredicto: un título, el estado de su seguro al
 * lado (lo que el guardia lee de un vistazo) y sus filas. Si la sección lleva
 * seguro, se muestra como texto con "Corregir", o como campos cuando falta,
 * venció o el guardia lo está corrigiendo.
 */
export function SeccionSeguro({
  titulo, estado, guardado, quien, abierto, valor, onCambio, onCorregir, onGuardar, guardando, idBase, fechaPasada, children,
}: {
  titulo: string
  estado: EstadoSeguro
  guardado: SeguroDatos | null
  quien?: string | null
  abierto: boolean
  valor: ValorSeguro
  onCambio: (v: ValorSeguro) => void
  onCorregir?: () => void
  onGuardar?: () => void
  guardando?: boolean
  idBase: string
  fechaPasada?: boolean
  children?: React.ReactNode
}) {
  const texto = textoEstado(estado, guardado?.expiresOn ?? null, hoyISO())
  const mal = estado === 'sin_cargar' || estado === 'vencido'
  return (
    <section aria-labelledby={`${idBase}-titulo`} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`${idBase}-titulo`} className="text-sm font-bold uppercase tracking-[0.08em] opacity-80">{titulo}</h2>
        {texto && (
          // El estado lleva palabra y borde, no solo color: se lee igual sobre NO PASA y sobre INGRESO.
          <span className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${mal ? 'border-current' : 'border-current/40'}`}>
            {texto}
          </span>
        )}
        {onCorregir && !abierto && guardado && estado !== 'no_aplica' && (
          <button type="button" onClick={onCorregir} className="ml-auto min-h-11 text-sm font-semibold underline underline-offset-4">
            Corregir
          </button>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-lg sm:text-xl">
        {children}
        {estado !== 'no_aplica' && !abierto && guardado && (
          <>
            <dt className="opacity-80">Seguro</dt>
            <dd className="min-w-0 break-words font-semibold tabular">
              {guardado.company} · {guardado.policy} · vence {fechaCompleta(guardado.expiresOn)}
              {quien && <span className="block text-base font-normal opacity-80">{quien}</span>}
            </dd>
          </>
        )}
      </dl>

      {estado !== 'no_aplica' && abierto && (
        <div className="flex flex-col gap-3">
          {mal && !guardado && <p className="text-base font-semibold">Pedile el certificado y cargalo.</p>}
          <CamposSeguro idBase={idBase} valor={valor} onCambio={onCambio} />
          {fechaPasada && <p className="text-base font-semibold">La fecha cargada ya pasó.</p>}
          {onGuardar && (
            <button type="button" onClick={onGuardar} disabled={guardando || estadoSeguroCargado(valor) !== 'completo'}
              className="min-h-12 rounded border-2 border-current/50 text-lg font-bold disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `cd web && npx tsc --noEmit && npx eslint src/components/garita/seccion-seguro.tsx`
Expected: sin errores nuevos en este archivo (los de `alta-expres.tsx` siguen hasta la Task 4)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/garita/seccion-seguro.tsx
git commit -m "feat: sección de un seguro en el veredicto"
```

---

### Task 4: El alta exprés deja de cargar seguro

**Files:**
- Modify: `web/src/components/garita/alta-expres.tsx`

**Interfaces:**
- Produces: `InicialAlta` sin `seguro`. El sheet ya no muestra el bloque del seguro. El texto de proveedor pasa a "Lo autorizás vos: no se controla el horario. El seguro se carga en la pantalla que sigue."

- [ ] **Step 1: Sacar el seguro**

En `web/src/components/garita/alta-expres.tsx`:

- Borrar el import de `campos-seguro`, `SIN_SEGURO`, el `useState` de `seguro`, `pideSeguro`, todos los `setSeguro(…)`, el bloque `{pideSeguro && (<section …>Seguro (opcional)…</section>)}`, y el `insurance: …` de `alta.mutateAsync`.
- `InicialAlta`: sacar `; seguro: ValorSeguro`.
- En el `else if (inicial)` de la apertura: `setKind(inicial.kind); setRubro(inicial.tradeId)` (sin `setSeguro`).
- En `enviar`: la condición de retorno queda `if (pideRubro && !rubroActual) return`.
- El comentario de la función: `Lo autoriza la portería: no se controla horario. Los seguros (proveedor y auto) se cargan en el veredicto que abre al crear.`
- El párrafo de proveedor:

```tsx
              <p className="text-sm text-ink-soft">Lo autorizás vos: no se controla el horario. El seguro se carga en la pantalla que sigue.</p>
```

En `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, en `<AltaExpres inicial={{…}}>`, borrar la línea `seguro: { company: … }`.

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add web/src/components/garita/alta-expres.tsx "web/src/app/(garita)/garita/invitacion/[id]/page.tsx"
git commit -m "feat: el alta exprés deja los seguros para el veredicto"
```

---

### Task 5: El veredicto por secciones, con el auto

**Files:**
- Modify: `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`

**Interfaces:**
- Consumes: `useVeredictoEnVivo`, `useCorregirSeguro` (Task 2), `SeccionSeguro` (Task 3), `estadoDe` (Task 1), `mismaPatente`, `normalizarDoc` (Task 1), `useDemora` (`web/src/lib/use-demora.ts`), `rechazoPorAuto` (Task 2).
- Produces: la ficha de la derecha con tres secciones, **Visitante** (o **Proveedor**) · **Vehículo** · **Invitación**. Los textos que buscan los e2e:
  - títulos: `Proveedor`, `Visitante`, `Vehículo`, `Invitación` (role `heading`)
  - motivo: `Sin seguro del auto`, `Seguro del auto vencido`
  - botones: `Corregir`, `Guardar corrección`, `Viene a pie`, `Guardar seguro y registrar ingreso`, `Registrar ingreso`
  - campos del auto: `Compañía`, `Número de póliza`, `Vence` con `idBase="seguro-auto"`; los del proveedor con `idBase="seguro-proveedor"`

- [ ] **Step 1: Estado nuevo y veredicto en vivo**

Imports nuevos:

```ts
import { estadoDe, textoVence } from '@/lib/seguro'
import { mismaPatente, normalizarDoc } from '@/lib/padron'
import { useDemora } from '@/lib/use-demora'
import { SeccionSeguro } from '@/components/garita/seccion-seguro'
import { estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
```

En `@/lib/gate` sumar `rechazoPorAuto`. En `@/lib/queries/garita` sumar `useVeredictoEnVivo, useCorregirSeguro`. Borrar el import de `estadoSeguro` (lo reemplaza `estadoDe`).

Estado: reemplazar `const [seguro, setSeguro] = useState(…)` por:

```ts
  const VACIO: ValorSeguro = { company: '', policy: '', expiresOn: '' }
  const [seguro, setSeguro] = useState<ValorSeguro>(VACIO)
  const [seguroAuto, setSeguroAuto] = useState<ValorSeguro>(VACIO)
  // Qué seguro está corrigiendo el guardia (uno que ya estaba cargado).
  const [corrigiendo, setCorrigiendo] = useState<{ proveedor: boolean; auto: boolean }>({ proveedor: false, auto: false })
  const [fechaPasadaAuto, setFechaPasadaAuto] = useState(false)
  const corregir = useCorregirSeguro()
```

En la precarga (`if (q.data && q.data.invitation.id !== idCargado)`), reemplazar el `setSeguro({...})` por:

```ts
    setSeguro(VACIO); setSeguroAuto(VACIO); setCorrigiendo({ proveedor: false, auto: false })
```

Después de la precarga:

```ts
  // El veredicto se recalcula en la API cuando el guardia cambia documento o
  // patente (300 ms después de la última tecla). Mientras sean los de la
  // invitación, vale el inicial.
  const docDemorado = useDemora(doc)
  const plateDemorada = useDemora(plate)
  const base = q.data
  const cambio = base && (normalizarDoc(docDemorado) !== normalizarDoc(base.invitation.guestDoc ?? '')
    || !mismaPatente(plateDemorada, base.invitation.plate))
  const vivo = useVeredictoEnVivo(id, cambio ? { doc: docDemorado, plate: plateDemorada } : null)
```

(Los hooks van antes de los `return` tempranos de `q.isPending` y `q.isError`: dejarlos junto a los demás hooks.)

Después de los `return` tempranos, `const resultado = q.data` pasa a:

```ts
  // El de la invitación hasta que el guardia cambia algo; después, el recalculado.
  const resultado = (cambio && vivo.data) || q.data
```

- [ ] **Step 2: Estados de cada seguro y lo que se manda**

Reemplazar desde `// NO PASA por seguro: el guardia carga la póliza…` hasta `const seguroCompleto = …` por:

```ts
  const hoy = hoyISO()
  const warn = resultado.insuranceWarnDays
  const esProveedor = inv.kind === 'proveedor' || inv.frequentAs === 'proveedor'
  const estadoProv = estadoDe(resultado.provider?.insurance ?? null, inv.requiresInsurance, hoy, warn)
  const pideAuto = resultado.vehicleInsuranceRequired && plate.trim() !== ''
  const estadoAuto = estadoDe(resultado.vehicle?.insurance ?? null, pideAuto, hoy, warn)
  const falta = (e: string) => e === 'sin_cargar' || e === 'vencido'

  // Campos abiertos: lo que falta o venció, y lo que el guardia está corrigiendo.
  // Con alguien adentro (egreso) o ya registrado, nada se abre.
  const activo = !hecho && !esEgreso
  const abiertoProv = activo && (falta(estadoProv) || corrigiendo.proveedor)
  const abiertoAuto = activo && (falta(estadoAuto) || corrigiendo.auto)
  const completoProv = estadoSeguroCargado(seguro) === 'completo'
  const completoAuto = estadoSeguroCargado(seguroAuto) === 'completo'

  // NO PASA por seguro: el guardia carga lo que falta y el ingreso se registra en el mismo paso.
  const cargaSeguro = !ok && rechazoPorSeguro(check)
  // Lo que falta tiene que estar completo; lo que se corrige, solo si se llenó.
  const listoParaGuardar = (!abiertoProv || !falta(estadoProv) || completoProv)
    && (!abiertoAuto || !falta(estadoAuto) || completoAuto)
  const mandaProv = abiertoProv && completoProv
  const mandaAuto = abiertoAuto && completoAuto
  const datos = (v: ValorSeguro) => ({ company: v.company.trim(), policy: v.policy.trim(), expiresOn: v.expiresOn })
```

`registrar()` pasa a:

```ts
  async function registrar() {
    setFechaPasada(false); setFechaPasadaAuto(false)
    try {
      const mov = esEgreso
        ? await egresar.mutateAsync(inv.id)
        : await ingresar.mutateAsync({
          invitationId: inv.id, guestName: inv.guestName,
          // plate va siempre, '' incluido: sin la clave la API usa la de la invitación, y "Viene a pie" la tiene que pisar.
          guestDoc: doc || undefined, plate,
          insurance: mandaProv ? datos(seguro) : undefined,
          vehicleInsurance: mandaAuto ? datos(seguroAuto) : undefined,
        })
      setHecho({ movimiento: mov, esEgreso })
    } catch (e) {
      // El toast de error ya lo muestra la mutación, salvo la fecha vencida: va bajo su campo.
      if (e instanceof ApiError && e.code === 'insurance_expired') setFechaPasada(true)
      if (e instanceof ApiError && e.code === 'vehicle_insurance_expired') setFechaPasadaAuto(true)
    }
  }
```

En `web/src/lib/queries/garita.ts`, `useRegistrarIngreso.onError` también calla `vehicle_insurance_expired`:

```ts
    onError: (e) => {
      if (!(e instanceof ApiError && (e.code === 'insurance_expired' || e.code === 'vehicle_insurance_expired'))) {
        toast.error('No se pudo registrar. Probá de nuevo.')
      }
    },
```

Los cálculos que siguen:

```ts
  const detalle = !ok ? detalleRechazo((check as { reason: string }).reason, inv,
    { franjas: resultado.franjas, tradeName: inv.tradeName, plate, vehicle: resultado.vehicle }) : null
  // …
  const avisoSeguro = ok && !esEgreso && estadoProv === 'por_vencer'
  const avisoAuto = ok && !esEgreso && estadoAuto === 'por_vencer'
  // "Autorizar igual" no sirve para un auto sin seguro si el barrio no lo permite.
  const puedeAutorizar = (check as { reason: string }).reason !== 'revoked'
    && !(rechazoPorAuto(check) && !resultado.vehicleInsuranceOverride)
  const quienAuto = resultado.vehicle
    // hoyISO de un instante da su día en Buenos Aires: cortar el ISO daría el de UTC.
    ? `Lo cargó ${resultado.vehicle.updatedByName ?? 'la guardia'} el ${fechaCompleta(hoyISO(new Date(resultado.vehicle.updatedAt)))}` : null
  const quienProv = resultado.provider?.insuranceSource === 'link' ? 'Lo cargó él desde su link'
    : resultado.provider?.insuranceSource === 'garita' ? 'Lo cargó la guardia' : null
```

Debajo de la línea `Seguro {textoVence(…)}` de la columna izquierda (que pasa a usar `resultado.provider?.insurance?.expiresOn`), sumar la del auto:

```tsx
          {avisoSeguro && resultado.provider?.insurance && (
            <p className="mt-1 text-xl font-semibold tabular text-espera sm:text-2xl lg:text-3xl">
              Seguro {textoVence(resultado.provider.insurance.expiresOn, hoy)}
            </p>
          )}
          {avisoAuto && resultado.vehicle && (
            <p className="mt-1 text-xl font-semibold tabular text-espera sm:text-2xl lg:text-3xl">
              Seguro del auto {textoVence(resultado.vehicle.insurance.expiresOn, hoy)}
            </p>
          )}
```

- [ ] **Step 3: La ficha por secciones**

En la columna derecha, reemplazar la `<dl>` de la ficha **y** el bloque `{cargaSeguro && !hecho && (<dl>…Compañía…Póliza…Vence…</dl>)}` por esto. La zona de acción de abajo queda igual, salvo lo del paso 4:

```tsx
          <div className="flex flex-col gap-7">
            <SeccionSeguro titulo={esProveedor ? 'Proveedor' : 'Visitante'} idBase="seguro-proveedor"
              estado={estadoProv} guardado={resultado.provider?.insurance ?? null} quien={quienProv}
              abierto={abiertoProv} valor={seguro} onCambio={(v) => { setSeguro(v); setFechaPasada(false) }}
              fechaPasada={fechaPasada}
              onCorregir={activo ? () => {
                const s = resultado.provider?.insurance
                if (s) setSeguro({ ...s })
                setCorrigiendo((c) => ({ ...c, proveedor: true }))
              } : undefined}
              onGuardar={corrigiendo.proveedor && doc.trim() ? () => corregir.mutate(
                { tipo: 'proveedor', doc, name: inv.guestName, insurance: datos(seguro) },
                { onSuccess: () => setCorrigiendo((c) => ({ ...c, proveedor: false })) }) : undefined}
              guardando={corregir.isPending}>
              {inv.note && <Dato etiqueta="Nota">{inv.note}</Dato>}
              {editable ? (
                <>
                  <dt className="self-start pt-2.5 opacity-80"><label htmlFor="doc-veredicto">Documento</label></dt>
                  <dd className="min-w-0">
                    {/* (el Input del documento, sus avisos y aria-describedby: igual que hoy) */}
                  </dd>
                </>
              ) : (
                <Dato etiqueta="Documento">{doc || inv.guestDoc || '—'}</Dato>
              )}
              <Dato etiqueta="Tipo">{KIND_LABEL[inv.kind]}{inv.tradeName && ` · ${inv.kind === 'frecuente' ? `${KIND_LABEL.proveedor} · ` : ''}${inv.tradeName}`}</Dato>
            </SeccionSeguro>

            <SeccionSeguro titulo="Vehículo" idBase="seguro-auto"
              estado={estadoAuto} guardado={resultado.vehicle?.insurance ?? null} quien={quienAuto}
              abierto={abiertoAuto} valor={seguroAuto} onCambio={(v) => { setSeguroAuto(v); setFechaPasadaAuto(false) }}
              fechaPasada={fechaPasadaAuto}
              onCorregir={activo && pideAuto ? () => {
                const s = resultado.vehicle?.insurance
                if (s) setSeguroAuto({ ...s })
                setCorrigiendo((c) => ({ ...c, auto: true }))
              } : undefined}
              onGuardar={corrigiendo.auto && plate.trim() ? () => corregir.mutate(
                { tipo: 'auto', plate, insurance: datos(seguroAuto) },
                { onSuccess: () => setCorrigiendo((c) => ({ ...c, auto: false })) }) : undefined}
              guardando={corregir.isPending}>
              {editable ? (
                <>
                  <dt className="self-start pt-2.5 opacity-80"><label htmlFor="patente-veredicto">Patente</label></dt>
                  <dd className="min-w-0">
                    <Input id="patente-veredicto" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                      className="tabular h-12 border-control bg-card text-xl uppercase" />
                    {/* Una sugerencia, no un vínculo: sale del último ingreso de este DNI. */}
                    {resultado.lastPlate && !mismaPatente(resultado.lastPlate, plate) && (
                      <button type="button" onClick={() => setPlate(resultado.lastPlate!)}
                        className="mt-1 min-h-11 text-base font-semibold underline underline-offset-4">
                        Última vez: {resultado.lastPlate}
                      </button>
                    )}
                  </dd>
                </>
              ) : (
                <Dato etiqueta="Patente">{plate || inv.plate || '—'}</Dato>
              )}
            </SeccionSeguro>

            <section aria-labelledby="seccion-invitacion" className="flex flex-col gap-2.5">
              <h2 id="seccion-invitacion" className="text-sm font-bold uppercase tracking-[0.08em] opacity-80">Invitación</h2>
              <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-lg sm:text-xl">
                <Dato etiqueta="Lote">{inv.unitLabel} · invita {inv.inviterName}</Dato>
                {!esEgreso && <Dato etiqueta="Vigencia">{vigencia(inv)}</Dato>}
                {/* (Cupo, Entró y Salió: los mismos tres bloques de hoy, sin cambios) */}
              </dl>
            </section>
          </div>
```

Los dos comentarios entre paréntesis indican que hay que **mover tal cual** el JSX que ya existe: el `<Input id="doc-veredicto" …/>` con sus tres párrafos (`doc-leido`, `doc-no-coincide`, `doc-falta`), y los bloques `{inv.capacity > 1 && …}`, `{entro && …}` y `{salio && …}`. Borrar las filas sueltas `Lote` e `Invita` viejas: ahora son una sola fila. La fila `Seguro` vieja (`{inv.requiresInsurance && !cargaSeguro && …}`) también se borra: la muestra `SeccionSeguro`. En los `<dt>` que quedan, `opacity-70` pasa a `opacity-80` (contraste AA sobre NO PASA).

`editable` pasa a: `const editable = (ok && !esEgreso && !hecho) || cargaSeguro`. Es igual que hoy, pero ahora `cargaSeguro` incluye al auto.

- [ ] **Step 4: Zona de acción**

En la rama `ok` (pendiente), el botón principal:

```tsx
                  <button ref={accionRef} onClick={registrar}
                    disabled={registrando || (!esEgreso && !doc.trim()) || !listoParaGuardar}
                    className="flex min-h-16 items-center justify-center gap-2 rounded bg-ink text-xl font-bold text-card transition-colors disabled:bg-ink/40">
                    {registrando && <Loader2 className="size-5 animate-spin" aria-hidden />}
                    {registrando ? 'Registrando…' : esEgreso ? 'Registrar egreso'
                      : mandaProv || mandaAuto ? 'Guardar seguro y registrar ingreso' : 'Registrar ingreso'}
                  </button>
```

En la rama de rechazo con `cargaSeguro`, el botón principal:

```tsx
                      <button ref={accionRef} onClick={registrar} disabled={registrando || !listoParaGuardar || !doc.trim()}
                        className="flex min-h-16 w-full items-center justify-center gap-2 rounded bg-no-pasa-texto text-xl font-bold text-no-pasa disabled:opacity-40">
                        {registrando && <Loader2 className="size-5 animate-spin" aria-hidden />}
                        {registrando ? 'Registrando…' : 'Guardar seguro y registrar ingreso'}
                      </button>
                      {rechazoPorAuto(check) && (
                        <button onClick={() => { setPlate(''); setSeguroAuto(VACIO) }}
                          className="min-h-14 w-full rounded border-2 border-current/40 text-lg font-bold">
                          Viene a pie
                        </button>
                      )}
```

Y las dos condiciones `(check as { reason: string }).reason !== 'revoked'` de "Autorizar igual…" y "Anular esta invitación…" pasan a usar `puedeAutorizar` en la de Autorizar. La de Anular queda igual.

- [ ] **Step 5: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint && npm run check`
Expected: sin errores

Con el stack levantado (`docker compose up -d --build`) y el demo cargado (`docker compose exec -T db psql -U invitaciones -v ON_ERROR_STOP=1 < api/scripts/demo.sql`), entrar como guardia (`ramon` / `pass123`) y abrir desde la garita:
1. **Hugo Ríos** (adentro, AE 482 KL vencido) → EGRESO. Las tres secciones se ven y no se abren campos.
2. **Ramiro Peralta** (albañil, seguro vencido, AD 301 MN) → NO PASA · Seguro vencido. La sección Proveedor abre los campos y Vehículo dice "Vence en 5 días".
3. **Tomás Álvarez** o cualquier visita sin patente: tipear `AB 123 CD` → en menos de un segundo pasa a NO PASA · Sin seguro del auto. "Viene a pie" vuelve a INGRESO.
4. Corregir el seguro de AC 915 PR desde una visita con esa patente → "Guardar corrección" → toast "Seguro actualizado." → Volver → reabrir: el seguro nuevo está.

Sacar capturas a 1440×900 y a 390×844 de los casos 2 y 3 (con `superpowers`/`run` o un script Playwright como el de la sesión de diseño) y revisarlas contra `.superpowers/brainstorm/8-1792885331/content/garita-secciones.html`. Si el hook de impeccable marca contraste sobre NO PASA, subir la opacidad del texto chico.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/(garita)/garita/invitacion/[id]/page.tsx" web/src/lib/queries/garita.ts
git commit -m "feat: veredicto por secciones con el seguro del auto"
```

---

### Task 6: El vecino deja de cargar el seguro

**Files:**
- Modify: `web/src/components/vecino/formulario-invitacion.tsx`, `web/src/app/(vecino)/invitaciones/nueva/page.tsx`, `web/src/lib/invitations.ts`, `web/src/lib/queries/invitaciones.ts`

**Interfaces:**
- Produces: `Invitation` sin `insuranceCompany/insurancePolicy/insuranceExpiresOn` (`requiresInsurance` queda). `DatosInvitacion` sin `insurance`. `urlVolverAInvitar` sin los parámetros `ins*`. Si el rubro pide seguro, el formulario muestra la nota: "El rubro {nombre} necesita seguro para entrar. Lo carga él desde su link o la guardia en la entrada."

- [ ] **Step 1: Sacar el seguro**

`web/src/components/vecino/formulario-invitacion.tsx`:
- Borrar el import de `campos-seguro`, el `useState` de `seguro`, `errores.seguro`, el `seguro: true` de `setTocado` en `submit`, el bloque `// Completo se manda…` de `datos`, el `if (… 'seguro_no_aplica') {…}` y el `if (!…requiresInsurance) setSeguro(…)` del `onValueChange` del rubro.
- `inicial` pierde `; seguro: ValorSeguro`.
- El bloque `{pideSeguro && (<section …>…<CamposSeguro …/></section>)}` pasa a:

```tsx
      {pideSeguro && (
        <p role="status" className="rounded-md bg-surface-sunk/70 p-3 text-sm text-ink-soft">
          El rubro {nombreRubro} necesita seguro para entrar. Lo carga él desde su link o la guardia en la entrada.
        </p>
      )}
```

`web/src/app/(vecino)/invitaciones/nueva/page.tsx`: sacar `insCompany`, `insPolicy`, `insExpires` del tipo de `searchParams` y la línea `seguro: …` del `inicial`.

`web/src/lib/invitations.ts`: sacar los tres campos `insurance*` de `Invitation`. `urlVolverAInvitar` pasa a:

```ts
/** "Volver a invitar": el formulario nuevo precargado con los datos de esta. */
export function urlVolverAInvitar(inv: Pick<Invitation, 'kind' | 'guestName' | 'guestDoc' | 'plate'>): string {
  const p = new URLSearchParams({ kind: inv.kind, guestName: inv.guestName })
  if (inv.guestDoc) p.set('guestDoc', inv.guestDoc)
  if (inv.plate) p.set('plate', inv.plate)
  return `/invitaciones/nueva?${p}`
}
```

`web/src/lib/queries/invitaciones.ts`: sacar `insurance?: …` de `DatosInvitacion`.

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npm run lint && npm run check`
Expected: sin errores (`tsc` encuentra cualquier otro lector de `insuranceCompany` en el vecino: borrarlo)

- [ ] **Step 3: Commit**

```bash
git add web/src
git commit -m "feat: el vecino ya no carga el seguro del proveedor"
```

---

### Task 7: El proveedor carga su seguro con su DNI

**Files:**
- Modify: `web/src/app/i/[token]/page.tsx`

**Interfaces:**
- Consumes: `GET /invitations/public/:token` con `insuranceExpiresOn`; `PATCH` con `400 doc_required` (plan 1, Task 9).
- Produces: si el rubro pide seguro y la invitación no tiene DNI, el campo Documento se muestra aunque el proveedor solo quiera cargar el seguro, y pasa a ser obligatorio para guardarlo. Con un seguro vigente se ve "Tu seguro vence el 12/03/2027. Cargalo de nuevo solo si lo renovaste."

- [ ] **Step 1: Cambiar el formulario**

En el tipo `Publica`, después de `insuranceState`: `insuranceExpiresOn: string | null` e `insuranceVerified: boolean`.

**Seguro verificado por la guardia** (regla agregada después del plan 1, commit `90a2afb`): si `insuranceVerified` es true, la API rechaza la carga desde el link con `409 seguro_verificado`. En ese caso el bloque "Tu seguro" **no muestra los campos**, solo `La guardia ya verificó tu seguro: vence el {fechaCompleta(venceSeguro)}.` en `text-verde`. Y si el rubro pide seguro, la invitación no tiene DNI faltante ni patente faltante y el seguro está verificado, `FormularioDatos` no se muestra (no hay nada para cargar). `FormularioDatos` suma la prop `seguroVerificado: boolean`. En `onError`, `seguro_verificado` muestra la misma frase en el `Nota` de error.

`FormularioDatos` suma la prop `venceSeguro: string | null` y el estado `const [faltaDocSeguro, setFaltaDocSeguro] = useState(false)`. En `onError`:

```ts
    onError: (e) => {
      setVencido(e instanceof ApiError && e.code === 'seguro_vencido')
      setFaltaDocSeguro(e instanceof ApiError && e.code === 'doc_required')
    },
```

En el `onSubmit`, antes de `guardar.mutate()`:

```ts
      // El seguro queda guardado a nombre del DNI: sin DNI no hay a quién asignarlo.
      if (pideSeguro && faltaDoc && estadoSeguroCargado(seguro) === 'completo' && !doc.trim()) {
        setFaltaDocSeguro(true)
        return
      }
```

El campo Documento se muestra con `{faltaDoc && (soloSeguro ? pideSeguro : true) && (…)}`: un frecuente que ya entró y no tenía DNI lo necesita para el seguro. Al `Campo` del documento se le agrega `error={faltaDocSeguro ? 'Para guardar el seguro, cargá tu documento.' : null}`.

Los dos avisos del seguro pasan a:

```tsx
          {estadoSeguro === 'vigente' && venceSeguro && (
            <p className="text-sm font-semibold text-verde">
              Tu seguro vence el {fechaCompleta(venceSeguro)}. Cargalo de nuevo solo si lo renovaste.
            </p>
          )}
          {estadoSeguro === 'vencido' && <p className="text-sm font-semibold text-alto">Tu seguro está vencido. Cargá el nuevo.</p>}
```

(`fechaCompleta` de `@/lib/fechas`.) En el uso de `<FormularioDatos …>` sumar `venceSeguro={inv.insuranceExpiresOn}`.

- [ ] **Step 2: Verificar en la app**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sin errores

Como vecino, crear un proveedor de un rubro que pide seguro, sin DNI. Abrir su link en una ventana privada, cargar solo el seguro → "Para guardar el seguro, cargá tu documento." Cargar el DNI → "Listo." Recargar → "Tu seguro vence el …".

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/i/[token]/page.tsx"
git commit -m "feat: el proveedor carga su seguro con su dni desde el link"
```

---

### Task 8: Los switches del seguro del auto en Barrio

**Files:**
- Modify: `web/src/app/(admin)/admin/barrio/page.tsx`, `web/src/lib/queries/admin.ts`

**Interfaces:**
- Produces: en *Barrio → Alertas*, dos switches: "Pedir seguro del auto" y "Permitir autorizar igual sin seguro del auto" (el segundo, deshabilitado con el primero apagado). Se guardan con el botón Guardar del formulario.

- [ ] **Step 1: Escribir**

`web/src/lib/queries/admin.ts`: en `Barrio`, `vehicleInsuranceRequired: boolean` y `vehicleInsuranceOverride: boolean`. En el tipo de `mutationFn` de `useGuardarBarrio`, `vehicleInsuranceRequired?: boolean; vehicleInsuranceOverride?: boolean`.

`web/src/app/(admin)/admin/barrio/page.tsx`: estado `const [pideAuto, setPideAuto] = useState(false)` y `const [excepcionAuto, setExcepcionAuto] = useState(true)`. En la precarga: `setPideAuto(barrio.data.vehicleInsuranceRequired); setExcepcionAuto(barrio.data.vehicleInsuranceOverride)`. En `guardarForm`, dentro de `mutateAsync({...})`: `vehicleInsuranceRequired: pideAuto, vehicleInsuranceOverride: excepcionAuto`.

En el fieldset Alertas, después del bloque "Seguro por vencer" y antes del `<p>` explicativo:

```tsx
            <div className="flex flex-col gap-2">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <Switch checked={pideAuto} onCheckedChange={setPideAuto} aria-label="Pedir seguro del auto" />
                Pedir seguro del auto
              </label>
              <label className={`flex min-h-11 items-center gap-3 pl-12 text-sm ${pideAuto ? '' : 'text-ink-soft'}`}>
                <Switch checked={excepcionAuto} disabled={!pideAuto} onCheckedChange={setExcepcionAuto}
                  aria-label="Permitir autorizar igual sin seguro del auto" />
                Permitir autorizar igual sin seguro del auto
              </label>
            </div>
```

Al `<p>` explicativo sumarle: ` Con el seguro del auto pedido, la garita frena a todo el que entra en auto sin un seguro vigente cargado; si no permitís autorizar igual, ese auto no entra (la persona puede entrar a pie).`

- [ ] **Step 2: Verificar**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sin errores. En la app: prender, Guardar, recargar → queda prendido.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(admin)/admin/barrio/page.tsx" web/src/lib/queries/admin.ts
git commit -m "feat: el admin prende el pedido del seguro del auto"
```

---

### Task 9: E2E

**Files:**
- Modify: `web/e2e/seguro-proveedor.spec.ts`
- Create: `web/e2e/seguro-auto.spec.ts`

**Interfaces:**
- Consumes: los textos de la Task 5.

- [ ] **Step 1: Ajustar el e2e del proveedor**

En `web/e2e/seguro-proveedor.spec.ts`:
- El DNI pasa a ser único por corrida. Con el padrón, un `30111222` de una corrida anterior ya tiene seguro y el veredicto pasaría a INGRESO al tipearlo: `const dni = String(Date.now()).slice(-8)`, y `fill(dni)` en lugar de `fill('30111222')`.
- `getByLabel('Póliza')` pasa a `getByLabel('Número de póliza')`, que es la etiqueta de `CamposSeguro`.
- Después de llenar el documento, esperar el recálculo antes de los campos: `await expect(g.getByText('Falta el seguro')).toBeVisible()`.
- Los tres campos del seguro van dentro de la sección: `const prov = g.getByRole('region', { name: 'Proveedor' })` y `prov.getByLabel('Compañía')`, etc.

- [ ] **Step 2: Escribir el e2e del auto**

`web/e2e/seguro-auto.spec.ts`:

```ts
import { entrar, expect, test } from './sesion'

const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

test('un auto sin seguro no pasa; el guardia lo carga y la segunda vez pasa sin pedirlo', async ({ page, browser }) => {
  const sufijo = String(Date.now()).slice(-6)
  // Patente única por corrida: un auto de una corrida anterior ya tendría seguro.
  const patente = `E2E${sufijo}`
  const nombre = `Visita en auto E2E ${sufijo}`

  await entrar(page, 'admin')
  const prender = await page.request.patch(`${API}/admin/neighborhood`, { data: { vehicleInsuranceRequired: true } })
  expect(prender.ok()).toBe(true)
  try {
    const vecino = await browser.newContext()
    const v = await vecino.newPage()
    await entrar(v, 'vecino')
    for (const n of [1, 2]) {
      await v.goto('/invitaciones/nueva')
      await v.getByLabel('Nombre del invitado').fill(`${nombre} ${n}`)
      await v.getByLabel('Patente').fill(patente)
      await v.getByRole('button', { name: 'Crear invitación' }).click()
      await expect(v).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)
    }
    await vecino.close()

    const guardia = await browser.newContext()
    const g = await guardia.newPage()
    await entrar(g, 'guardia')

    await g.getByLabel('Buscar invitado').fill(`${nombre} 1`)
    await g.getByRole('option', { name: new RegExp(`${nombre} 1`) }).click()
    await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
    await expect(g.getByText('Sin seguro del auto')).toBeVisible()

    const vence = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10)
    await g.getByLabel('Documento').fill(String(Date.now()).slice(-8))
    const auto = g.getByRole('region', { name: 'Vehículo' })
    await auto.getByLabel('Compañía').fill('Seguros E2E')
    await auto.getByLabel('Número de póliza').fill('AUTO-1')
    await auto.getByLabel('Vence').fill(vence)
    await g.getByRole('button', { name: 'Guardar seguro y registrar ingreso' }).click()
    await expect(g.getByRole('status').filter({ hasText: 'Registrado' })).toBeVisible()

    await g.goto('/garita')
    await g.getByLabel('Buscar invitado').fill(`${nombre} 2`)
    await g.getByRole('option', { name: new RegExp(`${nombre} 2`) }).click()
    await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
    await expect(g.getByRole('region', { name: 'Vehículo' }).getByText('Seguro vigente')).toBeVisible()
    await guardia.close()
  } finally {
    await page.request.patch(`${API}/admin/neighborhood`, { data: { vehicleInsuranceRequired: false } })
  }
})
```

Si el veredicto se llama distinto de `heading` "NO PASA"/"INGRESO", copiar el selector del e2e del proveedor (es el mismo `motion.h1`).

- [ ] **Step 3: Correr**

Run: `docker compose up -d --build && cd web && npx playwright test e2e/seguro-proveedor.spec.ts e2e/seguro-auto.spec.ts --workers=1`
Expected: 2 passed

Run: `cd web && npm run e2e -- --workers=1`
Expected: todo en verde. Si `alta-expres` o `garita` fallan por el bloque del seguro que ya no está, actualizar ese selector: el seguro se carga en el veredicto.

- [ ] **Step 4: Commit**

```bash
git add web/e2e
git commit -m "feat: e2e del seguro del auto en la barrera"
```

---

## Cierre de la fase 1 + 2

- [ ] `cd api && npm test && npx tsc --noEmit`
- [ ] `cd web && npm run check && npm run lint && npx tsc --noEmit && npm run e2e -- --workers=1`
- [ ] README, sección **Seguro del proveedor**: reescribir. El seguro vive en el padrón por DNI y lo carga el proveedor desde su link o la guardia; el vecino ya no lo carga. Sumar un párrafo **Seguro del auto**: el admin lo pide en *Barrio → Alertas*, lo carga solo la guardia con el certificado a la vista, se guarda por patente, y la segunda vez el auto pasa sin que se lo pidan. Commit `feat: readme del padrón y del seguro del auto`.
