# Rediseño de UI/UX del front de VisitPass

Fecha: 2026-10-11 · Estado: para revisión

## Objetivo

Rehacer la interfaz de `web/` con una identidad nueva, moderna y profesional,
y de paso resolver los problemas de estructura que hacen a la app frágil:
vistas que no son rutas, sesión pedida en cada pantalla, datos sin caché y
errores que se ven como listas vacías. El resultado se despliega por fases y
cada fase deja la app funcionando.

Fuera de alcance: cambiar reglas de negocio, el modelo de datos o los flujos
de autorización. El backend solo recibe los agregados chicos que el diseño
necesita (ver "Cambios en la API").

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dirección visual | **Editorial cálido**: estructura y legibilidad editorial (títulos grandes, filas con línea fina, estados en etiqueta explícita) sobre neutros cálidos, con el color del barrio en una banda superior y en las acciones. La invitación se presenta como un **pase** troquelado con QR en el detalle y en la página del invitado. |
| Librerías | shadcn/ui sobre Radix, `motion`, TanStack Query, `sonner`, `vaul`, `lucide-react`, `cmdk` (vía shadcn Command), `react-day-picker` (vía shadcn Calendar). |
| Garita | Tiene que andar igual en celular, tablet y PC. Una sola pantalla que se reacomoda. |
| Admin | Pensado para escritorio, usable en celular. |
| PWA | Instalable, con la marca del barrio. Sin modo offline. |
| Camino | Reconstrucción sobre el mismo código, por fases (A). |

Mockups aprobados: `.superpowers/brainstorm/656-1791695509/content/`
(`hibridos.html` opción 1, `garita-admin.html`).

## Sistema de diseño

### Tokens

Se conserva el mecanismo de marca: el servidor inyecta `--marca-base` y el
resto se deriva con `oklch(from …)`. La paleta cerrada de ocho colores y su
validación de contraste no cambian.

- **Neutros cálidos**: fondo `#f6f3ee`, tarjeta `#ffffff`, línea `#e6e0d6`,
  tinta `#14130f`, tinta suave `#8a8378` (afinar contra WCAG AA en la
  implementación). Oscuro rediseñado con la misma lógica: cada valor elegido
  contra su fondo, nunca invertido.
- **Radios**: 6 (etiquetas), 12 (inputs y botones), 16 (tarjetas), 22 (pase y
  sheets).
- **Sombras**: dos niveles (`sm` para filas elevadas, `lg` para pase, sheets y
  popovers). El borde de 1px reemplaza a la sombra en modo oscuro.
- **Movimiento**: `--dur-rapido 120ms`, `--dur-base 200ms`, `--dur-lento
  320ms`; curvas `--ease-salida cubic-bezier(.2,.8,.2,1)` y un resorte de
  `motion` para elementos compartidos.
- **Veredicto**: los campos `pass`/`deny` quedan fuera de la marca y se
  separan por luminancia, como hoy.

### Tipografía

`next/font`: **Geist** para toda la interfaz y **Bricolage Grotesque** (800)
solo para títulos de página, el saludo, el nombre en el pase y el veredicto.
Se eliminan Archivo y Playfair. Escala: 12 / 13 / 15 / 17 / 22 / 30 / 40 / 64.
Números en `tabular-nums`.

### Componentes

`web/src/components/ui/` — primitivas de shadcn copiadas y restilizadas con
los tokens: `button`, `input`, `label`, `textarea`, `select`, `dialog`,
`sheet`, `drawer` (vaul), `dropdown-menu`, `tabs`, `popover`, `calendar`,
`command`, `tooltip`, `skeleton`, `sonner`, `switch`, `badge`.

`web/src/components/` — componentes de dominio, cada uno con una sola
responsabilidad:

