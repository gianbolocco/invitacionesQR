# Alerta de permanencia: plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o
> superpowers:executing-plans, tarea por tarea. Los pasos usan `- [ ]`.

**Objetivo:** avisarle a la garita cuando una visita o un proveedor lleva más
horas adentro que el umbral que fijó el admin para su tipo.

**Arquitectura:** el umbral vive en `neighborhood`. `/gate/adentro` devuelve
`alertaDesde` (el vencimiento ya calculado) y `alertaVista`. La garita compara
contra su reloj cada 30 s con una función pura (`web/src/lib/permanencia.ts`), y
un proveedor de contexto montado en `ChromeGarita` reparte el resultado al
aviso del header, al panel y al tablero. El "Ya lo vi" se guarda en el
`entry_log` abierto.

**Stack:** Express + Drizzle + Postgres (api), Next.js 16 + TanStack Query
(web), vitest, Playwright.

**Spec:** [2026-10-19-alerta-permanencia-design.md](../specs/2026-10-19-alerta-permanencia-design.md)

## Restricciones globales

- Código y comentarios en español; la UI en voseo.
- Fechas siempre en hora de Buenos Aires; nunca `new Date()` para calcular un día
  (acá se compara un instante con otro, que es lo correcto).
- Errores: `throw new AppError(status, 'codigo_en_snake')`.
- Colores: solo tokens de `globals.css` (la alerta usa `espera` / `espera-tint`).
- Next.js 16: leer `web/AGENTS.md` antes de usar una API de Next.
- Garita: verificar primero a 1280 px y después a 390 px.
- Commits: `feat:` / `fix:` en minúscula, con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificación final: la de `CLAUDE.md` (api test + tsc, web check + lint + tsc + e2e).

---

### Tarea 1: umbrales en el barrio (esquema + admin API)

**Archivos:** `api/src/db/schema.ts`, `api/drizzle/0013_alerta_permanencia.sql`
(con `npx drizzle-kit generate`), `api/src/services/neighborhoods.ts`,
`api/src/routes/admin.ts:118-129`, `api/tests/admin.test.ts`.

**Produce:** `overstayHours: { visita: number | null; proveedor: number | null }`
en `GET` y `PATCH /admin/neighborhood`.

- [ ] **Paso 1: tests que fallan** en `admin.test.ts`:
  - `'el barrio arranca sin alertas de permanencia'`: el GET devuelve
    `overstayHours: { visita: null, proveedor: null }`.
  - `'guarda y apaga los umbrales'`: un PATCH con `{ overstayHours: { visita: 6, proveedor: null } }`
    responde con los valores, y uno con `visita: null` lo apaga.
  - `'rechaza umbrales fuera de 1..72 o no enteros'`: `0`, `73` y `2.5` dan 400.
- [ ] **Paso 2: esquema.** En `neighborhoods` van `overstayHoursVisita` y
  `overstayHoursProveedor` (`smallint`, null) con
  `check(... between 1 and 72)`. En `entryLogs` van `overstaySeenAt`
  (timestamptz) y `overstaySeenBy` (uuid → people). Las cuatro columnas en la
  misma migración, `0013`.
- [ ] **Paso 3: servicio y ruta.** `getNeighborhood` devuelve `overstayHours`
  armado de las dos columnas. `updateNeighborhood` acepta `overstayHours?`
  parcial: si viene una clave, se pisa esa columna. La ruta valida
  `z.number().int().min(1).max(72).nullable()` para cada tipo.
- [ ] **Paso 4:** `npm test` y `npx tsc --noEmit` en `api`. Commit:
  `feat: el admin configura las horas de permanencia por tipo`.

### Tarea 2: alerta en `/gate/adentro` y "Ya lo vi"

**Archivos:** `api/src/services/entries.ts` (`insideNow` y `AgendaRow`, ~425-520),
`api/src/routes/gate.ts`, `api/tests/egresos.test.ts` (o un archivo nuevo,
`api/tests/permanencia.test.ts`).

**Produce:** filas con `alertaDesde: string | null` y `alertaVista: boolean`;
`POST /gate/invitations/:id/alerta-vista` → `{ ok: true }`.

- [ ] **Paso 1: tests que fallan** (`permanencia.test.ts`, con los helpers de
  `egresos.test.ts`):
  - `'alertaDesde es el ingreso abierto más viejo más el umbral del tipo'`: con
    visita = 2 h y dos ingresos abiertos de una invitación de cupo 2 (hace 3 h y
    hace 1 h), `alertaDesde` es el de hace 3 h más 2 h.
  - `'sin umbral o frecuente, alertaDesde es null'`.
  - `'ya lo vi marca los ingresos abiertos y queda en la auditoría'`: después,
    `alertaVista` da true, `overstay_seen_by` tiene al guardia y hay un
    `audit_log` con la acción `entry.overstay_seen`.
  - `'un reingreso vuelve a alertar'`: se marca visto, se registra el egreso y
    un ingreso nuevo, y `alertaVista` da false.
  - `'ya lo vi sin nadie adentro da 409 no_esta_adentro'`, y `'de otro barrio da 404'`.
