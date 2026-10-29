# Lectora 2D · Plan 1: parser y búsqueda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parser de QR/DNI con reparación de teclado, detector de ráfagas, y búsqueda por documento solo con dígitos. Siguen: plan 2 (hooks y "Probar lectora") y plan 3 (cableado en garita, veredicto y escáner).

**Architecture:** Lógica pura en `web/src/lib/lectora.ts` con su `lectora.check.ts` (corre con `node`, sin alias `@/`). Hooks finos en `web/src/lib/use-lectora.ts`. Un `or` más en `searchGuests`.

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

### Task 1: Parser y detector puros

**Files:**
- Create: `web/src/lib/lectora.ts`, `web/src/lib/lectora.check.ts`
- Modify: `web/package.json` (script `check`)

**Interfaces — Produces:** `type Lectura`, `type LecturaDni`, `interpretarLectura(crudo: string): Lectura | null`, `tokenDelQr(texto: string): string | null`, `soloDigitos(s: string): string`, `NO_RECONOCIDO: string`, las 4 constantes, `type Rafaga`, `type Terminador`, `crearDetector(): { tecla(key: string, t: number): Rafaga | null; pausa(): Rafaga | null; enRafaga(t: number): boolean }`.

- [ ] **Step 1: Escribir el check** — `web/src/lib/lectora.check.ts`:

```ts
/** `node src/lib/lectora.check.ts`. Los dos primeros textos son de una lectora real de la instalación. */
import assert from 'node:assert/strict'
import { interpretarLectura, crearDetector, soloDigitos } from './lectora.ts'

const DNI = { tipo: 'dni', documento: '46116502', apellido: 'Bolocco Veronelli', nombre: 'Gianlucca Valentino' }
const QR = { tipo: 'qr', token: 'mcNlErk30BgByd7asEPm7Q' }

// Deformados por teclado US → Windows en español.
assert.deepEqual(interpretarLectura('00705994066"BOLOCCO VERONELLI"GIANLUCCA VALENTINO"M"46116502"B"12-09-2004"06-06-2023"209'), DNI)
assert.deepEqual(interpretarLectura('httpsÑ--qa.visitpass.quest-i-mcNlErk30BgByd7asEPm7Q'), QR)
// Limpios (cámara, lectora bien configurada).
assert.deepEqual(interpretarLectura('00705994066@BOLOCCO VERONELLI@GIANLUCCA VALENTINO@M@46116502@B@12/09/2004@06/06/2023@209'), DNI)
assert.deepEqual(interpretarLectura('https://qa.visitpass.quest/i/mcNlErk30BgByd7asEPm7Q'), QR)
// Bloq Mayús, prefijo/sufijo, - y _ deformados, token suelto.
assert.deepEqual(interpretarLectura('HTTPSñ--QA.VISITPASS.QUEST-I-MCnLeRK30bGbYD7ASepM7q'), QR)
assert.deepEqual(interpretarLectura(']Q1https://qa.visitpass.quest/i/mcNlErk30BgByd7asEPm7Q\r'), QR)
assert.deepEqual(interpretarLectura("httpsÑ--x.com-i-ab'cd?ef0123456789abcdef"), { tipo: 'qr', token: 'ab-cd_ef0123456789abcdef' })
assert.deepEqual(interpretarLectura('mcNlErk30BgByd7asEPm7Q'), QR)
// DNI formato viejo (dorso).
assert.deepEqual(interpretarLectura('@20111222    @A@1@PÉREZ@JUAN CARLOS@ARGENTINA@01/01/1970@M@01/01/2010@00000000000@7055 @01/01/2025@123@0@ILR:2.01'),
  { tipo: 'dni', documento: '20111222', apellido: 'Pérez', nombre: 'Juan Carlos' })
// Lo que tipea una persona nunca es una lectura.
for (const basura of ['', 'perez', '46116502', 'Lote 142', 'https://otro.com/x', '00705994066"BOLOCCO"GIAN"M"12"B"x"y"z']) {
  assert.equal(interpretarLectura(basura), null, basura)
}
assert.equal(soloDigitos('30.123.456'), '30123456')

function tipear(texto: string, ms: (i: number) => number, fin = 'Enter') {
  const d = crearDetector()
  let t = 1000
  for (const [i, k] of [...texto].entries()) { t += ms(i); assert.equal(d.tecla(k, t), null) }
  return fin === 'pausa' ? d.pausa() : d.tecla(fin, t + 3)
}
const qr = 'httpsÑ--qa.visitpass.quest-i-mcNlErk30BgByd7asEPm7Q'
assert.equal(tipear(qr, () => 4)?.esLectura, true)                                // USB
assert.equal(tipear(qr, () => 4)?.texto, qr)
assert.equal(tipear(qr, (i) => (i % 10 === 9 ? 120 : 2))?.esLectura, true)        // Bluetooth, en paquetes
assert.equal(tipear('juan perez lote', () => 90)?.esLectura, false)               // persona
assert.equal(tipear('abc', () => 3)?.esLectura, false)                            // muy corta
assert.equal(tipear(qr, () => 4, 'pausa')?.terminador, 'pausa')                   // sin terminador
assert.equal(tipear(qr, (i) => (i === 20 ? 300 : 4))?.texto, qr.slice(20))        // un hueco largo corta

console.log('lectora: ok')
```

