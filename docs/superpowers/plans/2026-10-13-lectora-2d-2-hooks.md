# Lectora 2D · Plan 2: hooks y probar lectora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los hooks que reconocen una lectora-teclado (en la ventana y en un campo) y la pantalla "Probar lectora". Requiere el plan 1 (`web/src/lib/lectora.ts`). Sigue el plan 3.

**Architecture:** Hooks finos en `web/src/lib/use-lectora.ts` sobre `crearDetector` e `interpretarLectura` (plan 1). La pantalla de prueba usa solo `onRafaga`.

**Tech Stack:** Next.js 16 / React 19 (client components), Express 5 + Drizzle, vitest, `node:assert`.

**Spec:** `docs/superpowers/specs/2026-10-13-lectora-2d-design.md`

## Global Constraints

- Código, nombres y comentarios en español; textos de UI en voseo.
- Colores solo con tokens de `web/src/app/globals.css`.
- Del DNI solo salen documento, apellido y nombre (spec 3.6); nada del DNI se manda a la API salvo el número en `/gate/search`.
- Umbrales: `MIN_CARACTERES = 8`, `PROMEDIO_MAX_MS = 35`, `HUECO_MAX_MS = 200`, `PAUSA_FIN_MS = 250`.
- Antes de usar una API de Next, ver `web/AGENTS.md`.
- Commits `feat:`/`fix:` en español minúscula, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Hooks `useLectora` y `useCampoLectora`

**Files:** Create `web/src/lib/use-lectora.ts`.

**Interfaces — Produces:**
- `useLectora(opciones: { onLectura?: (texto: string) => void; onRafaga?: (r: Rafaga, enTanda: boolean) => void; activo?: boolean }): void`
- `useCampoLectora(valor: string, alLeer: (l: Lectura) => void): (e: React.KeyboardEvent<HTMLInputElement>) => void` (va en `onKeyDown`).

- [ ] **Step 1: Implementar** — `web/src/lib/use-lectora.ts`:

```ts
'use client'
import { useEffect, useRef } from 'react'
import { useDemora } from './use-demora'
import { crearDetector, interpretarLectura, PAUSA_FIN_MS, type Lectura, type Rafaga } from './lectora'

const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.matches('input, textarea, select'))

/**
 * Una lectora 2D es un teclado: se la reconoce por el ritmo (ver crearDetector).
 * Escucha en captura para anular su Enter antes que el botón enfocado: si no,
 * dispara "Registrar ingreso" del invitado anterior. Con el foco en un campo
 * no actúa: eso lo resuelve useCampoLectora.
 *
 * Tanda (modo inventario, al reconectar una inalámbrica): vale la última. Por
 * eso la entrega espera PAUSA_FIN_MS a que no empiece otra ráfaga.
 */
export function useLectora({ onLectura, onRafaga, activo = true }: {
  onLectura?: (texto: string) => void
  onRafaga?: (r: Rafaga, enTanda: boolean) => void
  activo?: boolean
}) {
  const cb = useRef({ onLectura, onRafaga })
  useEffect(() => { cb.current = { onLectura, onRafaga } })

  useEffect(() => {
    if (!activo) return
    const detector = crearDetector()
    let pausa: ReturnType<typeof setTimeout> | undefined
    let entrega: ReturnType<typeof setTimeout> | undefined
    let pendiente: string | null = null
    let tragarEspacio = false

    function cerrada(r: Rafaga | null) {
      if (!r) return
      cb.current.onRafaga?.(r, r.esLectura && pendiente !== null)
      if (r.esLectura) pendiente = r.texto
      if (pendiente === null) return
      clearTimeout(entrega)
      entrega = setTimeout(() => {
        const texto = pendiente!
        pendiente = null
        cb.current.onLectura?.(texto)
      }, PAUSA_FIN_MS)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (editable(e.target)) return
      // Un espacio en medio de la ráfaga ("BOLOCCO VERONELLI") activaría el botón enfocado.
      tragarEspacio = e.key === ' ' && detector.enRafaga(e.timeStamp)
      if (tragarEspacio) e.preventDefault()
      clearTimeout(pausa)
      if (e.key.length === 1) clearTimeout(entrega) // empieza otra ráfaga: ¿tanda?
      const r = detector.tecla(e.key, e.timeStamp)
      if (r?.esLectura) { e.preventDefault(); e.stopPropagation() }
      cerrada(r)
      pausa = setTimeout(() => cerrada(detector.pausa()), PAUSA_FIN_MS)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ' && tragarEspacio) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      clearTimeout(pausa)
      clearTimeout(entrega)
    }
  }, [activo])
}

/**
 * Para un campo que puede recibir una lectura (tiene el foco cuando el guardia
 * escanea). La reconoce al Enter/Tab —que se anula: no envía el formulario con
 * el texto crudo— y al quedar quieto el valor, para lectoras sin terminador.
 * `alLeer` tiene que reemplazar el valor del campo.
 */
export function useCampoLectora(valor: string, alLeer: (l: Lectura) => void) {
  const cb = useRef(alLeer)
  useEffect(() => { cb.current = alLeer })
  const quieto = useDemora(valor, PAUSA_FIN_MS)

  useEffect(() => {
    const l = interpretarLectura(quieto)
    if (l) cb.current(l)
  }, [quieto])

  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    const l = interpretarLectura(e.currentTarget.value)
    if (!l) return
    e.preventDefault()
    cb.current(l)
  }
}
```

