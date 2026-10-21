# Nota de la invitación: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** el vecino (y el guardia en el alta exprés) deja una nota corta en la invitación y la garita la ve.

**Architecture:** columna `invitation.note` (≤140, check en la base). Viaja por las lecturas que ya devuelven `plate`, salvo la página pública. El Excel la lee de la invitación con un join. En la web, un `textarea` en los formularios, un `Dato` en el veredicto y un ícono en las listas.

**Tech Stack:** Express 5 · Drizzle · zod · vitest · Next.js 16 · Tailwind v4 · Playwright.

Spec: [`docs/superpowers/specs/2026-10-20-nota-invitacion-design.md`](../specs/2026-10-20-nota-invitacion-design.md).

## Global Constraints

- Largo máximo: **140**. API: `z.string().trim().max(140)`; servicio: `note?.trim() || null`.
- `findPublicByToken` **no** devuelve la nota. "Volver a invitar" (`urlVolverAInvitar`) **no** la copia.
- Edición: la misma regla de `editInvitation` (`ya_usada`, `vencida`, `revoked`). Sin ruta nueva.
- Textos en voseo; colores solo de tokens de `globals.css`; comentarios en español.
- Commits `feat:` en minúscula, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: columna y API

**Files:**
- Modify: `api/src/db/schema.ts` (tabla `invitations`)
- Create: `api/drizzle/0016_nota_invitacion.sql` (con `drizzle-kit generate`)
- Modify: `api/src/routes/invitations.ts` (`createSchema`, `editSchema`), `api/src/routes/gate.ts` (`POST /invitations`)
- Modify: `api/src/services/invitations.ts` (tipos, `createInvitation`, `valoresDePorteria`, `editInvitation`, `columnas`)
- Modify: `api/src/services/entries.ts` (`loadForCheck`, `searchGuests`, `agendaForDay`, `insideNow`, tipo `AgendaRow`)
- Test: `api/tests/nota-invitacion.test.ts`

**Produces:** campo `note: string | null` en la invitación del vecino, en `invitation` del veredicto, en los hits de `/gate/search` y en las filas de `/gate/agenda` y `/gate/adentro`.

- [ ] **Step 1: test que falla.** Copiar los helpers `neighborhood()` y `resident()` de `api/tests/invitations.test.ts` y sumar un guardia:

```ts
async function guardia() {
  const barrio = await neighborhood()
  const [g] = await db.insert(people).values({
    neighborhoodId: barrio.id, email: 'garita@example.com', name: 'Rulo', role: 'guard',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], id: g.id }
}
type Cookie = Awaited<ReturnType<typeof resident>>['cookie']
const crear = (cookie: Cookie, unitId: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/invitations').set('Cookie', cookie).send({
    unitId, kind: 'visita', guestName: 'Juan Pérez', validFrom: DIA, validTo: DIA, capacity: 1, ...extra,
  })

describe('nota de la invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('se guarda recortada y vacía queda null', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    expect((await crear(v.cookie, v.unitId, { note: '  Viene en un Gol rojo ' })).body.note).toBe('Viene en un Gol rojo')
    expect((await crear(v.cookie, v.unitId, { note: '   ' })).body.note).toBeNull()
  })

  it('más de 140 caracteres es 400', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    expect((await crear(v.cookie, v.unitId, { note: 'x'.repeat(141) })).status).toBe(400)
  })

  it('se edita mientras está pendiente, no después de un ingreso', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const { body: inv } = await crear(v.cookie, v.unitId, { note: 'Deja un paquete' })
    const ok = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', v.cookie).send({ note: null })
    expect(ok.body.note).toBeNull()
    await registerEntry(inv.id, g.id, { guestName: 'Juan Pérez' })
    const no = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', v.cookie).send({ note: 'Otra' })
    expect(no.status).toBe(409)
    expect(no.body.error).toBe('ya_usada')
  })

  it('la ve la garita y el vecino, el invitado no', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const { body: inv } = await crear(v.cookie, v.unitId, { note: 'Es el plomero' })
    expect((await request(app).get(`/invitations/${inv.id}`).set('Cookie', v.cookie)).body.note).toBe('Es el plomero')
    expect((await request(app).get(`/gate/invitation/${inv.id}`).set('Cookie', g.cookie)).body.invitation.note).toBe('Es el plomero')
    expect((await request(app).get('/gate/agenda').set('Cookie', g.cookie)).body[0].note).toBe('Es el plomero')
    expect((await request(app).post('/gate/search').set('Cookie', g.cookie).send({ q: 'juan' })).body[0].note).toBe('Es el plomero')
    const pub = await request(app).get(`/invitations/public/${inv.token}`)
    expect(JSON.stringify(pub.body)).not.toContain('plomero')
  })

  it('el alta exprés lleva nota', async () => {
    const v = await resident('martin@example.com', 'Lote 142')
    const g = await guardia()
    const res = await request(app).post('/gate/invitations').set('Cookie', g.cookie)
      .send({ unitId: v.unitId, guestName: 'Flete', note: 'Va al fondo' })
    expect(res.body.note).toBe('Va al fondo')
  })
})
```