- [ ] **Step 2: Correrlo** — `cd web && node src/lib/lectora.check.ts` → FAIL (no existe `lectora.ts`).

- [ ] **Step 3: Implementar** — `web/src/lib/lectora.ts`:

```ts
/*
 * Lo que manda una lectora 2D o la cámara, interpretado. Puro y sin alias:
 * lo corre `node` en `lectora.check.ts`. Spec: 2026-10-13-lectora-2d-design.md.
 */
export type Lectura =
  | { tipo: 'qr'; token: string }
  | { tipo: 'dni'; documento: string; apellido: string; nombre: string }
export type LecturaDni = Extract<Lectura, { tipo: 'dni' }>

export const NO_RECONOCIDO = 'No se reconoció el código. Probá de nuevo o buscá por nombre.'

/*
 * Una lectora-teclado manda códigos de tecla US; Windows en español (España y
 * Latinoamérica deforman igual) los lee cambiados. Solo hace falta para el QR:
 * en el DNI basta con volver `"` a `@`, y tocar más rompería una Ñ de un apellido.
 */
const QR_ES_A_US: Record<string, string> = { 'Ñ': ':', '-': '/', "'": '-', '?': '_' }

export const soloDigitos = (s: string) => s.replace(/\D/g, '')

const invertirCaja = (s: string) =>
  [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase())

/** La URL de la invitación en cualquier parte del texto (prefijos de lectora), o el token suelto. */
export function tokenDelQr(texto: string): string | null {
  const enUrl = texto.match(/https?:\/\/[^/\s]+\/i\/([A-Za-z0-9_-]+)/)
  if (enUrl) return enUrl[1]
  // ≥ 20: un token mide 22 (randomToken(16)); así "perez" tipeado no es un QR.
  return /^[A-Za-z0-9_-]{20,}$/.test(texto) ? texto : null
}

function qrDe(texto: string): Lectura | null {
  let t = texto
  if (/HTTPS?[:Ññ]/.test(t)) t = invertirCaja(t) // Bloq Mayús: el token distingue mayúsculas
  // Solo si el texto delata la deformación: a ciegas, rompería los - de un token limpio.
  if (/https?Ñ/.test(t)) t = [...t].map((c) => QR_ES_A_US[c] ?? c).join('')
  const token = tokenDelQr(t)
  return token ? { tipo: 'qr', token } : null
}

function dniDe(texto: string): LecturaDni | null {
  const c = (texto.includes('@') ? texto : texto.replaceAll('"', '@')).split('@').map((s) => s.trim())
  let doc: string | undefined, apellido: string | undefined, nombre: string | undefined
  // Nuevo (frente): trámite@APELLIDO@NOMBRE@SEXO@DNI@… — viejo (dorso): @DNI@…@…@APELLIDO@NOMBRE@…
  if (c.length >= 8 && /\d{8,}$/.test(c[0]) && /^[MFX]$/.test(c[3])) [, apellido, nombre, , doc] = c
  else if (c.length >= 9 && /^\d{7,8}\s*[A-Z]?$/.test(c[1])) [, doc, , , apellido, nombre] = c
  if (!doc || !apellido || !nombre) return null
  const documento = soloDigitos(doc)
  // Mejor "no reconocido" que abrir la invitación de otro.
  if (!/^\d{7,8}$/.test(documento)) return null
  return { tipo: 'dni', documento, apellido: titulo(apellido), nombre: titulo(nombre) }
}

export function interpretarLectura(crudo: string): Lectura | null {
  const t = crudo.trim()
  return t ? qrDe(t) ?? dniDe(t) : null
}

/*
 * Perillas de calibración: "Probar lectora" muestra los valores de cada ráfaga.
 * Por promedio y no por hueco entre teclas: Bluetooth entrega en paquetes.
 */
export const MIN_CARACTERES = 8
export const PROMEDIO_MAX_MS = 35
export const HUECO_MAX_MS = 200
export const PAUSA_FIN_MS = 250

