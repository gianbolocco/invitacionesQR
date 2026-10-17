# Lectora 2D · Plan 4: veredicto, escáner y e2e — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El veredicto completa el Documento leído y avisa si no coincide (3.8), el escáner de cámara lee PDF417 (3.10), e2e y guía de instalación.

**Architecture:** Todo DNI que no se resuelve en el lugar viaja a `/garita` en memoria (caché de TanStack, clave fuera de `['garita']`) y ahí se resuelve. Requiere planes 1, 2 y 3.

**Tech Stack:** Next.js 16 / React 19, TanStack Query 5, html5-qrcode 2.3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-lectora-2d-design.md`

## Global Constraints

- Código, nombres y comentarios en español; textos de UI en voseo.
- Colores solo con tokens. Del DNI nada en la URL ni en la API salvo el número en `/gate/search` (spec 3.6).
- Leer el DNI **nunca** registra el ingreso: completa y enfoca "Registrar ingreso".
- Commits en español minúscula con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Consume de planes 1 a 3:** `useAbrirQr`, `useDniPendiente`, `useDocumentoLeido` (`@/lib/queries/garita`), `mensajeDeError` (`@/lib/gate`); `interpretarLectura`, `soloDigitos`, `NO_RECONOCIDO`, `type Lectura`, `type LecturaDni` (`@/lib/lectora`); `useLectora({ onLectura })`, `useCampoLectora(valor, alLeer)` (`@/lib/use-lectora`).

---

### Task 1: Veredicto

**Files:** Modify `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`.

- [ ] **Step 1: Hooks** — debajo de `const deshacerMov = …`:

```tsx
  const abrirQr = useAbrirQr()
  const dniPendiente = useDniPendiente()
  const documentoLeido = useDocumentoLeido()
```

En el bloque de precarga durante el render, el documento leído gana sobre el de la invitación:
`setDoc(documentoLeido.ver(q.data.invitation.id) ?? q.data.invitation.guestDoc ?? '')`.

Y antes de los `if (q.isPending)`:

```tsx
  // Se consume al salir: volver a abrir esta invitación más tarde no lo trae.
  useEffect(() => () => documentoLeido.borrar(id), [id, documentoLeido])

  /*
   * Con un ingreso pendiente, un DNI es el de quien está adelante: completa y
   * enfoca "Registrar ingreso" (nunca registra solo). Si no, es el siguiente
   * invitado. Un QR siempre es el siguiente; replace para que Volver lleve a
   * donde estaba el guardia antes del primero.
   */
  async function leer(l: Lectura | null) {
    if (!l) { toast.error(NO_RECONOCIDO); return }
    if (l.tipo === 'qr') {
      try { await abrirQr(l.token, true) } catch (e) { toast.error(mensajeDeError(e)) }
      return
    }
    if (q.data && !hecho && !q.data.adentro && q.data.check.ok) {
      setDoc(l.documento)
      accionRef.current?.focus()
      return
    }
    dniPendiente.dejar(l)
    router.push('/garita')
  }
  useLectora({ onLectura: (texto) => leer(interpretarLectura(texto)) })
  const teclaDoc = useCampoLectora(doc, leer)
```

- [ ] **Step 2: Campo y aviso** — en el `Input` de Documento: `onKeyDown={teclaDoc}`. Justo antes del `<div className="flex flex-col gap-3 sm:flex-row">` de los campos:

```tsx
              {/* Spec 3.8: avisa, no bloquea. Por dígitos: 30.123.456 y 30123456 son el mismo. */}
              {!esEgreso && inv.guestDoc && doc.trim() && soloDigitos(doc) !== soloDigitos(inv.guestDoc) && (
                <p role="alert" className="text-lg font-semibold">
                  El DNI no coincide con el de la invitación ({inv.guestDoc}).
                </p>
              )}
```

- [ ] **Step 3:** `cd web && npm run lint && npx tsc --noEmit` → limpio.
- [ ] **Step 4: Commit** — `git commit -am "feat: el veredicto completa el documento leído y avisa si no coincide"`

---

### Task 2: El escáner de cámara lee el DNI

**Files:** Modify `web/src/app/(garita)/garita/escanear/page.tsx`.

- [ ] **Step 1:** Borrar `tokenDelQr` y `mensajeDeError` locales. Imports: `Html5Qrcode, Html5QrcodeSupportedFormats` de `html5-qrcode`; `mensajeDeError` de `@/lib/gate`; `useAbrirQr, useDniPendiente` en lugar de `usePrecargarVeredicto`; `interpretarLectura` de `@/lib/lectora`; se va `porToken`.
- [ ] **Step 2:** El constructor:

```tsx
    const scanner = new Html5Qrcode('reader', {
      verbose: false,
      // PDF417 es el código del DNI. El BarcodeDetector nativo (Chrome en
      // Android) lo lee bastante mejor que la implementación en JS.
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417],
      useBarCodeDetectorIfSupported: true,
    })
