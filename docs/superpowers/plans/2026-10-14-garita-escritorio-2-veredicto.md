# Garita en escritorio · Plan 2: veredicto en dos columnas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde 1024 px el veredicto se divide en dos columnas: la decisión, grande, a la izquierda; una ficha de comparación y la acción a la derecha (spec 3.2). Requiere el plan 1.

**Architecture:** Un solo árbol de JSX en `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`: los renglones de datos de hoy pasan a una `<dl>` (la "ficha") con Documento y Patente adentro, y una grilla `lg:` acomoda las dos secciones. En mobile la ficha se ve en la misma columna única, en el mismo orden (palabra → nombre → ficha → acción).

**Tech Stack:** Next.js 16 / React 19, Tailwind 4.3, motion, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-garita-escritorio-design.md`

## Global Constraints

- Código, nombres y comentarios en español; UI en voseo. Colores solo con tokens (`pass-field`/`pass-ink`/`deny-field`/`deny-ink` y opacidades de esos).
- La palabra, el sello (animación de entrada) y la luminancia del campo son los tres canales; el color nunca es el único.
- Foco, `Enter`, `Esc` y la lectora se comportan exactamente como hoy (spec de la lectora 3.7): no tocar `leer`, `salir`, `registrar`, los efectos de foco/Escape ni `useLectora`/`useCampoLectora` salvo lo que dice este plan.
- Los e2e existentes usan `getByLabel('Documento')`, `getByRole('button', { name: 'Registrar ingreso' | 'Registrar egreso' | 'Deshacer' | /^Siguiente/ })`, `getByRole('heading', { name: 'INGRESO' | 'EGRESO' | 'NO PASA', exact: true })` y el texto del motivo: tienen que seguir valiendo.
- Commits en español minúscula + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `-am` / `add -A`.

---

### Task 1: La ficha y la grilla

**Files:** Modify `web/src/app/(garita)/garita/invitacion/[id]/page.tsx`.

- [ ] **Step 1: Estado "leído del DNI".** Junto a `doc`: `const [docLeido, setDocLeido] = useState(false)`. En el ajuste durante el render, calcular `const leido = documentoLeido.ver(q.data.invitation.id)`, usar `setDoc(leido ?? q.data.invitation.guestDoc ?? '')` y `setDocLeido(Boolean(leido))`. En `leer`, donde un DNI completa el documento: `setDoc(l.documento); setDocLeido(true)`. En el `onChange` del Documento: `setDocLeido(false)`.

- [ ] **Step 2: Helper `Dato`**, arriba del componente:

```tsx
/** Una fila de la ficha. dt + dd sueltos: los acomoda la grilla de la <dl>. */
function Dato({ etiqueta, children }: { etiqueta: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <dt className="opacity-70">{etiqueta}</dt>
      <dd className="min-w-0 break-words font-semibold tabular">{children}</dd>
    </>
  )
}
```

- [ ] **Step 3: El `return` principal.** Reemplazar el `<main>…</main>` por esta estructura (las partes marcadas "igual que hoy" se mueven sin cambios):

```tsx
  const editable = ok && !esEgreso && !hecho
  const borde = ok ? 'border-pass-ink/15' : 'border-deny-ink/20'
  const noCoincide = editable && inv.guestDoc && soloDigitos(doc).length >= 7
    && soloDigitos(doc) !== soloDigitos(inv.guestDoc)
  const kbd = 'rounded border border-current/30 px-1.5 py-0.5 font-mono text-xs'

  return (
    <main aria-live="assertive"
      className={`min-h-dvh overflow-x-hidden p-6 sm:p-10 lg:px-14 ${ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'}`}>
      {/* Un solo árbol. Mobile: una columna, la acción al pie. Desde lg: lo que
          decide a la izquierda, para leer de lejos; la ficha y la acción a la
          derecha, para el guardia sentado. Solo cambia la grilla. */}
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-2xl grid-rows-[auto_1fr] gap-8 sm:min-h-[calc(100dvh-5rem)] lg:max-w-7xl lg:grid-cols-[3fr_2fr] lg:grid-rows-1 lg:items-center lg:gap-16">
        <section className="min-w-0">
          {/* motion.h1 igual que hoy, con tamaños: text-6xl sm:text-8xl lg:text-9xl xl:text-[10rem] */}
          {/* motivo (lg:text-4xl) y detalle (lg:text-3xl): igual que hoy */}
          <p className={`mt-8 break-words border-t pt-5 text-3xl font-semibold leading-tight sm:text-4xl lg:text-6xl ${borde}`}>
            {inv.guestName}
          </p>
        </section>

        <section className={`flex min-w-0 flex-col justify-between gap-8 lg:justify-center lg:border-l lg:pl-12 ${borde}`}>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-lg sm:text-xl">
            {editable ? (
              <>
                <dt className="self-center opacity-70"><label htmlFor="doc-veredicto">Documento</label></dt>
                <dd className="min-w-0">
                  <Input id="doc-veredicto" value={doc} onKeyDown={teclaDoc}
                    onChange={(e) => { setDoc(e.target.value); setDocLeido(false) }}
                    className="tabular h-12 border-pass-ink/20 bg-white/70 text-xl" />
                  {docLeido && doc.trim() && <p className="mt-1 text-sm font-semibold">Leído del DNI</p>}
                  {/* Avisa, no bloquea. Los dos números lado a lado: comparar es más rápido que leer una frase. */}
                  {noCoincide && (
                    <p className="mt-1 text-base font-semibold tabular">
                      No coincide · Invitación {inv.guestDoc} · {docLeido ? 'Leído' : 'Cargado'} {doc}
                    </p>
                  )}
                  {/* Nadie entra sin documento: si la invitación no lo traía, se carga acá. */}
                  {!doc.trim() && <p className="mt-1 text-sm font-semibold opacity-75">Hace falta para registrar el ingreso.</p>}
                </dd>
                <dt className="self-center opacity-70"><label htmlFor="patente-veredicto">Patente</label></dt>
                <dd className="min-w-0">
                  <Input id="patente-veredicto" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    className="tabular h-12 border-pass-ink/20 bg-white/70 text-xl uppercase" />
                </dd>
              </>
            ) : (
              <>
                <Dato etiqueta="Documento">{doc || inv.guestDoc || '—'}</Dato>
                <Dato etiqueta="Patente">{plate || inv.plate || '—'}</Dato>
              </>
            )}
            <Dato etiqueta="Tipo">{KIND_LABEL[inv.kind]}</Dato>
            <Dato etiqueta="Lote">{inv.unitLabel}</Dato>
            <Dato etiqueta="Invita">{inv.inviterName}</Dato>
            {!esEgreso && <Dato etiqueta="Vigencia">{vigencia(inv)}</Dato>}
            {/* Una frecuente lleva cupo 999 para ser ilimitada: "1 de 999" no le dice nada al guardia. */}
            {inv.capacity > 1 && inv.kind !== 'frecuente' && (
              <Dato etiqueta="Cupo">{resultado.usedCount} de {inv.capacity} entraron</Dato>
            )}
            {entro && (
              <Dato etiqueta="Entró">
                {/* motion.span de "Entró …" igual que hoy (sin la palabra "Entró": la dice el dt), con el "adentro hace …" */}
              </Dato>
            )}
            {salio && <Dato etiqueta="Salió">{/* motion.span igual que hoy, sin "· Salió" */}</Dato>}
          </dl>

          {/* motion.div layout + AnimatePresence igual que hoy, con estos cambios:
              - "pendiente": se van el aviso de no coincide, los dos <label>/<Input> y el
                "Hace falta…" (ahora están en la ficha). Debajo del botón principal:
                <p className="hidden text-sm opacity-70 lg:block"><kbd className={kbd}>Enter</kbd> registra · <kbd className={kbd}>Esc</kbd> vuelve</p>
                y después el "Cancelar (Esc)" de hoy.
              - "rechazo": sin cambios en este plan (el plan 3 agrega "Autorizar igual"). */}
        </section>
      </div>
    </main>
  )