| Componente | Qué hace |
|---|---|
| `Pase` | La invitación como pase: cabecera con marca, nombre, datos en grilla, troquel, QR. Lo usan el detalle del vecino, "creada" y la página del invitado. |
| `EstadoTag` | Etiqueta de estado (esperando, adentro, salió, anulada, vencida, invitado, activo, deshabilitado). Diferencia por relleno y peso de borde, no solo por color. |
| `Fila` | Fila de lista con título, meta, etiqueta y acción. Base de agenda, historial e invitaciones. |
| `EncabezadoPagina` | Título display, subtítulo y acciones de la pantalla. |
| `Vacio` / `ErrorConReintento` | Estados vacío y de error, con ícono y acción. Nunca se confunden. |
| `Kpi` | Indicador con valor, variación y sparkline. |
| `CampoFecha` / `RangoFechas` | Popover con Calendar, en español, semana desde lunes. Reemplazan a `<input type=date>`. |
| `Chips` | Selector de opciones en pastillas. Uno solo para filtros, tipo de invitación y días de la semana. |
| `Marca` | Logo o nombre del barrio. El único que conoce cómo se pinta la marca. |
| `BarraSeccion` | Navegación inferior en mobile (con botón central opcional) y lateral o superior en escritorio. |

Los íconos son todos de `lucide-react`. No quedan caracteres Unicode como
íconos.

## Arquitectura del front

### Rutas y layouts

Grupos de rutas con un layout persistente cada uno: el encabezado y la
navegación se montan una vez por sección.

```
app/
  (auth)/            layout: tarjeta centrada con la marca del barrio
    login/  acceso/  olvide/  reset/
  (vecino)/          layout: banda de marca + barra inferior / superior
    page.tsx                       invitaciones vigentes
    invitaciones/nueva/
    invitaciones/[id]/             detalle (pase)
    invitaciones/[id]/editar/
    historial/
    perfil/                        tema, unidades, cerrar sesión
  (garita)/          layout: banda + barra con escáner central / layout ancho
    garita/
    garita/escanear/
    garita/invitacion/[id]/        veredicto
    garita/auditoria/
  (admin)/           layout: barra lateral + Ctrl K
    admin/  admin/vecinos/  admin/guardias/  admin/unidades/
    admin/barrio/  admin/auditoria/
  i/[token]/         página pública del invitado
  manifest.ts  icon.tsx  apple-icon.tsx  not-found.tsx
```

- El veredicto es una ruta: el "atrás" del celular cancela, y recargar no
  pierde lo que se estaba viendo. El escáner navega a
  `/garita/invitacion/[id]` después de resolver el token.
- Auditoría es un componente (`components/auditoria/`) montado en las dos
  secciones con el menú de cada una.
- Redirecciones permanentes en `next.config.ts`: `/nueva` →
  `/invitaciones/nueva` y `/admin/usuarios` → `/admin/vecinos`. `/auditoria`
  depende del rol, así que queda como una página mínima que lee la sesión y
  manda a `/garita/auditoria` o a `/admin/auditoria`.
- Cada grupo tiene `loading.tsx` (skeleton con la forma de la pantalla) y
  `error.tsx` (mensaje y reintentar). Hay un `not-found.tsx` propio.

### Sesión

- `SesionProvider` en cada layout protegido. Lee `/auth/me` una vez con
  TanStack Query (`['sesion']`).
- El layout verifica el rol de la sección. Si no corresponde, redirige a la
  casa del rol (`homeFor`). Mientras resuelve, muestra una pantalla de
  arranque con la marca.
- `useSesion()` reemplaza a `useMe()` y nunca devuelve null dentro de un
  layout protegido.
- Solo un 401 manda al login. Un error de red muestra un aviso con
  reintentar y **no** desloguea.
- Se conserva la regla del 403 `forbidden`: recarga en la raíz.
- Login, alta y reset invalidan `['sesion']` antes de navegar.

### Datos

- TanStack Query con un `QueryClient` en el layout raíz. `staleTime` de 30 s
  por defecto; la agenda de la garita se refresca cada 30 s y al volver el
  foco a la pestaña.
- Un archivo por recurso en `web/src/lib/queries/` (`invitaciones.ts`,
  `garita.ts`, `admin.ts`, `auditoria.ts`, `marca.ts`) con las query keys,
  los hooks de lectura y las mutaciones.
- Las mutaciones frecuentes son optimistas (anular, restaurar, deshabilitar,
  reactivar) y se revierten si fallan. Todas informan con un toast.
- `api()` sigue siendo el único fetcher. Se le suma el manejo de 401 y la
  cancelación por `AbortSignal`, que TanStack pasa sola: se acaban las
  respuestas viejas que pisan a las nuevas.
- Los helpers de fecha y hora viven en un solo lugar (`lib/fechas.ts`): se
  borran las copias de `fechaCorta`, `hora` y `hoyISO`.