- [ ] **Step 2:** `cd web && npx tsc --noEmit && npm run lint` → sin errores. (Se ejercita en la Task 2 y en el e2e del plan 3.)

- [ ] **Step 3: Commit** — `git add web/src/lib/use-lectora.ts && git commit -m "feat: hooks para reconocer una lectora 2d por teclado"`

---

### Task 2: Pantalla "Probar lectora"

**Files:** Create `web/src/app/(garita)/garita/lectora/page.tsx`; Modify `web/src/app/(garita)/garita/page.tsx` (enlace en el `aside`).

- [ ] **Step 1: Implementar la página:**

```tsx
'use client'
import { useState } from 'react'
import { ChromeGarita } from '@/components/garita/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { useLectora } from '@/lib/use-lectora'
import { interpretarLectura, type Rafaga } from '@/lib/lectora'

type Registro = Rafaga & { id: number; enTanda: boolean }

function interpretacion(texto: string) {
  const l = interpretarLectura(texto)
  if (!l) return 'No reconocido'
  return l.tipo === 'qr' ? `QR · token ${l.token}` : `DNI ${l.documento} · ${l.nombre} ${l.apellido}`
}

/**
 * Para instalar una lectora nueva: qué mandó, a qué ritmo y cómo se entendió.
 * Todo en memoria, no se manda a ningún lado; no navega ni registra nada.
 */
export default function ProbarLectoraPage() {
  const [registros, setRegistros] = useState<Registro[]>([])
  useLectora({
    onRafaga: (r, enTanda) => setRegistros((rs) => [{ ...r, enTanda, id: Date.now() + Math.random() }, ...rs].slice(0, 10)),
  })

  return (
    <ChromeGarita>
      <EncabezadoPagina titulo="Probar lectora" className="mb-6"
        subtitulo="Escaneá un QR de invitación y un DNI. Si algo sale “No reconocido”, mirá el texto crudo." />
      {registros.length === 0 && <p className="text-ink-soft">Esperando una lectura…</p>}
      <ul className="flex flex-col gap-3">
        {registros.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-4">
            <p className="font-semibold">{r.esLectura ? interpretacion(r.texto) : 'No pasó como lectura (¿muy lenta o muy corta?)'}</p>
            <p className="mt-1 break-all font-mono text-sm">{r.texto}</p>
            <p className="mt-1 text-sm tabular text-ink-soft">
              {r.texto.length} caracteres · promedio {r.promedioMs} ms · hueco máx. {r.huecoMaxMs} ms · fin: {r.terminador}
            </p>
            {r.enTanda && <p className="mt-1 text-sm font-semibold">Llegó en tanda: configurá la lectora en envío inmediato.</p>}
          </li>
        ))}
      </ul>
    </ChromeGarita>
  )
}
```

- [ ] **Step 2: Enlace** — en `garita/page.tsx`, dentro del `aside`, debajo del `Link` de "Escanear QR":

```tsx
          <Link href="/garita/lectora" className="text-sm text-ink-soft underline underline-offset-4">Probar lectora</Link>
```

- [ ] **Step 3: Verificar** — `cd web && npm run lint && npx tsc --noEmit`. Con el stack levantado, abrir `/garita/lectora` como guardia, tipear "hola mundo" a mano + Enter → "No pasó como lectura"; con la lectora real, QR y DNI → interpretados.

- [ ] **Step 4: Commit** — `git add -A web/src/app/\(garita\)/garita && git commit -m "feat: pantalla probar lectora en la garita"`