```

Notas: se va el `import` de `quienInvita` si queda sin uso (la ficha muestra `inv.inviterName`, que ya trae "Autorizado por portería" cuando corresponde). `entro`/`salio`/`hecho` y las animaciones de esas líneas se conservan tal cual.

- [ ] **Step 4: "Registrado".** En `AccionesRegistrado`, después del botón "Deshacer": `<p className="hidden text-center text-sm opacity-70 lg:block">o escaneá el siguiente</p>`.

- [ ] **Step 5: Verificar.** `cd web && npm run check && npm run lint && npx tsc --noEmit`; con el stack levantado (`docker compose up -d --build` desde la raíz), `cd web && npm run e2e -- garita` → todos pasan en los dos proyectos sin tocar los tests.

- [ ] **Step 6: Mirarlo.** Con el stack arriba, sacar capturas con un script de Playwright descartable en el scratchpad (no en el repo) de un veredicto de INGRESO a 390 y 1280 px, claro y oscuro (`page.emulateMedia({ colorScheme })`), y adjuntar las rutas en el reporte. Revisar que: la palabra y el nombre no se corten; la ficha no desborde a 1024 px; los inputs se lean en oscuro.

- [ ] **Step 7: Commit** — `git add` del page por path: `git commit -m "feat: el veredicto en dos columnas en escritorio, con ficha de comparación"` (+ trailer).
