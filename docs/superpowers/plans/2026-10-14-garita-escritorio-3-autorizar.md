# Garita en escritorio · Plan 3: "Autorizar igual" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el NO PASA (salvo anulada), "Autorizar igual" abre el alta exprés precargada con nombre, documento, patente y lote de la invitación rechazada; al crear, el veredicto nuevo reemplaza al rechazo (spec 3.3). Requiere los planes 1 y 2.

**Architecture:** `AltaExpres` gana una prop `inicial` que se aplica al abrir (mismo ajuste durante el render que ya usa para `abierto`/`lectura`) y se monta también en el veredicto. Sin cambios en la API: el veredicto ya trae `unitId`.

**Tech Stack:** Next.js 16 / React 19, Radix Sheet, TanStack Query 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-garita-escritorio-design.md`

## Global Constraints

- Código, nombres y comentarios en español; UI en voseo. Colores solo con tokens.
- Nunca "Autorizar igual" en una invitación anulada (`check.reason === 'revoked'`).
- La invitación rechazada no se toca; la nueva es una alta exprés normal (`POST /gate/invitations`).
- Leer el DNI nunca registra el ingreso; con el alta abierta, un DNI completa el alta (como en `/garita`).
- Commits en español minúscula + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `-am` / `add -A`.

---

### Task 1: "Autorizar igual"

**Files:** Modify `web/src/lib/gate.ts`, `web/src/components/garita/alta-expres.tsx`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`; Test `web/e2e/garita.spec.ts`.

- [ ] **Step 1: `Resultado` suma `unitId`.** En `web/src/lib/gate.ts`, dentro de `invitation`: `unitId: string` (la API ya lo manda: `loadForCheck` en `api/src/services/entries.ts`).

- [ ] **Step 2: `AltaExpres` acepta `inicial`.** Nueva prop opcional:

```ts
export type InicialAlta = { guestName: string; guestDoc: string; plate: string; unidad: UnidadHit }
```

(exportado desde `alta-expres.tsx`), en la firma: `inicial?: InicialAlta`. En el ajuste existente sobre `abierto`, sumar la rama de apertura:

```tsx
  if (abierto !== abiertoVisto) {
    setAbiertoVisto(abierto)
    if (!abierto) { setGuestName(''); setUnidad(null); setQUnidad(''); setGuestDoc(''); setPlate('') }
    // "Autorizar igual": todo lo que ya se sabe de la invitación rechazada, lote incluido.
    else if (inicial) {
      setGuestName(inicial.guestName); setUnidad(inicial.unidad)
      setGuestDoc(inicial.guestDoc); setPlate(inicial.plate)
    }
  }
```

`lectura` pasa a ser opcional (`lectura?: LecturaDni | null`, default `null`) para no obligar al veredicto a pasarla cuando no hay.

- [ ] **Step 3: E2E que falla primero** — al final de `web/e2e/garita.spec.ts`:

```ts
test('un NO PASA por cupo se puede autorizar igual, con todo precargado', async ({ page, browser }) => {
  const nombre = `Autorizar E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  // Ingreso y egreso: la visita agota su cupo de 1.
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await g.getByLabel('Documento').fill('30111222')
  await g.getByRole('button', { name: 'Registrar ingreso' }).click()
  await g.getByRole('button', { name: /^Siguiente/ }).click()
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await g.getByRole('button', { name: 'Registrar egreso' }).click()
  await g.getByRole('button', { name: /^Siguiente/ }).click()

  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).first().click()
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByText('Cupo agotado')).toBeVisible()
  await g.getByRole('button', { name: 'Autorizar igual' }).click()

  await expect(g.getByLabel('Nombre del invitado')).toHaveValue(nombre)
  await expect(g.getByLabel('Documento (opcional)')).toHaveValue('30111222')
  await expect(g.getByRole('button', { name: 'Cambiar' })).toBeVisible() // el lote ya está elegido
  await g.getByRole('button', { name: 'Autorizar ingreso' }).click()

  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
})