## Pantallas

### Autenticación

Tarjeta centrada sobre el fondo cálido, con el logo o el nombre del barrio
(no "VisitPass"). En el login: mail, contraseña con mostrar/ocultar, Google si
está habilitado y "olvidé mi contraseña". En el alta: saludo con el nombre,
lote si hace falta y contraseña con medidor de largo. Los links inválidos
tienen su propio estado con ícono y qué hacer.

### Vecino

- **Invitaciones** (`/`): banda con barrio, lote y avatar; saludo display;
  contador de vigentes; lista de `Fila` con `EstadoTag` (adentro con hora,
  esperando, frecuente con vigencia). Botón "Nueva invitación" fijo sobre la
  barra inferior.
- **Detalle** (`/invitaciones/[id]`): el `Pase` entra con una transición de
  elemento compartido desde la fila. Acciones: compartir (Web Share), copiar
  link, editar y anular (con confirmación). Si está anulada, "volver a
  habilitar".
- **Nueva / editar**: en una sola columna y en dos bloques. El primero lleva
  tipo (chips), nombre, fecha o rango y días. El segundo, "Para entrar más
  rápido", lleva documento y patente. Validación al salir de cada campo.
  Al crear, transición al `Pase` con "Compartir" como acción principal.
  "Volver a invitar" desde el historial precarga el formulario.
- **Historial**: buscador fijo arriba; los filtros (tipo, estado, solo las
  mías) en un sheet en mobile y en línea en escritorio, con contador de
  filtros activos. Scroll infinito con "cargar más" en lugar de paginado.
- **Perfil**: tema (sistema, claro, oscuro), mis unidades, cerrar sesión. El
  selector de tema sale del encabezado.

### Invitado (`/i/[token]`)

El `Pase` a pantalla, con la marca del barrio, quién invita, la unidad y
"Cómo llegar". Debajo, el formulario corto de documento y patente si falta
algo. Anulada o vencida: el pase se ve atenuado con un sello. Se mantiene el
aviso de subir el brillo de la pantalla: la web no puede subirlo sola.

### Garita

- **Hoy** (`/garita`): título con el día; buscador con resultados en vivo
  (debounce, sin botón); agenda en tabs "Esperando · Adentro · Frecuentes"
  con contadores; navegación de días (anterior, hoy, siguiente, calendario)
  relativa a la fecha **elegida**.
- **Mobile**: escáner como botón central de la barra inferior.
- **Escritorio y tablet** (≥ 768px): agenda a la izquierda; escanear, buscar
  y "últimos movimientos" a la derecha. Atajos: `E` escanea, `/` busca, `Esc`
  vuelve.
- **Escáner**: visor oscuro a pantalla completa con la mira animada y un
  estado claro (abriendo, leyendo, validando, error con reintentar).
- **Veredicto** (`/garita/invitacion/[id]`): pantalla completa con la
  palabra, el ícono y el campo por luminancia, igual que hoy, rediseñado con
  la tipografía nueva. Entrada con un "sello" de `motion`. Ingreso con
  documento y patente; egreso directo. Confirmación con deshacer y vuelta
  sola al escáner (8 s).
- **Auditoría**: la misma que el admin.

### Admin

- **Layout**: barra lateral oscura fija con marca, secciones y contadores
  (vecinos, guardias); usuario abajo. En mobile, menú en un drawer.
  **Ctrl K**: buscar vecinos, guardias e invitados y saltar a las secciones.
- **Tablero**: fila de `Kpi` (ingresos hoy con variación contra el mismo día
  de la semana pasada, adentro ahora, invitaciones vigentes) y un bloque de
  **Atención** (unidades sin vecinos, gente sin salida hace más de 12 horas,
  vecinos invitados que nunca entraron). Gráficos de ingresos por día y por
  hora con el color del barrio y tooltip, invitaciones por vecino y actividad
  por guardia.
- **Vecinos**: tabla con búsqueda, filtro por estado y lote; menú ⋯ por fila
  (reenviar alta, cambiar lote, dar de baja, reactivar). El alta se hace en
  un sheet lateral. Mobile: filas apiladas.
- **Guardias**: misma estructura. El alta pide nombre, usuario y contraseña
  en un sheet; cambiar la contraseña es otro sheet con el aviso de que lo
  desloguea.
