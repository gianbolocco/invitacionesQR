# Plan de rediseño: VisitPass → identidad Pazzit

> Autosuficiente: quien implemente no vio la conversación que lo originó. Leé este archivo
> entero, después `PROGRESO-REDISENO.md`, y arrancá por la primera fase pendiente.
> Reglas del repo en `CLAUDE.md` (español, voseo, hora de Buenos Aires, `AppError`, Next 16:
> leer `web/AGENTS.md` antes de usar una API de Next). Si algo de este plan rompe
> funcionalidad o no se puede hacer: frená, anotalo en `PROGRESO-REDISENO.md` y consultá.

## 0. Contexto y decisiones tomadas

- **Qué cambia:** solo lo visual, el movimiento, la copy y los bugs de UI listados. **No** se tocan
  lógica de negocio, endpoints, modelos, permisos, nombres de rutas ni `api/`, con **una** excepción
  aprobada por el dueño: el campo `entered` en la respuesta pública de la invitación (§7, fase b).
- **Referencia de marca:** el código de la landing en `C:\Users\gianl\Desktop\pazzit\pazzit-landingpage`
  (`app/globals.css`, `components/Pass.tsx`). La landing publicada (pazzit.com) no respondía al
  armar el plan (HTTP: "no available server"; HTTPS: certificado inválido).
- **Marca: "Pazzit manda"** (decisión del dueño). Azul, navy y sol de Pazzit en toda la UI. El barrio
  aparece con su **nombre y logo**; su color (`--marca-base`, elegido en Administración → Barrio) queda
  **solo** como acento chico en el pase (el punto antes del nombre del barrio) y en el ícono de la app
  instalada (`lib/icono-marca.tsx`, sin cambios). El selector de color del admin se mantiene tal cual.
- **Dispositivo:** vecino e invitado se diseñan **desde el celular (390px)**. Garita y administración se
  diseñan **desde el escritorio (1280px+)**; el celular para ellos es secundario pero no se rompe.
- **Prototipo visual:** `docs/rediseno/prototipo.html` (abrir en el navegador). Es la referencia de
  aspecto de las 4 pantallas clave y del momento de marca. Ante una duda entre el prototipo y este
  texto, manda este texto.
- **Capturas:** `docs/rediseno/antes/` (156 + 3 de viewport). **No se versionan** (decisión del dueño:
  están en `.gitignore`); si faltan, se regeneran sobre `dev` antes de empezar con
  `node docs/rediseno/capturas.cjs docs/rediseno/antes`, y el después con `… docs/rediseno/despues`
  (stack levantado y cuentas e2e sembradas; ver §7).

### Skills por fase (usalos; si no están instalados, seguí este plan igual)

| Fase | Skills |
|---|---|
| a. Fundaciones | `emil-design-eng`, `high-end-visual-design` (pulido), `full-output-enforcement`, `mobile-native` |
| b. Vecino, invitado y pase | `animate` (momento de marca), `apple-design`, `emil-design-eng`, `mobile-native` |
| c. Garita | `emil-design-eng`, `animation-performance`, `web-design-guidelines` |
| d. Admin y auditoría | `emil-design-eng`, `web-design-guidelines` |
| e. Estados, errores y acceso | `ask-sonner` (toasts), `web-design-guidelines` |
| f. Pulido de movimiento | `review-animations`, `improve-animations`, `animation-vocabulary` |
| Verificación (Opus) | `web-design-guidelines`, `break-ui`, `review-animations` |

No usar `industrial-brutalist-ui`, `minimalist-ui`, `stitch-design-taste`, `brandkit` ni las de imagen.
`design-taste-frontend` se declara para sitios públicos, no para pantallas de app: aplicala solo como
criterio en el link del invitado y el login. Donde `redesign-existing-projects` sugiere grano, glass,
degradados o fotos de fondo, **gana la marca: diseño plano**.

## 1. Identidad aplicada

### 1.1 Tokens (reemplazan los de `web/src/app/globals.css`)

Se conservan los **nombres** que ya usan ~100 componentes (`ink`, `ink-soft`, `surface`, `card`, `line`)
con valores nuevos, y se **renombran** los que eran del barrio (`marca*` → `azul*`, `peligro` → `alto`).

| Token app | Claro | Oscuro | Uso |
|---|---|---|---|
| `--surface` (fondo de página) | `#F3F6FF` | `#0A1030` | `bg-surface` |
| `--card` | `#FFFFFF` | `#131B45` | tarjetas, inputs, header, hojas |
| `--surface-sunk` | `#E8EDFB` | `#1A2357` | bloques hundidos, skeleton |
| `--line` | `#E1E6F5` | `#24306A` | divisores |
| `--control` | `#7C86A8` | `#7480B8` | borde de inputs y botón secundario (3:1) |
| `--ink` | `#0B1640` | `#E6ECFF` | texto |
| `--ink-soft` | `#4A5578` | `#A6B0D6` | texto secundario |
| `--azul` | `#2F5BFF` | `#2F5BFF` | botón principal (texto blanco) |
| `--azul-text` | `#2F5BFF` | `#7D93FF` | links, íconos activos, texto azul |
| `--azul-tint` | `#E3E9FF` | `#24306A` | estado "invitado", hover, ítem activo |
| `--navy` | `#0B1640` | `#0B1640` | texto sobre sol |
| `--sol` | `#FFC933` | `#FFC933` | acento (ver reglas) |
| `--verde` / `--verde-tint` | `#0E7A55` / `#E2F6EC` | `#5BE0A8` / `#0F2B26` | validado |
| `--espera` / `--espera-tint` | `#8A5A00` / `#FFF3D1` | `#FFD166` / `#2E2410` | esperando / atención |
| `--alto` / `--alto-tint` | `#B42318` / `#FDE7E4` | `#FF8A7A` / `#3A1620` | vencido, anulado, error |
| `--focus` | `#2F5BFF` | `#FFC933` | anillo de foco |
| `--barrio` | `var(--marca-base)` | igual | **solo** el punto del barrio en el pase |
| `--escaner-fondo` | `#0A1030` | igual | visor de cámara (oscuro siempre) |