export type Terminador = 'Enter' | 'Tab' | 'pausa'
export type Rafaga = {
  texto: string
  promedioMs: number
  huecoMaxMs: number
  terminador: Terminador
  esLectura: boolean
}

/** Junta teclas con su hora y dice, al cerrar, si fue una lectora o una persona. */
export function crearDetector() {
  let teclas: { key: string; t: number }[] = []

  function cerrar(terminador: Terminador): Rafaga | null {
    if (!teclas.length) return null
    const huecos = teclas.slice(1).map((k, i) => k.t - teclas[i].t)
    const promedioMs = huecos.length ? (teclas.at(-1)!.t - teclas[0].t) / huecos.length : 0
    const huecoMaxMs = huecos.length ? Math.max(...huecos) : 0
    const texto = teclas.map((k) => k.key).join('')
    teclas = []
    return {
      texto, promedioMs: Math.round(promedioMs), huecoMaxMs, terminador,
      esLectura: texto.length >= MIN_CARACTERES && promedioMs < PROMEDIO_MAX_MS && huecoMaxMs <= HUECO_MAX_MS,
    }
  }

  return {
    /** Devuelve la ráfaga si esta tecla la cerró (Enter o Tab). */
    tecla(key: string, t: number): Rafaga | null {
      const ultima = teclas.at(-1)
      if (ultima && t - ultima.t > HUECO_MAX_MS) teclas = []
      if (key === 'Enter' || key === 'Tab') return cerrar(key)
      // Una sola letra: afuera modificadores, `Dead` y `Unidentified` (Android).
      if (key.length === 1) teclas.push({ key, t })
      return null
    },
    /** A los PAUSA_FIN_MS sin teclas: lectoras sin terminador. */
    pausa: () => cerrar('pausa'),
    /** Hay una ráfaga en curso: un espacio ahora es de la lectora, no un "click" al botón enfocado. */
    enRafaga: (t: number) => { const u = teclas.at(-1); return Boolean(u && t - u.t <= HUECO_MAX_MS) },
  }
}
```

- [ ] **Step 4: Sumarlo a `npm run check`** — en `web/package.json`, agregar `&& node src/lib/lectora.check.ts` antes de `&& node scripts/colores.check.mjs`. Correr `cd web && npm run check` → incluye `lectora: ok`.

- [ ] **Step 5: Commit** — `git add web/src/lib/lectora.ts web/src/lib/lectora.check.ts web/package.json && git commit -m "feat: parser de lecturas de qr y dni, con reparación de teclado"`

---

### Task 2: Búsqueda por documento solo con dígitos

**Files:** Modify `api/src/services/entries.ts` (`searchGuests`), Test `api/tests/gate.test.ts`.

- [ ] **Step 1: Test que falla** — en `api/tests/gate.test.ts`, dentro del `describe` que tiene `'un documento que no existe no devuelve nada'`, agregar:

```ts
  it('el documento se compara por dígitos: 30111222 encuentra 30.111.222, y al revés', async () => {
    const { inv, cookie } = await scenario()
    await db.update(invitations).set({ guestDoc: '30.111.222' }).where(eq(invitations.id, inv.id))

    const sinPuntos = await request(app).get('/gate/search?q=30111222').set('Cookie', cookie).expect(200)
    expect(sinPuntos.body.map((h: { id: string }) => h.id)).toEqual([inv.id])

    await db.update(invitations).set({ guestDoc: '30111222' }).where(eq(invitations.id, inv.id))
    const conPuntos = await request(app).get('/gate/search?q=30.111.222').set('Cookie', cookie).expect(200)
    expect(conPuntos.body).toHaveLength(1)
  })
```

- [ ] **Step 2:** `cd api && npx vitest run tests/gate.test.ts` → FAIL (0 resultados).

- [ ] **Step 3: Implementar** — en `searchGuests`, debajo de `const hoy = …`: `const digitos = query.replace(/\D/g, '')`; y dentro del último `or(...)`, después de `ilike(invitations.guestDoc, q),`:

```ts
        // Por dígitos: el vecino cargó "30.123.456" y la lectora del DNI manda
        // 30123456. Desde 3 dígitos, para que "Lote 1" no matchee todo con un 1.
        digitos.length >= 3
          ? sql`regexp_replace(${invitations.guestDoc}, '\\D', '', 'g') like ${`%${digitos}%`}`
          : undefined,
```

- [ ] **Step 4:** `cd api && npm test && npx tsc --noEmit` → todo PASS.

- [ ] **Step 5: Commit** — `git commit -am "fix: la búsqueda de la garita compara el documento por dígitos"`