- [ ] **Paso 2: `insideNow`.** En la subconsulta `abiertas` van
  `min(entered_at) as primero` y
  `bool_and(overstay_seen_at is not null) as vista`, y se hace join a
  `neighborhood n` por `u.neighborhood_id`. Columnas nuevas:
  ```sql
  case i.kind
    when 'visita'    then abiertas.primero + make_interval(hours => n.overstay_hours_visita)
    when 'proveedor' then abiertas.primero + make_interval(hours => n.overstay_hours_proveedor)
  end                as "alertaDesde",
  abiertas.vista     as "alertaVista"
  ```
  Un umbral NULL da NULL solo, y `frecuente` cae fuera del `case`. En
  `AgendaRow` los dos campos se agregan como opcionales, porque la agenda del
  día no los trae.
- [ ] **Paso 3: ruta.** `POST /gate/invitations/:id/alerta-vista` (con
  `validarUuid`), que llama a `marcarAlertaVista(invitationId, guardId,
  neighborhoodId)` en `entries.ts`. La función verifica que la invitación sea
  del barrio (404) y hace `update entry_log set overstay_seen_at = now(),
  overstay_seen_by = guardId where invitation_id = ... and exited_at is null
  returning id`. Si no hay filas, 409 `no_esta_adentro`. Después,
  `audit(..., 'entry.overstay_seen', 'invitation', id)`. `avisarAlEscribir`
  ya avisa a las demás garitas.
- [ ] **Paso 4:** test + tsc. Commit: `feat: la garita sabe quién se pasó de su tiempo y puede marcarlo visto`.

### Tarea 3: lógica pura de la permanencia (web)

**Archivos:** `web/src/lib/permanencia.ts`, `web/src/lib/permanencia.check.ts`,
`web/src/lib/queries/garita.ts` (tipo `AgendaRow`), `web/package.json` (si
`check` enumera los archivos).

**Produce:**
```ts
export type Excedida = AgendaRow & { alertaDesde: string; exceso: string }
export function excedidas(filas: AgendaRow[], ahora: Date): Excedida[]   // alertaDesde <= ahora, la que más se pasó primero
export function sinVer(e: Excedida[]): Excedida[]                         // !alertaVista
export function textoExceso(desde: string, ahora: Date): string           // '15 min', '1 h', '1 h 20', '26 h'
export function aparecieron(antes: Set<string>, ahora: Excedida[]): boolean
export function primeroExcedidas<T extends { id: string }>(filas: T[], ids: Set<string>): T[] // orden estable
```

- [ ] **Paso 1: check que falla.** Cubre que justo en `alertaDesde` ya cuenta
  como excedida, que null nunca cuenta, el orden, los textos (59 min, 60 min →
  '1 h', 80 min → '1 h 20') y que `aparecieron` da false si solo se fueron
  alertas.
- [ ] **Paso 2: implementar** y sumar los campos opcionales a `AgendaRow`.
- [ ] **Paso 3:** `npm run check && npx tsc --noEmit`. Commit: `feat: lógica de las alertas de permanencia`.

### Tarea 4: formulario del admin

**Archivos:** `web/src/app/(admin)/admin/barrio/page.tsx`,
`web/src/lib/queries/admin.ts` (tipo `Barrio` y `useGuardarBarrio`).

- [ ] **Paso 1:** una sección "Alertas de permanencia" debajo de la dirección,
  con una fila por tipo (Visitas, Proveedores). Cada fila lleva un `Switch` y un
  `Input type="number" min=1 max=72` con el sufijo "horas", que se deshabilita
  con el switch apagado. Al prender el switch, el valor arranca en 6 para
  visitas y 8 para proveedores. Debajo va una `Nota`: "Los frecuentes no
  alertan. La garita avisa cuando alguien lleva más que esto adentro sin
  registrar la salida." Se guarda con el botón "Guardar" que ya existe, y
  se precarga igual que la dirección (el patrón de `cargado`).