- **Unidades**: grilla con cantidad de vecinos por unidad y alta rápida.
- **Auditoría**: rango de fechas con atajos (hoy, 7 días, 30 días), estados
  como tabs con contador, tabla densa con fila desplegable de movimientos,
  exportar a Excel.

## Personalización del barrio (`/admin/barrio`)

Es la pantalla con la que el admin le da identidad a su instalación. Todo lo
que se cambia acá se ve **al instante, sin recargar**, en toda la app.

- **Nombre del barrio** (editable; la API ya lo acepta).
- **Color**: la paleta de ocho, con vista previa en vivo.
- **Logo**: zona de arrastrar y soltar, vista previa, reemplazar y quitar.
  PNG o JPG de hasta 500 KB.
- **Dirección y link de mapas**, con "probar link".
- **Vista previa**: a la derecha (debajo en mobile), una maqueta de la banda
  del vecino y del pase del invitado que refleja los cambios mientras se
  editan, antes de guardar.

Cómo se propaga:

- Al guardar, se reescribe `--marca-base` en `document.documentElement` y se
  invalida la query `['marca']`. Encabezados, pases, gráficos y botones toman
  el color nuevo sin recargar.
- El logo se pide con su versión (`/branding/logo?v=<logoVersion>`), así el
  caché de una hora nunca muestra el anterior.
- La marca alcanza a: encabezados de las tres secciones, pantallas de
  autenticación, el pase del vecino y del invitado, el `theme-color` del
  navegador, el manifest y los íconos de la PWA, y el nombre de la pestaña.

## Movimiento, carga y feedback

- **Transiciones entre pantallas**: fundido y desplazamiento corto (200 ms)
  dentro de cada sección.
- **Elemento compartido**: fila → pase en el detalle de una invitación
  (`layoutId` de motion).
- **Listas**: entrada escalonada solo en la primera carga, no en cada
  refresco. Salida animada al anular o dar de baja.
- **Sheets, drawers y diálogos**: entrada y salida animadas, foco atrapado,
  scroll bloqueado y Escape para cerrar (Radix y vaul ya lo resuelven).
- **Skeletons** con la forma exacta de cada pantalla, con brillo animado. Se
  muestran solo en la primera carga. Al refrescar, los datos viejos quedan
  visibles y aparece un indicador fino.
- **Botones**: estado de carga con spinner y bloqueo mientras dura la acción.
  Ninguna acción queda sin feedback.
- **Toasts** (sonner) para el resultado de cada acción, con "deshacer" donde
  aplica (anular, dar de baja).
- **Pantalla de arranque** con la marca mientras se resuelve la sesión.
- **Micro-interacciones**: presión en botones y filas, check animado al
  copiar, contador que sube en los KPIs.
- `prefers-reduced-motion` desactiva todo lo que se desplaza; quedan solo
  los fundidos.

## PWA

- `app/manifest.ts` dinámico: `name` y `short_name` del barrio,
  `theme_color` con la marca, `display: standalone`, `start_url: /`.
- `app/icon.tsx` y `app/apple-icon.tsx` con `ImageResponse`: el logo del
  barrio si existe, si no la inicial sobre el color de marca.
- Sin service worker de caché: la app no promete funcionar offline.

## Cambios en la API

Chicos y con tests:

1. **Versión del logo**: columna `logo_updated_at` en `neighborhood` y
   `logoVersion` en `GET /branding`. La URL del logo lleva esa versión.
2. **KPIs del tablero**: `GET /reports/kpis` suma `insideNow`,
   `staleInside` (sin salida hace más de 12 horas), `entriesSameDayLastWeek`
   e `invitedNeverLoggedIn`.
3. **Nombre del Excel**: sale del nombre del barrio (hoy dice
   `alamo-alto-auditoria.xlsx`).

## Bugs actuales que el rediseño corrige, y la regla que evita repetirlos