Tailwind (`@theme inline`): exponer `azul`, `azul-text`, `azul-tint`, `navy`, `sol`, `verde`, `verde-tint`,
`espera`, `espera-tint`, `alto`, `alto-tint`, `control`, `barrio`, además de los existentes. Nombres shadcn:
`primary=azul`, `primary-foreground=#fff`, `destructive=alto`, `ring=focus`, `background=card`.
Borrar: `--marca`, `--marca-deep`, `--marca-suave`, `--marca-line`, `--sobre-marca`, `--peligro`,
`--color-pass-*`, `--color-deny-*`, `--escaner-acento`, `--shadow-fila`, `--shadow-tarjeta*`, `--shadow-flotante`
(se reemplaza por `--sombra-flotante`). Mantener `--marca-base` (lo inyecta `app/layout.tsx`).
El tema oscuro se escribe dos veces, como hoy y como en la landing (`:root[data-theme='dark']` y
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`).

**Reglas de color**
- Sol: una sola cosa por pantalla, siempre con texto/ícono navy, nunca como texto sobre fondo claro.
  Usos permitidos: talón validado, marco del escáner al leer, foco en oscuro, `::selection`.
- Colores de estado solo para estados, siempre con su palabra (y un ícono cuando entra).
- Ningún hex suelto en componentes: solo en `globals.css` y `lib/marca.ts`. Excepción documentada:
  el talón del pase (`#FFFFFF` y `#0B1640` fijos, ver PassCard) va en `globals.css` como `--talon-fondo` y `--talon-qr`.

### 1.2 Tipografía, forma, sombras y movimiento

- **Onest** (400, 600, 700, 800) con `next/font/google`, variable `--font-onest`; `--font-sans` y
  `--font-display` apuntan a Onest. Se van Geist y Bricolage. **Bagel Fat One no se carga**: solo vive en los SVG del logo.
- Escala (clases utilitarias en `globals.css`, copiadas de la landing y ajustadas):
  `t-display` 32/36 800 −1px (≥768: 40/44) · `t-title` 24/30 700 −0.5px · `t-heading` 20/28 700 ·
  `t-body` 16/24 · `t-small` 14/20 · `t-caption` 13/16 600. **Nada por debajo de 12px**, ni
  `uppercase` sostenido, ni `tracking` en etiquetas (se borran los 37 `text-[10…11px]` y los 39 `uppercase`).
  `body` pasa de 15 a **16px**. Números: `tabular-nums`. Títulos: `text-wrap: balance`.
- Radios: `--radius-sm 8px` (chips, inputs, filas activas) · `--radius-md 14px` (botones, tarjetas) ·
  `--radius-lg 24px` (pase, hojas, contenedores grandes). Se borra `--radius-xl`. Sin `rounded-full` salvo avatares y puntos.
- Sombras: solo `--sombra-pase: drop-shadow(0 14px 16px rgb(11 22 64 / .14))` (oscuro: `rgb(0 0 0 / .35)`) y
  `--sombra-flotante: 0 18px 40px -16px rgb(11 22 64 / .35)` (oscuro: `rgb(0 0 0 / .6)`, nunca una sombra de color sobre fondo oscuro) para hojas, diálogos, toasts y el botón flotante.
  Tarjetas, inputs y filas: **planos** (sin `shadow-*`).
- Íconos: `lucide-react` con `strokeWidth={2}` (es lo que usa la landing). Sin emojis ni glifos (▲▼).
- Movimiento: `--ease-out: cubic-bezier(.22,1,.36,1)` · `--ease-in-out: cubic-bezier(.76,0,.24,1)` ·
  `--ease-hoja: cubic-bezier(.32,.72,0,1)` · `--t-press 120ms` · `--t-hover 180ms` · `--t-ui 220ms`.
  Reemplazan `--ease-salida`, `--ease-entrada`, `--ease-vista`.
- Layout: gutter 16px (celular) / 24px (≥768) / 32px (≥1280). Ancho máximo: vecino 640px de contenido;
  garita 1440px; admin 1280px. Pantallas a `min-h-dvh`.

### 1.3 Logo y assets

Copiar `pazzit-landingpage/public/brand/*.svg` a `web/public/brand/` (no editarlos; siempre como `<img>`:
comparten `mask id="m1"` y en línea chocan). Componente nuevo `components/dominio/logo-pazzit.tsx`:
`<LogoPazzit variante="lockup|mark" ancho>` que alterna `-claro`/`-oscuro` por CSS (como `Logo.tsx` de la landing).
Favicon de la pestaña: sigue siendo el del barrio (`app/icon.tsx`, sin cambios).

### 1.4 Componentes base (especificación)

| Componente | Archivo | Especificación |
|---|---|---|
| Button | `ui/button.tsx` | Variantes: `default` azul/blanco, hover `color-mix(azul 84%, navy)`; `secondary` (reemplaza `outline`) borde 2px `control`, texto `azul-text`, hover `azul-tint`; `ghost` texto `ink`, hover `azul-tint`; `destructive` `alto`/blanco; `link` `azul-text` subrayado 2px offset 3px; `sol` sol/navy (uso excepcional). Tamaños: `lg` h-14 (56), `default` h-12 (48), `sm` h-11 (44), `icon` 44×44. Se borran `xs`, `icon-xs`, `icon-sm`. Radio 14, 16px/700, `:active scale(.97)` 120ms `--ease-out`; hover solo bajo `(hover:hover) and (pointer:fine)`. Mantener `outline` como alias de `secondary` para no tocar cada uso. |
| Input / Select / CampoFecha / CampoHora | `ui/input.tsx`, `ui/select.tsx`, `dominio/campo-*.tsx` | h-12, radio 8, fondo `card`, borde 2px `control`, foco: borde `azul-text` + anillo 2px `focus` offset 2. `aria-invalid`: borde `alto`. Placeholder `ink-soft`, termina en "…". Sin `shadow-xs`. |
| Campo | `dominio/campo.tsx` | Etiqueta 14/600 `ink`; ayuda 14 `ink-soft`; error 14 `alto` con ícono `CircleAlert` 16px, entra `err-in` 200ms. |
| Chips (selección) | `dominio/chips.tsx` | Radio 8 (no pastilla), h-11, borde 2px `control`, texto `ink`; activa: fondo `ink` texto `card` (claro) — igual que `.rol-opt` de la landing. El `layoutId` deslizante se mantiene (spring `stiffness 500, damping 40`). Contador `tabular` `ink-soft`. |
| EstadoTag (StatusBadge) | `dominio/estado-tag.tsx` | Radio 8, `px-2.5 py-1`, 13/600, sentence case, ícono 14px + palabra. Mapa: `adentro` verde `Check` "Adentro HH:MM" · `activo` verde "Activa" · `esperando` azul-tint `Clock` "Invitado" (vecino) / "Por llegar" (garita, prop `contexto`) · `invitado` (cuenta) espera `Hourglass` "Sin activar" · `salio`/`concluida` neutro (`surface-sunk`/`ink-soft`) "Salió"/"Concluida" · `vencida` alto `CalendarX` "Vencida" · `anulada` alto `Ban` "Anulada" · `deshabilitado` neutro "De baja". Las claves del tipo `Estado` no cambian. |
| TagTipo / TagManual | `dominio/tag-tipo.tsx` | 13/600, radio 8, sentence case. Frecuente: `azul-tint`/`ink` + `Repeat`. Proveedor: borde 1px `line` + `Truck`. Manual: borde punteado `control` + `PenLine`. |
| PassCard | `dominio/pase.tsx` (reescritura, se exporta como `Pase` para no tocar imports) | Ver §1.5. |
| Fila | `dominio/fila.tsx` | min-h 64 (vecino) / 56 (garita, admin), divisor `line`, título 16/600, meta 14 `ink-soft`; hover `azul-tint` al 50% solo en puntero fino; sin sombra. |
| Tarjeta | utilitaria | `bg-card rounded-[14px] p-5`, sin borde ni sombra sobre `surface`; con borde `line` solo sobre `card`. Se borra `.tarjeta-viva` (sube al hover). |
| Navegación vecino | `vecino/chrome.tsx`, `dominio/barra-seccion.tsx` | Header h-14 sticky `bg-card` + borde inferior `line`: `LogoPazzit mark` 24px + nombre (o logo h-7) del barrio 16/700; derecha avatar 40px (`azul-tint`, iniciales `azul-text`) → perfil. Se va la banda de color y el "Lote 900" duplicado. Barra inferior: `bg-card`, ítems 64px, activo `azul-text` con indicador 3px×24 radio 2 `azul` arriba (spring existente). ≥640: tabs en el header (texto 15/600, activa `azul-tint` + `azul-text`, radio 8). |
| Navegación garita/admin | `garita/chrome.tsx`, `admin/chrome.tsx` | **Escritorio primero.** Header h-16 `bg-card` + borde `line`, ancho máx. 1440/1280: izquierda mark + barrio + rol en `ink-soft` ("Portería" / "Administración"); tabs como arriba; derecha nombre de quien está de turno, `SelectorTema`, cerrar sesión (botones 44×44). Admin conserva "Invitaciones" (volver) como link `ghost`. Celular: igual que hoy (barra inferior; escáner central 56px `azul` con `--sombra-flotante`). |
| SelectorTema | `selector-tema.tsx` | Tres estados se mantienen. Grupo radio 8, botones 44×44 (hoy 36), activo `azul-tint` + `azul-text`. |
| Hoja (Sheet) | `ui/sheet.tsx` | Abajo en celular (radio 24 arriba, asa 36×4 `line`); a la derecha en escritorio (ancho 480). `--sombra-flotante`. Entrada 280ms `--ease-hoja` (translate 100%), salida 200ms. Overlay `rgb(11 22 64 / .4)`. `overscroll-behavior: contain`. Botón cerrar 44×44, `sr-only` "Cerrar" (hoy dice "Close"). |
| Diálogo | `ui/dialog.tsx` | Radio 24, `bg-card`, `--sombra-flotante`; entra `opacity 0, scale .96` → 1 en 200ms `--ease-out`, sale 150ms; `sr-only` "Cerrar". Footer: acción a la derecha en escritorio, apiladas a ancho completo en celular. |
| Toasts | `ui/sonner.tsx` | Fondo `card`, texto `ink`, borde `line`, radio 14, `--sombra-flotante`, ícono de estado con su color (`verde`/`alto`/`azul-text`). Celular: `top-center`; escritorio garita/admin: `bottom-right`. |
| Nota | `dominio/nota.tsx` | Tonos con tokens de estado: error `alto-tint`/`alto`, éxito `verde-tint`/`verde`, info `azul-tint`/`ink`, nuevo `atencion` `espera-tint`/`espera`. Radio 8, 14px, ícono 16. |
| Vacío | `dominio/vacio.tsx` | Ícono 24 en cuadrado 56 radio 14 `azul-tint`/`azul-text`; título `t-heading`; detalle 16 `ink-soft` máx. 40ch; acción opcional. Alineado a la izquierda en escritorio, centrado en celular. |
| ErrorConReintento | `dominio/error-con-reintento.tsx` | Como Vacío con `alto-tint`/`alto`; botón `secondary` "Probar de nuevo". |
| Skeleton | `ui/skeleton.tsx`, `.skeleton-brillo` | Base `surface-sunk`, brillo `color-mix(surface-sunk 55%, card)`, radio 8. Con movimiento reducido: estático. |
| KPI | `dominio/kpi.tsx` | Etiqueta 14/600 `ink-soft` sentence case; valor 32/800 tabular; variación con `TrendingUp/Down` 16px + texto (`verde`/`alto`); `tono="atencion"`: fondo `espera-tint`, texto `espera`, ícono `TriangleAlert` + palabra "Atención". Sparkline y barras en `azul`. Se van `amber-*` y `emerald-*`. |
| BarChart | `bar-chart.tsx` | Barras `azul`, radio 4 arriba, ejes 13px `ink-soft`. |
| LogoPazzit | `dominio/logo-pazzit.tsx` (nuevo) | Ver §1.3. |
| Marca (barrio) | `dominio/marca.tsx` | Nombre en `t-heading` `ink` (ya no en color de barrio); logo en tamaños actuales; variante `banda` se borra (no hay banda). |

### 1.5 PassCard (la pieza central)

Reescribe `components/dominio/pase.tsx` manteniendo el export `Pase` y las props actuales
(`datos`, `qr`, `apagado`, `sello`, `className`, `marcaOverride`) y sumando:
- `estado: 'invitado' | 'validado' | 'anulada' | 'vencida'` (reemplaza `apagado`/`sello`, que quedan
  aceptados y se traducen: `sello='Anulada'` → `anulada`, etc.). Lo calcula una función pura nueva
  `estadoPase(inv, hoy)` en `web/src/lib/estado-invitacion.ts`: `anulada` → anulada; `adentro` o
  `salio` → validado; `vencida` → vencida; `esperando` → invitado. Con check en `estado-invitacion.check.ts`.
- `orientacion: 'horizontal' | 'vertical'` (por defecto horizontal). Vertical = talón abajo.
- `validar?: boolean`: cuando pasa de `false` a `true` con el pase montado, corre el momento de marca (§4.1) una vez.

Estructura (horizontal, como `Pass.tsx` de la landing): dos piezas con `filter: var(--sombra-pase)`.
- **Cuerpo** (izquierda): `bg-card`, radio `24 8 8 24`, muesca de 13px a la izquierda con
  `mask: radial-gradient(...)` (copiar de `.pass-body` de la landing), padding fluido con `cqw`. Contenido:
  EstadoTag (Invitado/Validado/Anulada/Vencida), nombre del invitado 24–28/700 −0.5px `break-words`,
  "Visita para Lote 900" (tipo + unidad) 16 `ink-soft`, vigencia con `CalendarClock` 14/600, "Invita
  Vecina" 14 `ink-soft`, y abajo el barrio: punto 8px `bg-barrio` + nombre 13/600 `ink-soft`.
- **Troquel**: línea de puntos vertical en el borde derecho del cuerpo (`stroke-dasharray: .1 7`, trazo 3,
  `line`); al validar se dibuja encima una en `control`.
- **Talón** (derecha): radio `8 24 24 8`, muesca a la derecha, fondo **`--talon-fondo` (#FFFFFF en los dos
  temas)** con QR **`--talon-qr` (#0B1640)**: un QR invertido sobre navy no lo lee cualquier lector.
  QR `qrcode.react` `marginSize={0}`, ancho `clamp(120px, 30cqw, 168px)`; título accesible actual.
  Validado: fondo `sol`, QR navy (sigue escaneable para registrar la salida) y el talón queda desplazado
  `translateX(8px)` (vertical: `translateY(8px)`).
- **Anulada/vencida**: cuerpo y talón al 60% de opacidad, QR en `grayscale`, chip rojo con la palabra.
  Se borra el sello rotado en mayúsculas.
- **Vertical** (solo link del invitado en celular): cuerpo arriba (radio `24 24 8 8`, muescas abajo a
  los costados), troquel horizontal, talón abajo con QR de **220px**. Motivo: el QR se escanea de esa
  pantalla al sol y a 120px no siempre entra en el lector. Es un desvío del "talón a la derecha" del brief
  **aprobado por el dueño**.
- Accesibilidad: `<article aria-label="Pase de {invitado}, {tipo} para {unidad}, {vigencia}. Estado: {estado}.">`.
  El chip y el estado se anuncian por `aria-live="polite"` cuando cambian.
- `/admin/barrio` (vista previa) sigue usando `marcaOverride` para el punto del barrio.

## 2. Auditoría (priorizada)

Severidad: C crítico · A alto · M medio · B bajo. "antes/…" = captura en `docs/rediseno/antes/`.

| # | Sev | Pantalla / código | Hallazgo | Propuesta | Fase |
|---|---|---|---|---|---|
| 1 | C | Toda la app (`globals.css`, chromes) | Identidad vieja: banda y botones del color del barrio, Geist+Bricolage, fondo crema cálido, radios 6/12/16/22. Pazzit no aparece; la app se llama "VisitPass" en `lib/marca.ts:12`, `escanear/page.tsx:89`, `kit/kit.tsx:43` | Tokens §1.1, Onest, logo, `MARCA_DEFAULT.nombre = 'Pazzit'` | a |
| 2 | C | `i/[token]/page.tsx:926` | Cualquier error (sin red, API caída, 500) muestra "Esta invitación no existe": el invitado cree que lo dejaron afuera | 404 → "No encontramos este pase"; otro error → ErrorConReintento "No pudimos cargar tu pase…" | b |
| 3 | A | Pase (`pase.tsx`) | No es el pase de la marca: ticket vertical con cabecera de color, etiquetas 10px en mayúsculas `#8a8378` (≈3,5:1, no pasa AA), sello rotado | PassCard §1.5 | b |
| 4 | A | Veredicto (`garita/invitacion/[id]`) | Palabras en mayúsculas sostenidas (INGRESO/NO PASA/EGRESO); colores fijos `pass-*`/`deny-*`; el anillo de foco es del color del barrio sobre el campo (verde sobre verde, poco visible: antes/33, 34) | §3.3: "Ingreso" / "No pasa" / "Egreso" en sentence case; campos con tokens de estado; foco `ink` 3px sobre el campo | c |
| 5 | A | Garita hoy (antes/30-garita-hoy, 27.000px de alto) | La agenda renderiza todas las filas (186 con los datos de prueba): página interminable y lenta; nada resume | Grupos con contador; "Adentro" muestra 20 y "Ver los N" (solo UI); `content-visibility: auto` en filas | c |
| 6 | A | Admin vecinos (antes/41, 5.700px) | 85+ filas sin corte | `content-visibility: auto`; encabezado de tabla sticky | d |
| 7 | A | `ui/sheet.tsx:640`, `ui/dialog.tsx:780` | Botón cerrar con `sr-only` "Close" (inglés) y 16px de área | "Cerrar", 44×44 | a |
| 8 | A | Global | 37 textos de 10–11px y 39 `uppercase` con tracking (antetítulos, etiquetas, chips, KPI, encabezados de tabla) | Escala §1.2; antetítulos se borran o pasan a 14/600 `ink-soft` sentence case | a–d |
| 9 | A | Headers garita/admin, `selector-tema.tsx:338` | Botones de 36px (cerrar sesión, admin, tema) | 44×44 | a |
| 10 | A | `globals.css` (bloque `prefers-reduced-motion`) | Mata *todas* las animaciones: los `Loader2` de "Guardando…" quedan congelados y parecen colgados | Regla específica por componente (§4.4); los spinners siguen girando | a |
| 11 | M | `kpi.tsx:48-61` | `amber-*`/`emerald-*` de Tailwind (rompe "solo tokens") y glifos ▲▼ | KPI §1.4 | d |
| 12 | M | Vecino inicio (antes/10) | "Lote 900" dos veces (header y antetítulo); lista única sin orden por relevancia; "Pendiente" en negro no dice qué espera | Agrupar: Adentro ahora / Hoy y próximas / Frecuentes (función pura nueva, §3.1); chip "Invitado" | b |
| 13 | M | Detalle del pase (antes/14) | "Listo. Compartila con…" es un aviso gris arriba; "Compartir" no dice qué pasa | Momento "Visita invitada" (§3.2) y botón "Mandar el pase" | b |
| 14 | M | Escáner (antes/32) | Fondo derivado del color del barrio (verde); colores sueltos `#e5c879`, `#ff8b82`, `#ffb4ad` | Fondo `--escaner-fondo` navy; marco `azul-text` en reposo y `sol` al leer; textos con tokens | c |
| 15 | M | Login (antes/01) | Halo de degradado del color del barrio (decorativo); "Entrá a tu barrio" genérico | Sin degradado; lockup Pazzit arriba; "Entrá a {barrio}" | e |
| 16 | M | Sin conexión | No hay aviso global: con la red caída cada pantalla falla por su lado | Banda "Sin conexión. Lo que ves puede no estar al día." en los tres chromes (`navigator.onLine` + eventos; hook `lib/use-en-linea.ts`) | e |
| 17 | M | `admin/barrio/page.tsx:59` | Carga con "Cargando…" en texto plano; ayuda "se muestra el nombre del barrio en itálica" ya no es cierta | Skeleton; "Sin logo, mostramos el nombre del barrio." | d |
| 18 | M | Tarjetas y filas | Sombras genéricas en tarjetas, filas e inputs (`shadow-tarjeta`, `shadow-fila`, `shadow-xs`) | Plano (§1.2) | a |
| 19 | M | Auditoría (antes/39) | Encabezados en mayúsculas 11px; filas sin hover; estados en negro/contorno | Tabla §3.4 | d |
| 20 | B | `arranque.tsx` | `@keyframes` en un `<style>` en línea | Mover a `globals.css`; mark de Pazzit + nombre del barrio | e |
| 21 | B | `/kit` | 404 en el build de producción (solo dev) | Actualizar a los componentes nuevos; sigue fuera de prod | f |
| 22 | B | `docs`, e2e | `e2e/sesion.ts` busca la etiqueta "Mail" (el campo dice "Email o usuario"; funciona por coincidencia parcial) | Cambiar a `/email o usuario/i` al tocar los e2e | b |
| 23 | B | Bundles | Se cargan dos familias (Geist, Bricolage) | Una sola (Onest) | a |
| 24 | M | Veredicto `garita/invitacion/[id]/page.tsx:29,295` | Etiquetas de la ficha (`dt`) y ayudas con `opacity-70`/`60` sobre el campo rojo: blanco al 70% sobre `#7a1420`/`#B42318` queda por debajo de 4,5:1 | Opacidad ≥ .88 o color sólido del token | c |

Sin hallazgos: no hay errores de consola ni desborde horizontal a 390px en ninguna de las 39 pantallas×estados
capturadas; el formulario de nueva invitación no queda tapado por la barra (verificado en antes/11b);
foco visible y lectora/teclado en garita funcionan y **no se tocan**.

## 3. Rediseño por pantalla

Las cuatro clave tienen prototipo en `docs/rediseno/prototipo.html` y wireframe acá.

### 3.1 Vecino · Inicio (`app/(vecino)/page.tsx`) — celular primero

```
┌──────────────────────────────┐
│ [p] Los Aromos          (VE) │ header bg-card
├──────────────────────────────┤
│ Hola, Vecina.                │ t-display
│ Lote 900                     │ t-small ink-soft (una sola vez)
│                              │
│ Adentro ahora · 1            │ t-heading + contador
│ Carlos Ruiz   [✓ Adentro 12:32]
│ ──────────────────────────── │
│ Hoy y próximas · 2           │
│ Juan Pérez        [◷ Invitado]
│ Visita · Hoy                 │
│ ──────────────────────────── │
│ Frecuentes · 1               │
│ Rosa Benítez      [◷ Invitado]
│ Lun Mié Vie · hasta 15 ene   │
│                              │
│ ┌──────────────────────────┐ │ botón flotante azul, sombra flotante
│ │     +  Invitar visita    │ │
│ └──────────────────────────┘ │
│  Invitaciones  Historial  Perfil
└──────────────────────────────┘
```
Agrupar con una función pura nueva `agruparInicio(invs, hoy)` en `web/src/lib/inicio.ts` + `inicio.check.ts`
(sumarla a `npm run check`): adentro → "Adentro ahora"; frecuentes no adentro → "Frecuentes"; el resto →
"Hoy y próximas", orden por `validFrom`. Grupos vacíos no se muestran. Escritorio: mismo contenido en 640px, botón en el encabezado.

### 3.2 Pase del vecino y link del invitado — celular primero

Vecino (`invitaciones/[id]/page.tsx`): con `?creada=1`, título `t-title` "Visita invitada." + "Mandale el
pase a Juan." (reemplaza la Nota); PassCard horizontal; acciones: `lg` "Mandar el pase" (mismo
`navigator.share`), `secondary` "Copiar link" → "Link copiado", "Editar"; "Anular invitación" como `link`
en `alto`. Si la invitación pasa a `adentro` mientras está abierta (refetch al volver el foco, como hoy),
`validar` corre el momento de marca. Abierta ya validada: estado final quieto.

```
┌──────────────────────────────┐        Invitado (/i/[token]), celular:
│ ← Invitaciones               │        ┌──────────────────────────────┐
│ Visita invitada.             │        │ [pazzit]           [☀ ◐ ☾]  │
│ Mandale el pase a Juan.      │        │ Te invita Vecina · Lote 900  │
│ ╭────────────────╮╭──────╮   │        │ ╭──────────────────────────╮ │
│ │[◷ Invitado]    ┊│ ▓▓▓▓ │   │        │ │[◷ Invitado]              │ │
│ │Juan Pérez      ┊│ ▓▓▓▓ │   │        │ │Juan Pérez                │ │
│ │Visita · Lote 900┊│ ▓▓▓▓ │  │        │ │Visita para Lote 900      │ │
│ │◷ Hoy           ┊│      │   │        │ │◷ Hoy · ● Los Aromos      │ │
│ │● Los Aromos    ┊╰──────╯   │        │ ◗┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈◖ │
│ ╰────────────────╯           │        │ │        ▓▓▓▓▓▓▓▓          │ │
│ [   Mandar el pase   ]       │        │ │        ▓▓ QR 220 ▓▓      │ │
│ [Copiar link] [Editar]       │        │ ╰──────────────────────────╯ │
│      Anular invitación       │        │ ☀ En la entrada, mostrá este │
└──────────────────────────────┘        │   pase con el brillo alto.   │
                                        │ Ganá tiempo en la entrada    │
                                        │ [Documento] [Patente] [Guardar]
                                        │ Cómo llegar · Abrir en el mapa│
                                        │ Pase emitido con [pazzit]    │
                                        └──────────────────────────────┘
```
Invitado: lockup Pazzit arriba a la izquierda (nombre/logo del barrio dentro del pase y en "Te invita");
pie "Pase emitido con Pazzit" (mark 16px + texto 13 `ink-soft`). El formulario "Ganá tiempo en la
entrada" y "Cómo llegar" son tarjetas planas radio 14. Escritorio: PassCard horizontal centrado (máx. 560).

### 3.3 Garita · Veredicto (`garita/invitacion/[id]/page.tsx`) — escritorio primero

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                         │ Documento  [30.123.456      ]   │
│  Ingreso                                │ Patente    [AB 123 CD       ]   │
│  (t 160px/800, verde)                   │ Tipo       Visita               │
│  ─────────────────────────────          │ Lote       Lote 900             │
│  Juan Pérez  (64px/700)                 │ Invita     Vecina E2E           │
│                                         │ Vigencia   Hoy                  │
│                                         │ [     Registrar ingreso     ]   │ 64px
│                                         │ Enter registra · Esc vuelve      │
│                                         │ Cancelar (Esc)   Anular…         │
└───────────────────────────────────────────────────────────────────────────┘
 Al registrar, la zona de acción muta (como hoy): [mini talón → sol] "Ingreso registrado"
 [ Siguiente (8) ] (barra que se vacía)  [ Deshacer ]
```
Solo cambian clases, copy y el ícono de confirmación; **la lógica, los atajos, el foco y el contador
no se tocan**. Campos por tema (se distinguen por luminancia dentro de cada tema):
- "Ingreso" claro: fondo `verde-tint`, palabra `verde`, texto `ink` · oscuro: fondo `verde-tint` oscuro, palabra `verde`, texto `ink`.
- "No pasa" claro: fondo `alto`, texto blanco · oscuro: fondo `alto` (#FF8A7A), texto `navy`.
- "Egreso": fondo `azul-tint`, palabra `azul-text`.
Botón principal: fondo `ink`, texto `card` (contraste máximo sobre el campo); foco: anillo 3px `ink`
offset 3px (en "No pasa" claro, anillo blanco). Inputs del campo: `bg-card`, borde `control`.
La palabra entra como hoy (scale 1.12→1, 260ms, `--ease-out`). Momento de marca: §4.1 (mini talón).
Celular: misma estructura apilada (palabra 64px).

### 3.4 Garita · Hoy (`garita/page.tsx`, `agenda-dia.tsx`, vistas) — escritorio primero

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [p] Los Aromos · Portería   Garita  Auditoría        Guardia E2E [☀◐☾] [⇥]   │
├───────────────────────────────────────────────┬───────────────────────────────┤
│ [🔍 Apellido, documento, unidad o patente…  ]│ ┌ Lectora lista ─────────────┐ │
│                                               │ │ Escaneá un QR o un DNI.    │ │
│ ‹ Hoy › [Sáb, 17 oct]     [Tablero|Lista|…]   │ │ Usar la cámara · Probar    │ │
│ [Todos][Visitas][Frecuentes][Proveedores]     │ └────────────────────────────┘ │
│ [Todos 186][Por llegar 3][Adentro 183][Se fueron 0]  [ + Autorizar sin invitación ]│
│                                               │ Últimos movimientos           │
│ Por llegar · 3                                │ [✓ Adentro] Carlos Ruiz 12:32 │
│ Juan Pérez · Lote 900 · invita Vecina [◷ Por llegar]                          │
│ Adentro · 183                                 │ Cargar movimientos de un corte│
│ Carlos Ruiz ·…                   [✓ Adentro 12:32]                            │
│ … 20 filas · [ Ver los 183 ]                  │                               │
└───────────────────────────────────────────────┴───────────────────────────────┘
```
Grilla `minmax(0,1fr) 22rem` desde 1024px (hoy 768 y 20rem). Búsqueda h-14. "Por llegar" va primero
(es lo que el guardia espera). "Autorizar sin invitación" pasa a la columna derecha como `secondary`
ancho completo. Las cuatro vistas (tablero, lista, compacta, por unidad) se conservan con los
componentes nuevos; la tarjeta del tablero pierde la sombra y el `translateY` al hover.

### 3.5 Resto de pantallas

| Pantalla | Cambios |
|---|---|
| Nueva / editar invitación | Título "¿A quién invitás?" sin color en la palabra; chips de tipo §1.4; bloque "Para entrar más rápido" como tarjeta `surface-sunk` radio 14; botón `lg` "Invitar visita" / "Guardar cambios". |
| Historial | Filas §1.4 con EstadoTag nuevo; contador "1.177 invitaciones" 14/600 sentence case; "Cargar más" `secondary`. |
| Perfil | Tarjetas planas; SelectorTema; "Cerrar sesión" `secondary`. |
| Escáner | §2 #14; pill de estado "Abriendo la cámara…" / "Cámara lista" / "Sin cámara"; error en `alto` claro sobre navy (`#FF8A7A`). |
| Alta exprés, anular (garita) | Hoja §1.4 (derecha en escritorio). |
| Cargar corte, Probar lectora | Componentes nuevos; sin cambios de flujo. |
| Auditoría | Tabla: encabezado sticky `surface-sunk`, 13/600 `ink-soft` sentence case; filas 56px, hover `azul-tint` 50%; EstadoTag; paginación `secondary`. Vista tarjetas: tarjetas planas. |
| Admin tablero | KPI §1.4 (4 por fila ≥1024), barras `azul`; "Atención" con tono espera. |
| Admin vecinos / guardias | Tabla como auditoría; acciones de texto `azul-text`, "Dar de baja" `alto`; `sheet-alta` e importar CSV con Hoja/Campo nuevos. |
| Admin barrio | Paleta del barrio sigue igual (swatches 44px radio 8, seleccionado con anillo `ink`); vista previa con PassCard. |
| Login, olvidé, reset, acceso | Sin halo; lockup Pazzit 120px arriba; tarjeta `card` radio 24 sin sombra; logo/nombre del barrio dentro de la tarjeta sobre el título. |
| 404 | "Por acá no se pasa." + "Volver al inicio". |
| Arranque | Mark de Pazzit 48px + nombre del barrio; barra indeterminada `azul`. |

## 4. Movimiento

### 4.1 Momento de marca: validar el pase (el único fuerte)

Copiado de la landing (`.pass.is-playing`, `globals.css` de la landing, líneas 360–376), sin el `pass-in` inicial
(el pase ya está en pantalla). Duración total 1,1 s, corre **una vez**, el reposo es el estado final:
| t | Qué | Propiedades | Duración / curva |
|---|---|---|---|
| 0 ms | El troquel se dibuja de arriba abajo | `clip-path: inset(0 0 100% 0)` → `inset(0)` | 420ms `--ease-out` |
| 400 ms | El talón se separa | `translateX(0)` → `translateX(8px)` (vertical: Y) | 420ms `--ease-out` |
| 420 ms | El talón se pinta de sol | capa `sol` `opacity 0→1` | 360ms `--ease-out` |
| 700 ms | Sale "Invitado" | `opacity 1→0`, `translateY(0→-4px)` | 260ms `--ease-out` |
| 740 ms | Entra "Validado" | `opacity 0→1`, `translateY(4px→0)` | 360ms `--ease-out` |

Implementación: CSS con clase `is-validando` (keyframes en `globals.css`, prefijo `pase-`), solo `transform`,
`opacity` y `clip-path`. Dónde corre: (1) PassCard con `validar` (vecino viendo su pase cuando entra la visita);
(2) **garita**: en "Ingreso registrado", el check circular se reemplaza por un mini talón (40×56, mismo dibujo)
que corre los pasos 2–3 en 500ms; no bloquea nada (Enter, Esc, Siguiente y Deshacer siguen activos desde el
primer frame); (3) link del invitado: cuando `entered` pasa de `false` a `true` mientras el invitado tiene la
pantalla abierta (ver fase b); abierto ya validado, estado final quieto. Movimiento reducido: sin
desplazamiento ni dibujo; el talón cambia a sol y los chips hacen fundido de 150ms.

### 4.2 Microinteracciones

| Componente | Movimiento |
|---|---|
| Botones, filas, chips | `:active scale(.97)` 120ms `--ease-out` (filas `.99`); hover de color 180ms solo puntero fino |
| Chips / selector de vista / barra inferior | indicador con `layoutId` (ya existe), spring `500/40` |
| Inputs | color de borde 180ms; error `err-in`: `opacity 0, translateY(-4px)` → 0 en 200ms |
| Copiar link | ícono `Copy`→`Check` con `scale .6→1` 200ms; texto "Link copiado" 2s |
| Toasts | los de sonner (entran y salen por el mismo borde) |
| Hojas | 280ms `--ease-hoja` entrada / 200ms salida; overlay fundido 200ms |
| Diálogos | `scale .96 + opacity` 200ms / salida 150ms |
| Lista del inicio del vecino | escalonado 40ms solo la primera carga, tope 8 ítems; anulada sale `x:-24` 200ms (ya existe) |
| KPI | conteo 0→valor 700ms (ya existe) |
| Escáner | marco respira 2,6 s mientras espera (ya existe); al leer: cierra a `scale .9` con spring y cambia a `sol` |
| Veredicto | palabra `scale 1.12→1` 260ms (ya existe); zona de acción cruza con `popLayout` (ya existe) |

### 4.3 Transiciones entre pantallas

Vecino: fundido de 200ms (`template.tsx`, ya existe; **sin transform**: rompería el `position: fixed` del
botón flotante y la barra). Garita y admin: **ninguna** (se usan decenas de veces por hora). El pase del
vecino recién creado entra con `opacity 0, translateY(12px)` → 0 en 380ms `--ease-out` (reemplaza el spring con escala).

### 4.4 Movimiento reducido

Reemplazar el bloque global que pone todas las duraciones en 0,01ms por reglas específicas: dentro de
`@media (prefers-reduced-motion: no-preference)` van los desplazamientos, escalas y bucles; con `reduce`
quedan solo fundidos ≤150ms. `MotionConfig reducedMotion="user"` (ya existe) cubre motion. Los
`animate-spin` de carga siguen girando (son indicadores, no decoración). El skeleton queda estático.

## 5. Copy (antes → después)

| Dónde | Antes | Después |
|---|---|---|
| Inicio vecino, botón / form | Nueva invitación · Crear invitación · Guardando… | Invitar visita · Invitar visita · Invitando… |
| Pase recién creado | Listo. Compartila con Juan. | Visita invitada. / Mandale el pase a Juan. |
| Acciones del pase | Compartir · Copiar link · Copiado | Mandar el pase · Copiar link · Link copiado |
| Texto de compartir | Hola Juan, te dejo el acceso a Los Aromos: {url} | Hola Juan, este es tu pase para entrar a Los Aromos: {url} |
| Bajo el pase (vecino) | Quien lo reciba tiene que subir el brillo para que el lector lo tome. | En la entrada, que muestre el QR con el brillo alto. |
| Diálogo anular | Cancelar · Anular | No, dejarla · Anular invitación |
| Vacío inicio | Creá una invitación y compartila por WhatsApp. Le llega el pase con el QR. | Invitá a alguien y mandale el pase por WhatsApp. Con eso entra. |
| Invitado | Mostrá esta pantalla en la garita con el brillo alto. | En la entrada, mostrá este pase con el brillo alto. |
| Invitado | Entrá más rápido | Ganá tiempo en la entrada |
| Invitado | Esta invitación no existe | No encontramos este pase (404) · No pudimos cargar tu pase. Revisá la conexión y probá de nuevo. (red) |
| Invitado (pie, nuevo) | — | Pase emitido con Pazzit |
| Estados | Pendiente · Activo · Invitado (cuenta) | Invitado (vecino) / Por llegar (garita) · Activa · Sin activar |
| Veredicto | INGRESO · NO PASA · EGRESO | Ingreso · No pasa · Egreso |
| Veredicto registrado | Registrado | Ingreso registrado · Salida registrada |
| Escáner | Conectando · Lector activo | Abriendo la cámara… · Cámara lista |
| Escáner | Ese código no es de VisitPass. Enfocá el QR de la invitación o el DNI. | Ese código no es un pase de Pazzit. Probá con el QR del pase o con el DNI. |
| Error con reintento | Reintentar | Probar de nuevo |
| Cerrar hojas/diálogos (sr-only) | Close | Cerrar |
| Login | Entrá a tu barrio | Entrá a {nombre del barrio} |
| 404 | Esta página no existe | Por acá no se pasa. / Esta página no existe. Volvé al inicio. |
| Admin barrio | Sin logo se muestra el nombre del barrio en itálica. | Sin logo, mostramos el nombre del barrio. |
| Sin conexión (nuevo) | — | Sin conexión. Lo que ves puede no estar al día. |

Los e2e que buscan estos textos se actualizan **en el mismo commit** que cambia la copy:
`Crear invitación` (12), `INGRESO` (9) → `Ingreso`, `NO PASA` (5) → `No pasa`, `EGRESO` (2) → `Egreso`,
`Esta página no existe` (1, sigue existiendo como detalle).

## 6. Riesgos y cómo se evitan

| Riesgo | Mitigación |
|---|---|
| Romper flujos de garita (teclado, lectora HID, foco, contador, Deshacer) | En `garita/invitacion/[id]`, `garita/page.tsx`, `escanear` y `use-lectora` solo se tocan `className`, textos e íconos. `npm run e2e` completo al cerrar la fase c. |
| QR ilegible | Talón blanco con QR navy en los dos temas; ≥120px horizontal, 220px en el link del invitado; validado sobre sol (contraste ≈11:1). Probar escaneando con un celular real la pantalla del invitado. |
| Tokens viejos que quedan sueltos | Ampliar `web/scripts/colores.check.mjs`: además de la paleta, prohibir `marca-deep`, `marca-suave`, `sobre-marca`, `peligro`, `pass-field`, `deny-`, `amber-`, `emerald-`, `text-[10px]`, `text-[11px]`, `text-[10.5px]` fuera de `globals.css`. |
| `transform` en un ancestro rompe `position: fixed` | Nada de transform en `template.tsx` ni en los chromes. |
| SVG del logo en línea choca (`mask id="m1"`) | Siempre `<img>`. |
| Next 16 con APIs distintas | Leer `web/AGENTS.md` y `node_modules/next/dist/docs/` antes de tocar `layout.tsx` o fuentes. |
| Color del barrio que deja de verse | Es la decisión tomada; el admin sigue eligiéndolo y se ve en el pase, su vista previa y el ícono. |
| Manifest y barra del navegador | `manifest.ts` `background_color` → `#F3F6FF`; `generateViewport` → claro `#F3F6FF`, oscuro `#0A1030`; `AplicarMarca` deja de pisar `theme-color` con el color del barrio. |
| Capturas pesadas en git (38 MB) | No se versionan: `docs/rediseno/antes/`, `docs/rediseno/despues/` y `docs/rediseno/*.png` están en `.gitignore`. |
| Cambio de API del invitado | Solo suma un campo de lectura calculado con la misma consulta que `frozen`; test en `api/tests/public-invite.test.ts`; no cambia ningún campo existente. |

## 7. Fases de implementación

Rama: `rediseno-pazzit` desde `dev`. Commits chicos (`style:` / `feat:` / `fix:` en español, minúscula).
Al cerrar **cada** fase: `cd api && npm test` · `cd web && npm run check && npm run lint && npx tsc --noEmit` ·
`docker compose up -d --build` · `cd web && npm run e2e` · recorrer a mano login → invitar → mandar pase → ver
pase como invitado → escanear/validar → historial → auditoría → admin; regenerar capturas de las pantallas
tocadas; actualizar `PROGRESO-REDISENO.md`.
Cuentas de prueba: las crea `web/e2e/preparar.ts` (contraseña de test en `web/e2e/sesion.ts`).

**a. Fundaciones** — `globals.css` (tokens §1.1, escala, radios, sombras, curvas, reduced motion §4.4),
`app/layout.tsx` (Onest, `themeColor`), `manifest.ts`, `lib/marca.ts` (`nombre: 'Pazzit'`), `lib/marca-cliente.tsx`
(no pisar `theme-color`), assets y `LogoPazzit`, todos los componentes de §1.4, chromes y barra inferior,
`colores.check.mjs` ampliado; reemplazo mecánico `marca`→`azul`, `sobre-marca`→`white`, `peligro`→`alto`
en todas las pantallas. *Terminado cuando:* todos los checks pasan, `grep` de tokens viejos da cero, las 39
pantallas se ven con la paleta nueva en claro y oscuro sin desborde a 390 ni a 1280, e2e verde.

**b. Pase, vecino e invitado** (celular primero) — PassCard + `estadoPase` + check; momento de marca CSS;
inicio con `agruparInicio` + check; nueva/editar; detalle; historial; perfil; `/i/[token]` (incluye bug #2).
Copy de §5 que toca estas pantallas + e2e.
**Cambio de API aprobado (commit propio, `feat:`):** en `findPublicByToken` (`api/src/services/invitations.ts`)
sumar `entered: n > 0` usando el mismo `entriesOf(row.id)` que ya calcula `frozen` (una sola llamada guardada en
una constante, sin consulta nueva). `frozen` queda igual. Test en `api/tests/public-invite.test.ts`: `entered`
es `false` recién creada y `true` después de un `POST /gate/entries`. En el front, `Publica` suma
`entered: boolean`; el pase del invitado usa `estado = anulada | vencida | (entered ? 'validado' : 'invitado')`,
y la query de `/i/[token]` refresca cada 10 s (`refetchInterval: 10_000`, sin refrescar en segundo plano)
solo mientras el pase está `invitado`. `validar` corre el momento de marca cuando `entered` cambia a `true`.
*Terminado cuando:* el pase pasa por sus 4 estados en claro/oscuro y en las dos orientaciones, el momento de
marca corre una sola vez y respeta movimiento reducido, con el link abierto en un celular y un ingreso
registrado en garita el pase del invitado se valida solo en ≤10 s, un error de red en `/i/...` muestra
"No pudimos cargar tu pase", `cd api && npm test` pasa, y un QR del link del invitado se lee con un celular real.

**c. Garita** (escritorio primero) — chrome, hoy (grilla, grupos, "Ver los N", `content-visibility`), cuatro
vistas, búsqueda, alta exprés, anular, veredicto (§3.3 + mini talón), escáner, cargar, lectora.
*Terminado cuando:* e2e de garita, anulación y carga manual verdes; Enter/Esc/lectora funcionan igual que antes;
la página de hoy con 180+ personas mide menos de 3 pantallas de alto en 1280×800.

**d. Admin y auditoría** (escritorio primero) — chrome, tablero/KPI/gráficos, vecinos, guardias, barrio, auditoría
(tabla y tarjetas), importar CSV. *Terminado cuando:* e2e de admin y vecinos-por-lote verdes; no quedan `amber-`/`emerald-`.

**e. Estados, errores y acceso** — login, olvidé, reset, acceso, 404, arranque, banda sin conexión (`use-en-linea.ts`),
Vacío/Error/Skeleton en todas las listas, toasts. *Terminado cuando:* cada lista tiene sus estados carga/vacío/error
con el componente nuevo y la banda aparece al cortar la red (DevTools offline).

**f. Pulido de movimiento** — revisar §4 completo con `review-animations`; `/kit` con los componentes nuevos.
*Terminado cuando:* nada anima `width/height/top/left`, nada usa `transition: all`, y con movimiento reducido no se desplaza nada.

## 8. Decisiones del dueño (resueltas el 2026-10-17)

1. **Pase vertical en el link del invitado (celular)**, QR de 220px: **sí**.
2. **Momento de marca en el link del invitado** con el campo `entered` en la API pública: **sí, dentro del
   rediseño** (fase b).
3. **Veredicto:** **"Ingreso" / "No pasa" / "Egreso"** en sentence case (no "Pasa./Sale.").
4. **Capturas:** **no se versionan** (`.gitignore`).

Placeholders: ninguno. La interfaz no muestra métricas, testimonios ni datos inventados; los nombres del
prototipo son de ejemplo y no van al código.