test('una invitación anulada no se puede autorizar igual', async ({ page, browser }) => {
  const nombre = `Anulada E2E ${Date.now()}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await page.getByRole('button', { name: 'Anular invitación' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click()

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByText(nombre).click()
  await expect(g.getByRole('heading', { name: 'NO PASA', exact: true })).toBeVisible()
  await expect(g.getByRole('button', { name: 'Autorizar igual' })).toHaveCount(0)
})
```

Correr `cd web && npm run e2e -- garita -g "autorizar igual"` → el primero falla (no existe el botón).

- [ ] **Step 4: El veredicto monta el alta.** En `invitacion/[id]/page.tsx`:
  - Estado: `const [altaAbierta, setAltaAbierta] = useState(false)`, `const [disparadorAlta, setDisparadorAlta] = useState<HTMLButtonElement | null>(null)`, `const [lecturaAlta, setLecturaAlta] = useState<LecturaDni | null>(null)`.
  - **Esc**: el efecto de Escape pasa a depender de `[altaAbierta]` y no escucha mientras el alta está abierta (`if (altaAbierta) return` al principio del efecto): si no, el Esc que cierra el sheet también saca del veredicto.
  - **Lectora**: en `leer`, antes de la rama del DNI: `if (altaAbierta) { setLecturaAlta(l); return }` para un DNI (el QR sigue navegando con `abrirQr`).
  - En el bloque `"rechazo"`, antes del "Volver (Esc)" (que conserva `ref={accionRef}`: el foco cae en Volver, así un Enter no autoriza a nadie):

```tsx
              {/* El vecino ya dijo que sí por teléfono. Una anulada no: ahí dijo que no. */}
              {(check as { reason: string }).reason !== 'revoked' && (
                <button onClick={(e) => { setDisparadorAlta(e.currentTarget); setAltaAbierta(true) }}
                  className="min-h-16 w-full rounded bg-deny-ink text-xl font-bold text-deny-field">
                  Autorizar igual
                </button>
              )}
```

  (el contenedor del bloque pasa a `className="flex flex-col gap-3"`).
  - Al final del `<main>`:

```tsx
      <AltaExpres abierto={altaAbierta} disparador={disparadorAlta}
        onAbiertoChange={(v) => { setAltaAbierta(v); if (!v) setLecturaAlta(null) }}
        lectura={lecturaAlta}
        inicial={{
          guestName: inv.guestName,
          guestDoc: doc || inv.guestDoc || '',
          plate: plate || inv.plate || '',
          unidad: { unitId: inv.unitId, unitLabel: inv.unitLabel, residentName: quienInvita(inv.inviterName) },
        }}
        // replace: "Volver" en el veredicto nuevo lleva a donde estaba el guardia antes del rechazo.
        onCreada={(nuevo) => router.replace(`/garita/invitacion/${nuevo}`)}
        onQr={(token) => leer({ tipo: 'qr', token })} />
```

- [ ] **Step 5: Verificar.** `cd web && npm run check && npm run lint && npx tsc --noEmit`; stack levantado y rebuild (`docker compose up -d --build`); `cd web && npm run e2e` (la suite completa, no solo garita) → todo pasa en los dos proyectos.

- [ ] **Step 6: Revisión visual** con un script de Playwright descartable en el scratchpad (no en el repo): 390, 768, 1280 px, claro y oscuro, de: veredicto INGRESO (con "Leído del DNI" y con "No coincide"), EGRESO, NO PASA con y sin "Autorizar igual", registrado; `/garita` con el recuadro antes y después de leer; el alta abierta sobre el veredicto. Adjuntar las rutas de las capturas en el reporte; corregir lo que se vea cortado o ilegible.

- [ ] **Step 7: Commit** — por path: `git commit -m "feat: autorizar igual desde el no pasa"` (+ trailer).