- [ ] **Paso 2:** un valor fuera de rango se marca en el campo y bloquea
  Guardar. El error 400 de la API se traduce en la mutación ("Las horas van de
  1 a 72").
- [ ] **Paso 3:** lint + tsc, y verlo a 1280 px y a 390 px. Commit:
  `feat: el admin configura las alertas de permanencia desde barrio`.

### Tarea 5: aviso, panel y sonido en la garita

**Archivos:** `web/src/components/garita/alertas-permanencia.tsx` (nuevo),
`web/src/components/garita/chrome.tsx`, `web/src/lib/queries/garita.ts`
(`useMarcarVista`).

**Produce:** `AlertasProvider`, `useAlertas(): { ahora: Date; excedidas: Excedida[]; pendientes: Excedida[] }`,
`BotonAlertas`.

- [ ] **Paso 1: `useMarcarVista`** en `queries/garita.ts`: un
  `POST /gate/invitations/:id/alerta-vista` que, al terminar, llama a
  `invalidarGarita(qc)`. Un 409 `no_esta_adentro` se traduce como "Ya salió".
- [ ] **Paso 2: `AlertasProvider`.** Usa `useAdentro(true)`, que comparte la
  query con la agenda. Tiene un `ahora` con `setInterval` de 30 s y calcula
  `excedidas` y `pendientes` con `useMemo`. El sonido sale de un efecto que
  compara contra un `useRef<Set<string>>` con `aparecieron` y, si da true y el
  sonido no está silenciado, toca `pitar()`: un `AudioContext` con dos
  osciladores de 880 Hz y 150 ms, que es un sonido corto y no un loop. Si el
  navegador lo bloquea por autoplay, se ignora con try/catch.
- [ ] **Paso 3: `BotonAlertas`** en el header de `ChromeGarita`, antes del
  nombre del guardia, con el estilo `BOTON_HEADER`. Lleva el ícono
  `TriangleAlert` con un badge del número de `pendientes`. Si no hay ninguna,
  no se renderiza. `aria-label`: "N personas pasaron su tiempo adentro".
  Abre el panel.
- [ ] **Paso 4: el panel** (`Sheet side="auto"`). El título es "Pasaron su
  tiempo" y debajo va el interruptor "Sonido" (`usePreferencia('garita.alertas.sonido')`).
  Siguen las secciones "Sin ver" y "Ya vistas". Cada fila muestra nombre,
  `TagTipo`, lote, patente, "Entró 13:10" (con `fechas.ts`) y "Se pasó 1 h 20"
  en `text-espera`, con dos botones de al menos 44 px: *Ver*, que navega a
  `/garita/invitacion/[id]` y cierra el panel, y *Ya lo vi*, que solo aparece
  en las sin ver. Si la lista queda vacía, el panel se cierra solo.
- [ ] **Paso 5:** `ChromeGarita` envuelve todo en `AlertasProvider`. Hay que
  actualizar el comentario del archivo: ahora también reparte las alertas.
- [ ] **Paso 6:** lint + tsc. Probarlo en el navegador a 1280 px y a 390 px
  con un umbral de 1 h y una carga manual de hace 2 h sin salida. Commit:
  `feat: la garita avisa y suena cuando alguien se pasó de su tiempo`.

### Tarea 6: marcar a los excedidos en el tablero y la lista

**Archivos:** `web/src/components/garita/agenda-dia.tsx`,
`web/src/components/garita/tarjeta-invitado.tsx`,
`web/src/components/garita/vistas/tablero.tsx`, `vistas/lista.tsx`.

- [ ] **Paso 1:** `agenda-dia` lee `useAlertas()`, arma un `Set` con los ids
  excedidos y ordena `columnas.adentro` con `primeroExcedidas`, solo cuando se
  mira hoy.
- [ ] **Paso 2:** `TarjetaInvitado` y la fila de la lista reciben
  `exceso?: string`. Cuando viene, llevan `border-espera bg-espera-tint` y un pie
  "Se pasó {exceso}" en `text-espera font-semibold`, que reemplaza el "hace
  cuánto". El dato no puede ir solo en el color: va también el ícono y el
  texto.
- [ ] **Paso 3:** lint + tsc, y captura a 1280 px y a 390 px en claro y oscuro.
  Commit: `feat: los que se pasaron de su tiempo van primero en adentro`.

### Tarea 7: e2e y documentación

**Archivos:** `web/e2e/permanencia.spec.ts` (nuevo), `README.md`.

- [ ] **Paso 1: e2e.** El admin (`entrar(page, 'admin')`) prende visitas = 1 h
  en Barrio y guarda. El guardia carga por `/garita/cargar` a una persona sin
  invitación, con ingreso hace 2 h y sin salida. En `/garita` ve el botón
  "1 persona pasó su tiempo adentro", abre el panel, ve el nombre y "Se pasó",
  toca *Ya lo vi* y el botón desaparece. La tarjeta sigue marcada en
  "Adentro". El test se repite con `viewport: { width: 390, height: 844 }`. Al
  final, el umbral se apaga para no afectar a los otros specs.
- [ ] **Paso 2:** en el README, en "Cómo funciona → El guardia", agregar un
  párrafo sobre la alerta de permanencia, y en "El admin", que la configura.
- [ ] **Paso 3:** la verificación completa de `CLAUDE.md`. Commit:
  `feat: e2e de la alerta de permanencia`.
