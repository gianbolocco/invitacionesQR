# Lectora 2D · Plan 3: garita, veredicto y escáner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablear las lecturas (spec 3.5, 3.7, 3.8, 3.10): `/garita` resuelve DNI y QR, el veredicto completa el Documento y avisa si no coincide, el escáner lee PDF417.

**Architecture:** Todo DNI que no se resuelve en el lugar viaja a `/garita` en memoria (caché de TanStack, clave fuera de `['garita']`) y ahí se resuelve. Requiere planes 1 y 2.

**Tech Stack:** Next.js 16 / React 19, TanStack Query 5, html5-qrcode 2.3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-lectora-2d-design.md`

## Global Constraints

- Código, nombres y comentarios en español; textos de UI en voseo.
- Colores solo con tokens. Del DNI nada en la URL ni en la API salvo el número en `/gate/search` (spec 3.6).
- Leer el DNI **nunca** registra el ingreso: completa y enfoca "Registrar ingreso".
- Commits en español minúscula con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Consume de planes 1 y 2:** `interpretarLectura`, `soloDigitos`, `NO_RECONOCIDO`, `type Lectura`, `type LecturaDni` (`@/lib/lectora`); `useLectora({ onLectura })`, `useCampoLectora(valor, alLeer)` (`@/lib/use-lectora`).

---

### Task 1: Plomería y `/garita` resuelve lecturas

**Files:** Modify `web/src/lib/gate.ts`, `web/src/lib/queries/garita.ts`, `web/src/app/(garita)/garita/page.tsx`, `web/src/components/garita/buscar-invitado.tsx`, `web/src/components/garita/alta-expres.tsx`.

**Produces:** `buscar(q, signal?)`, `mensajeDeError(e)` en `gate.ts`; `useAbrirQr(): (token: string, reemplazar?: boolean) => Promise<void>`, `useDniPendiente(): { dejar(l: LecturaDni): void; tomar(): LecturaDni | undefined }`, `useDocumentoLeido(): { dejar(id: string, doc: string): void; ver(id: string): string | undefined; borrar(id: string): void }` en `queries/garita.ts`.

- [ ] **Step 1: `gate.ts`** — `import { api, ApiError } from './api'` y agregar (mover `mensajeDeError` tal cual desde `garita/escanear/page.tsx`):

```ts
export const buscar = (q: string, signal?: AbortSignal) =>
  api<Hit[]>(`/gate/search?q=${encodeURIComponent(q)}`, { signal })

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'
    if (error.status === 403) return 'Esta cuenta no tiene permiso para usar la garita.'
    if (error.status === 404) return 'Ese QR no es de una invitación válida.'
  }
  return 'No se pudo validar el QR. Revisá la conexión y probá de nuevo.'
}
```

- [ ] **Step 2: `queries/garita.ts`** — `useBusqueda` pasa a `queryFn: ({ signal }) => buscar(q, signal)`. Imports: `useMemo` de react, `useRouter` de `next/navigation`, `porToken, buscar` de `@/lib/gate`, `type LecturaDni` de `@/lib/lectora`. Agregar:

```ts
/** QR leído (cámara, lectora o campo) → su veredicto, sin pedirlo dos veces. Tira si falla. */
export function useAbrirQr() {
  const router = useRouter()
  const precargar = usePrecargarVeredicto()
  return useCallback(async (token: string, reemplazar = false) => {
    const r = await porToken(token)
    precargar(r.invitation.id, r)
    const url = `/garita/invitacion/${r.invitation.id}`
    if (reemplazar) router.replace(url)
    else router.push(url)
  }, [router, precargar])
}

/*
 * Lo leído viaja entre pantallas en memoria y no en la URL: en la query string
 * el DNI y el nombre quedarían en el historial de la compu de la garita.
 * Fuera de ['garita'] para que invalidarGarita no lo toque.
 */
const CLAVE_DNI = ['lectora', 'dni'] as const
const claveDoc = (id: string) => ['lectora', 'documento', id] as const

/** Un DNI leído fuera de /garita espera acá a que /garita lo resuelva. */
export function useDniPendiente() {
  const qc = useQueryClient()
  return useMemo(() => ({
    dejar: (l: LecturaDni) => { qc.setQueryData(CLAVE_DNI, l) },
    tomar: () => {
      const l = qc.getQueryData<LecturaDni>(CLAVE_DNI)
      qc.removeQueries({ queryKey: CLAVE_DNI, exact: true })
      return l
    },
  }), [qc])
}

