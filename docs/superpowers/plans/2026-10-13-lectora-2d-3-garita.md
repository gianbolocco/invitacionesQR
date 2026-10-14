# Lectora 2D · Plan 3: la garita resuelve lecturas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/garita` reconoce lecturas de QR y DNI (ventana, buscador y alta exprés) y resuelve el DNI (spec 3.5, 3.7). Sigue el plan 4 (veredicto, escáner, e2e).

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