| # | Bug hoy | Regla en el diseño nuevo |
|---|---|---|
| 1 | Una frecuente muestra "0 de 999 entraron" (999 es un valor centinela). | Para las frecuentes se muestra la cantidad de ingresos, nunca un cupo. Un helper único (`cupoTexto`) decide el texto. |
| 2 | Cambiar el color o el logo pide recargar la página. | La marca se propaga en vivo (ver Personalización). |
| 3 | El logo del encabezado usa `/api/branding/logo` fijo: en desarrollo no carga. | Toda URL de la API sale de `apiBase`. Solo `Marca` arma la URL del logo. |
| 4 | Reemplazar el logo sigue mostrando el anterior hasta una hora (versión fija en la query). | La URL lleva `logoVersion`. |
| 5 | Colores fijos que ignoran la marca: checkbox del historial, barras del tablero, `theme-color`. | Ningún color de marca escrito a mano: solo tokens. Un chequeo de `npm run check` busca hex de marca fuera de `globals.css`. |
| 6 | Login, alta y páginas de error muestran "VisitPass" en vez del barrio. | Las pantallas de autenticación usan `Marca`. |
| 7 | En la agenda, "‹ Ayer" y "Mañana ›" se calculan desde hoy y no desde la fecha elegida: no se puede retroceder dos días. | La navegación de días es relativa a la fecha elegida. |
| 8 | Alguien que entró ayer y sigue adentro aparece en "Esperando" con la etiqueta "Adentro". | Las tabs de la agenda se calculan con `adentro` primero, la misma regla de la etiqueta. |
| 9 | Buscar en la garita exige Enter, y si abrir un resultado falla no pasa nada. | Búsqueda en vivo. Toda acción fallida muestra un toast. |
| 10 | Reenviar, reactivar, cambiar contraseña y cambiar lote no muestran carga ni error. | Toda mutación usa `useMutation` con estado de carga y toast de error. |
| 11 | Las listas muestran "no hay nada" cuando la API falla. | `ErrorConReintento` para `isError`, `Vacio` solo para éxito sin datos. |
| 12 | Cualquier error de `/auth/me` (también uno de red) manda al login. | Solo el 401 desloguea. |
| 13 | El detalle, la edición y el veredicto son estado: el "atrás" sale de la sección y recargar los pierde. | Son rutas. |
| 14 | La auditoría puede pintar una respuesta vieja encima de una nueva. | TanStack Query cancela la consulta anterior. |
| 15 | El alta de un guardia son dos requests: si falla la contraseña, queda creado sin clave. | La mutación revierte (da de baja al recién creado) si falla el segundo paso, y lo informa. |
| 16 | "Cambiar lote" con el campo vacío manda 0 y la API responde 400 sin aviso. | Validación del formulario antes de enviar. |
| 17 | El modal de confirmación no atrapa el foco ni bloquea el scroll. | Dialog y Drawer de Radix/vaul. |
| 18 | El selector de tema ocupa el encabezado en todas las pantallas. | Pasa a Perfil (vecino), al menú de usuario (garita y admin) y queda flotante solo en autenticación y en el pase del invitado. |

## Pruebas

- **Playwright** (nuevo, en `web/e2e/`) contra el stack de docker compose.
  Recorridos mínimos:
  - el vecino crea una invitación, la comparte y la anula;
  - el guardia encuentra al invitado, registra el ingreso, lo deshace y
    registra el egreso;
  - el admin da de alta un vecino, cambia el color y lo ve aplicado sin
    recargar;
  - el invitado abre su pase y carga el documento;
  - un vecino que entra a `/admin` termina en su home.
- `npm run check` se amplía: navegación (ya existe) y búsqueda de colores de
  marca escritos a mano.
- API: los tests de los tres cambios en Vitest, como el resto.
- Revisión visual con capturas en 390, 768 y 1280 px, en claro y oscuro,
  antes de cerrar cada fase.

## Fases

Cada fase termina con la app funcionando, los tests verdes y un despliegue.

1. **Base**: tokens, tipografías, primitivas de shadcn, componentes de
   dominio, `SesionProvider`, TanStack Query, layouts por grupo con
   loading, error y not-found, PWA, cambios de API 1 y 3. Las pantallas
   viejas siguen funcionando dentro de los layouts nuevos.
2. **Vecino, invitado y autenticación**: todas sus pantallas, con el pase y
   las transiciones.
3. **Garita**: hoy, escáner, veredicto como ruta, layout ancho y atajos.
4. **Admin y auditoría**: barra lateral, Ctrl K, tablero con los KPIs nuevos
   (API 2), padrón con sheets, personalización con vista previa en vivo.
5. **Limpieza**: borrar lo viejo que quede, redirecciones, e2e completos,
   revisión de accesibilidad y capturas finales.