/** El documento leído para una invitación, para que su veredicto lo traiga cargado. */
export function useDocumentoLeido() {
  const qc = useQueryClient()
  return useMemo(() => ({
    dejar: (id: string, doc: string) => { qc.setQueryData(claveDoc(id), doc) },
    ver: (id: string) => qc.getQueryData<string>(claveDoc(id)),
    borrar: (id: string) => qc.removeQueries({ queryKey: claveDoc(id), exact: true }),
  }), [qc])
}
```

- [ ] **Step 3: `BuscarInvitado` controlado y con lectura** — la firma pasa a `{ q, onQ, onAbrir, onLectura }`:

```tsx
export function BuscarInvitado({ q, onQ, onAbrir, onLectura }: {
  q: string
  onQ: (q: string) => void
  onAbrir: (id: string) => void
  onLectura: (l: Lectura) => void
}) {
  const qDemorada = useDemora(q)
  const teclaLectura = useCampoLectora(q, (l) => { onQ(''); onLectura(l) })
  // El texto crudo de una lectura no se busca: lo resuelve onLectura.
  const busqueda = useBusqueda(interpretarLectura(qDemorada) ? '' : qDemorada.trim())
```

En el `Input`: `value={q} onChange={(e) => onQ(e.target.value)} onKeyDown={teclaLectura}`. Se va el `useState` local.

- [ ] **Step 4: `AltaExpres` acepta un DNI** — props nuevas `lectura: LecturaDni | null` y `onQr: (token: string) => void`. Debajo de los `useState` existentes:

```tsx
  function aplicarDni(l: LecturaDni, pisarNombre: boolean) {
    setGuestDoc(l.documento)
    if (pisarNombre || !guestName.trim()) setGuestName(`${l.nombre} ${l.apellido}`)
  }
  // Un DNI leído con el sheet abierto (o que lo abrió): ajuste durante el render, como el veredicto.
  const [lecturaVista, setLecturaVista] = useState<LecturaDni | null>(null)
  if (lectura !== lecturaVista) {
    setLecturaVista(lectura)
    if (lectura) aplicarDni(lectura, false)
  }
  // El sheet abre con el foco en Nombre: ahí cae la lectura si el guardia escanea enseguida.
  const teclaNombre = useCampoLectora(guestName, (l) =>
    l.tipo === 'dni' ? aplicarDni(l, true) : (setGuestName(''), onQr(l.token)))
  const teclaDoc = useCampoLectora(guestDoc, (l) =>
    l.tipo === 'dni' ? aplicarDni(l, false) : (setGuestDoc(''), onQr(l.token)))
```

`onKeyDown={teclaNombre}` en `#nombre-expres` y `onKeyDown={teclaDoc}` en `#doc-expres`.

- [ ] **Step 5: `garita/page.tsx`** — reemplazar el cuerpo del componente (imports: `useEffect`, `useQueryClient`, `toast` de sonner, `buscar`, `mensajeDeError` de `@/lib/gate`, `claves`, `useAbrirQr`, `useDniPendiente`, `useDocumentoLeido` de `@/lib/queries/garita`, `useLectora`, `interpretarLectura`, `NO_RECONOCIDO` y tipos):

```tsx
  const router = useRouter()
  const qc = useQueryClient()
  const abrirQr = useAbrirQr()
  const dniPendiente = useDniPendiente()
  const documentoLeido = useDocumentoLeido()
  const [q, setQ] = useState('')
  // El DNI leído detrás de la lista que se está mostrando: al abrir un resultado, se precarga.
  const [dniLista, setDniLista] = useState<LecturaDni | null>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [lecturaAlta, setLecturaAlta] = useState<LecturaDni | null>(null)
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)
  useAvisosGarita()

  function abrir(id: string) {
    if (dniLista) documentoLeido.dejar(id, dniLista.documento)
    router.push(`/garita/invitacion/${id}`)
  }
  const buscarYa = (texto: string) => qc.fetchQuery({ queryKey: claves.busqueda(texto), queryFn: () => buscar(texto) })

  /** Spec 3.7: una → veredicto; varias → lista; ninguna → por apellido (solo lista); nada → alta exprés. */
  async function resolverDni(l: LecturaDni) {
    try {
      const porDoc = await buscarYa(l.documento)
      if (porDoc.length === 1) {
        documentoLeido.dejar(porDoc[0].id, l.documento)
        router.push(`/garita/invitacion/${porDoc[0].id}`)
        return
      }
      if (porDoc.length > 1) { setQ(l.documento); setDniLista(l); return }
      const apellido = l.apellido.split(' ')[0]
      // Coincidir por apellido no alcanza para abrir el veredicto de alguien: solo la lista.
      if ((await buscarYa(apellido)).length > 0) { setQ(apellido); setDniLista(l); return }
      setLecturaAlta(l)
      setAltaAbierta(true)
    } catch {
      toast.error('No se pudo buscar el DNI. Revisá la conexión y probá de nuevo.')
    }
  }

  async function leer(l: Lectura | null) {
    if (!l) { toast.error(NO_RECONOCIDO); return }
    if (l.tipo === 'dni') {
      if (altaAbierta) setLecturaAlta(l)
      else await resolverDni(l)
      return
    }
    setAltaAbierta(false)
    try { await abrirQr(l.token) } catch (e) { toast.error(mensajeDeError(e)) }
  }

  useLectora({ onLectura: (texto) => leer(interpretarLectura(texto)) })

  // Un DNI leído en el escáner o en un veredicto llega acá para resolverse.
  useEffect(() => {
    const l = dniPendiente.tomar()
    if (l) resolverDni(l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

En el JSX: `<BuscarInvitado q={q} onQ={(v) => { setQ(v); setDniLista(null) }} onAbrir={abrir} onLectura={leer} />`, y

```tsx
      <AltaExpres abierto={altaAbierta} disparador={disparador} onCreada={abrir}
        onAbiertoChange={(v) => { setAltaAbierta(v); if (!v) setLecturaAlta(null) }}
        lectura={lecturaAlta} onQr={(token) => leer({ tipo: 'qr', token })} />
```

- [ ] **Step 6:** `cd web && npm run check && npm run lint && npx tsc --noEmit` → limpio. A mano en `/garita/lectora`→`/garita`: tipear rápido no aplica; queda para el e2e de la Task 4.

- [ ] **Step 7: Commit** — `git commit -am "feat: la garita resuelve lecturas de qr y dni"`

---

### Task 2: Veredicto

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

### Task 3: El escáner de cámara lee el DNI

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

### Task 4: E2E y guía de instalación

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