- [ ] **Step 2:** `cd api && npx vitest run tests/nota-invitacion.test.ts` → FAIL (`note` undefined).

- [ ] **Step 3: esquema y migración.** En `invitations`, después de `plate`:

```ts
  // Lo que el vecino le deja dicho a la guardia ("viene en un Gol rojo"). No
  // confundir con entry_log.note, que es la observación del guardia en una carga manual.
  note: text('note'),
```
y en la lista de checks: `check('invitation_note_ck', sql\`char_length(${t.note}) <= 140\`),`.
Correr `cd api && npx drizzle-kit generate --name nota_invitacion` y revisar que el SQL tenga solo el `ADD COLUMN` y el `ADD CONSTRAINT`.

- [ ] **Step 4: rutas.** `createSchema`: `note: z.string().trim().max(140).optional(),`. `editSchema`: `note: z.string().trim().max(140).nullable().optional(),`. Alta exprés en `gate.ts`: `note: z.string().trim().max(140).optional(),`.

- [ ] **Step 5: servicios.**
  - `CreateInvitationInput` y `CreateExpressInvitationInput`: `note?: string`; `EditInvitationInput`: `note?: string | null`.
  - `createInvitation` y `valoresDePorteria`: `note: input.note?.trim() || null,`.
  - `editInvitation`, junto a `plate`: `...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),`.
  - `columnas`: `note: invitations.note,`. **No** tocar `findPublicByToken`.
  - `entries.ts`: `note: invitations.note,` en `loadForCheck` y `searchGuests`; `i.note,` en el SQL de `agendaForDay` e `insideNow`; `note: string | null` en `AgendaRow`.

- [ ] **Step 6:** `cd api && npm test && npx tsc --noEmit` → todo verde.

- [ ] **Step 7: commit** `feat: la invitación lleva una nota opcional para la guardia`.

### Task 2: columna en el Excel

**Files:** Modify `api/src/services/reports.ts` (`EntryRow`, `entriesLog`), `api/src/routes/gate.ts` (hoja Ingresos). Test: `api/tests/audit.test.ts`.

- [ ] **Step 1: test.** En `audit.test.ts`, al final del `describe`:

```ts
  it('el Excel de ingresos trae la nota del vecino aparte de la de carga manual', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Martín Pérez', note: 'Viene en un Gol rojo' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Martín Pérez' })
    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      }).expect(200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)
    const w = wb.getWorksheet('Ingresos')!
    const encabezados = (w.getRow(1).values as unknown[]).map(String)
    expect(w.getRow(2).getCell(encabezados.indexOf('Nota del vecino')).value).toBe('Viene en un Gol rojo')
    expect(encabezados).toContain('Nota')
  })
```

- [ ] **Step 2:** `npx vitest run tests/audit.test.ts` → FAIL (`indexOf` da -1).
- [ ] **Step 3:** en `entriesLog`, `join invitation i on i.id = e.invitation_id` y `i.note as "invitationNote"` en el select; `invitationNote: string | null` en `EntryRow`. En la hoja Ingresos de `gate.ts`, antes de `{ header: 'Nota', ... }`: `{ header: 'Nota del vecino', key: 'notaVecino', width: 30 },` y en las filas `notaVecino: e.invitationNote ?? '',`.
- [ ] **Step 4:** `npm test && npx tsc --noEmit` → verde.
- [ ] **Step 5: commit** `feat: el excel de ingresos trae la nota del vecino`.

### Task 3: vecino

**Files:** Modify `web/src/lib/invitations.ts` (`Invitation`), `web/src/lib/queries/invitaciones.ts` (`DatosInvitacion`, `useCrearInvitacion`), `web/src/components/vecino/formulario-invitacion.tsx`, `web/src/app/(vecino)/invitaciones/[id]/page.tsx`.

- [ ] **Step 1: tipos.** `Invitation`: `note: string | null`. `DatosInvitacion`: `note: string | null`. En `useCrearInvitacion`, junto a `plate`: `note: d.note ?? undefined,`.
- [ ] **Step 2: formulario.** Estado `const [nota, setNota] = useState(invitacion?.note ?? '')` (sin `inicial`: volver a invitar no la copia). En `datos`: `note: nota.trim() || null,`. Después de la sección "Para entrar más rápido":

```tsx
      <Campo id="nota" etiqueta="Nota para la guardia (opcional)"
        accesorio={<span className="text-xs tabular text-ink-soft">{nota.length}/140</span>}
        ayuda="La lee la guardia. No pongas datos de salud ni otros datos sensibles.">
        <textarea id="nota" rows={2} maxLength={140} value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Viene en un Gol rojo"
          className="w-full resize-none rounded-sm border-2 border-control bg-card px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-soft focus-visible:border-azul-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      </Campo>
```
(Las clases son las de `Input` sin la altura fija.)
- [ ] **Step 3: detalle.** Debajo del párrafo del brillo: `{inv.note && <p className="max-w-sm text-center text-sm"><span className="text-ink-soft">Nota para la guardia: </span>{inv.note}</p>}`.
- [ ] **Step 4:** `cd web && npm run check && npm run lint && npx tsc --noEmit` → verde.
- [ ] **Step 5: commit** `feat: el vecino deja una nota para la guardia al invitar`.