```

- [ ] **Step 3:** En el callback, reemplazar desde `const token = tokenDelQr(texto)` hasta el final del `try/catch`:

```tsx
        const l = interpretarLectura(texto)
        if (!l) {
          if (vivo) {
            setError('Ese código no es de VisitPass. Enfocá el QR de la invitación o el DNI.')
            setValidando(false)
          }
          procesando.current = false
          return
        }
        if (l.tipo === 'dni') {
          if (vivo) { dniPendiente.dejar(l); router.push('/garita') }
          return
        }
        try {
          if (vivo) await abrirQr(l.token)
        } catch (e) {
          if (vivo) { setError(mensajeDeError(e)); setValidando(false) }
        } finally {
          procesando.current = false
        }
```

Deps del efecto: `[me, router, abrirQr, dniPendiente]` (todas estables). Pie: `Centrá el QR o el código del DNI en el marco. Si cuesta, que el invitado suba el brillo.`

- [ ] **Step 4:** `cd web && npm run lint && npx tsc --noEmit`. **Commit** — `git commit -am "feat: el escáner de cámara lee también el dni"`

---

### Task 3: E2E y guía de instalación

**Files:** Modify `web/e2e/garita.spec.ts`, `README.md`.

- [ ] **Step 1: Tests** — al final de `web/e2e/garita.spec.ts` (texto limpio: `keyboard.type` de Playwright no tipea `Ñ` como tecla; la reparación ya la cubre `lectora.check.ts`):

```ts
/** Una lectora: ráfaga de 5 ms por tecla y Enter, sin campo enfocado. */
async function leerConLectora(page: import('@playwright/test').Page, texto: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.type(texto, { delay: 5 })
  await page.keyboard.press('Enter')
}
const dni = (doc: string, apellido: string) => `00700000001@${apellido}@JUAN@M@${doc}@A@01/01/1990@01/01/2020@123`

test('leer el DNI con la lectora abre la invitación con el documento cargado', async ({ page, browser }) => {
  const doc = String(Date.now()).slice(-8)
  const nombre = `Lectora E2E ${doc}`
  await entrar(page, 'vecino')
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Documento').fill(`${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5)}`)
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page).toHaveURL(/\/invitaciones\/[0-9a-f-]{36}\?creada=1$/)

  const g = await (await browser.newContext()).newPage()
  await entrar(g, 'guardia')
  await g.goto('/garita')
  await leerConLectora(g, dni(doc, 'LECTORA'))
  await expect(g).toHaveURL(/\/garita\/invitacion\/[0-9a-f-]{36}$/)
  await expect(g.getByRole('heading', { name: 'INGRESO', exact: true })).toBeVisible()
  await expect(g.getByLabel('Documento')).toHaveValue(doc)
  // El Enter de la lectora no registró nada: decide el guardia.
  await expect(g.getByRole('button', { name: 'Registrar ingreso' })).toBeFocused()
})

test('un DNI sin invitación abre el alta exprés con nombre y documento', async ({ page }) => {
  const doc = String(Date.now()).slice(-8)
  await entrar(page, 'guardia')
  await page.goto('/garita')
  await leerConLectora(page, dni(doc, `ZZSINVIT${doc}`))
  await expect(page.getByRole('heading', { name: 'Autorizar sin invitación' })).toBeVisible()
  await expect(page.getByLabel('Nombre del invitado')).toHaveValue(`Juan Zzsinvit${doc}`)
  await expect(page.getByLabel('Documento (opcional)')).toHaveValue(doc)
})
```

- [ ] **Step 2:** `docker compose up -d --build && cd web && npm run e2e -- garita` → todos PASS (los nuevos y los que había).

- [ ] **Step 3: README** — en "Desplegar", antes de "### En Coolify", agregar:

```markdown
### Lectora 2D en la garita

Cualquier lectora 2D (USB, dongle o Bluetooth) en **modo teclado (HID)** lee el
QR de la invitación y el DNI desde `/garita`, sin campo enfocado. Configurarla
con terminador Enter (Tab o ninguno también andan) y **envío inmediato**, no en
modo inventario. La distribución de teclado puede quedar en US aunque Windows
esté en español: el texto deformado se repara solo. Para instalarla, *Garita →
Probar lectora* muestra qué mandó y cómo se entendió. Los modos HID-POS y
Alt+numpad no sirven: el navegador no recibe texto.
```

- [ ] **Step 4: Commit** — `git add web/e2e/garita.spec.ts README.md && git commit -m "feat: e2e de la lectora y guía de instalación"`

- [ ] **Step 5: Prueba a mano** (spec §6): lectora USB real (QR y DNI) en `/garita` y en el veredicto, una Bluetooth si hay, y la cámara de un Android con un DNI.