### Task 4: garita

**Files:** Create `web/src/components/garita/icono-nota.tsx`. Modify `web/src/lib/gate.ts` (`Resultado`, `Hit`, `altaExpres`), `web/src/lib/queries/garita.ts` (`AgendaRow`), `web/src/components/garita/alta-expres.tsx`, `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`, `vistas/lista.tsx`, `vistas/compacta.tsx`, `vistas/tablero.tsx`, `tarjeta-invitado.tsx`, `buscar-invitado.tsx`.

- [ ] **Step 1: tipos.** `note: string | null` en `Resultado['invitation']`, `Hit` y `AgendaRow`. `altaExpres` acepta `note?: string`.
- [ ] **Step 2: ícono.**

```tsx
import { StickyNote } from 'lucide-react'

/** El vecino dejó una nota. En la lista va solo la marca: el texto entero está en el veredicto. */
export function IconoNota({ nota }: { nota: string | null | undefined }) {
  if (!nota) return null
  return (
    <span title={nota} className="shrink-0 text-ink-soft">
      <StickyNote className="size-3.5" aria-hidden />
      <span className="sr-only">Nota: {nota}</span>
    </span>
  )
}
```
Ponerlo después del nombre en: `FilaAgenda` de `lista.tsx` (por unidad la reusa), la celda del nombre de `compacta.tsx`, la fila de vencidas de `tablero.tsx`, `TarjetaInvitado` (junto al nombre, dentro de un `span` flex) y el `p` del nombre del hit en `buscar-invitado.tsx` (envolver nombre + ícono en un `span` con `flex items-center gap-1.5`).
- [ ] **Step 3: veredicto.** Primera fila del `dl`, antes de los datos: `{inv.note && <Dato etiqueta="Nota">{inv.note}</Dato>}`. Toma el color del veredicto como el resto de los datos.
- [ ] **Step 4: alta exprés.** Estado `nota`, que se limpia al cerrar junto con `setPlate('')`. `const teclaNota = useCampoLectora(nota, (l) => l.tipo === 'dni' ? (setNota(''), aplicarDni(l, false)) : (setNota(''), onQr(l.token)))`. Campo después de la patente:

```tsx
          <Campo id="nota-expres" etiqueta="Nota (opcional)" ayuda="No pongas datos sensibles.">
            <Input id="nota-expres" onKeyDown={teclaNota} value={nota} maxLength={140}
              onChange={(e) => setNota(e.target.value)} />
          </Campo>
```
y en `enviar`: `note: nota.trim() || undefined`.
- [ ] **Step 5:** `cd web && npm run check && npm run lint && npx tsc --noEmit` → verde.
- [ ] **Step 6: commit** `feat: la garita ve la nota en el veredicto y en las listas`.

### Task 5: e2e, capturas y cierre

**Files:** Modify `web/e2e/vecino.spec.ts`.

- [ ] **Step 1: e2e.**

```ts
test('la nota del vecino llega al veredicto de la garita', async ({ page, browser }) => {
  await entrar(page, 'vecino')
  const nombre = `Con nota ${Date.now()}`
  await page.goto('/invitaciones/nueva')
  await page.getByLabel('Nombre del invitado').fill(nombre)
  await page.getByLabel('Nota para la guardia (opcional)').fill('Viene en un Gol rojo')
  await page.getByRole('button', { name: 'Crear invitación' }).click()
  await expect(page.getByText('Viene en un Gol rojo')).toBeVisible()

  const guardia = await browser.newContext()
  const g = await guardia.newPage()
  await entrar(g, 'guardia')
  await g.getByLabel('Buscar invitado').fill(nombre)
  await g.getByRole('option', { name: new RegExp(nombre) }).click()
  await expect(g.getByText('Viene en un Gol rojo')).toBeVisible()
  await guardia.close()
})
```
- [ ] **Step 2:** `docker compose up -d --build` y `cd web && npx playwright test e2e/vecino.spec.ts e2e/garita.spec.ts e2e/buscador.spec.ts --workers=1` → verde.
- [ ] **Step 3: capturas** con la skill playwright-cli: formulario del vecino a 390px de ancho, veredicto con nota y tablero con el ícono a 1440px. Mostrárselas al dueño y esperar el OK antes de cerrar.
- [ ] **Step 4:** corrida completa: `cd api && npm test && npx tsc --noEmit`; `cd web && npm run check && npm run lint && npx tsc --noEmit`.
- [ ] **Step 5: commit** `feat: e2e de la nota de la invitación`.
