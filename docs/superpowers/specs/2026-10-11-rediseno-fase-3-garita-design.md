# Rediseño · Fase 3: Garita — Design

Fecha: 2026-10-11 · Estado: aprobado

## Objetivo

Rehacer con el diseño nuevo (fase 1 y 2 ya en `main`) todo lo que usa el
guardia: la pantalla "Hoy" (agenda del día, buscador, acceso al escáner), el
escáner de QR y el veredicto de ingreso/egreso. Reemplaza al `Shell` viejo por
un *chrome* propio de la sección, igual que hizo la fase 2 con el vecino.

Fuera de alcance, a propósito:
- **Atajos de teclado** (`E` escanea, `/` busca, `Esc` vuelve). Se agregan en
  una fase posterior.
- **Auditoría** (`/auditoria`). La spec original la asigna a la fase 4, junto
  con el admin. En esta fase sigue con el `Shell` viejo, igual que las
  pantallas de admin que todavía no se tocaron.
- **Cambios en la API.** Todo sale de endpoints que ya existen
  (`/gate/agenda`, `/gate/search`, `/gate/check/:token`, `/gate/invitation/:id`,
  `/gate/entries`, `/gate/exits`, `/gate/entries/:id/undo`).

## Arquitectura

Mismo patrón que la fase 2: un grupo de rutas `(garita)` con su propio chrome,
construido sobre `SeccionProtegida` (ya existe, sin cambios: roles
`['guard', 'admin']`).

El cambio estructural central: **el veredicto deja de ser estado en memoria y
pasa a ser una ruta**, `/garita/invitacion/[id]`. Hoy, escanear un QR o tocar
un resultado de "Buscar" hace `setResultado(r)` dentro del mismo componente;
con eso, el botón "atrás" del celular sale de toda la sección en vez de cerrar
solo el veredicto, y recargar la página lo pierde. Como ruta, los dos
problemas se resuelven solos y gratis, con el soporte de navegación que ya
trae Next.

```
app/(garita)/
  layout.tsx                        SeccionProtegida + ChromeGarita
  garita/page.tsx                   "Hoy": agenda + buscar + escanear/últimos movimientos
  garita/escanear/page.tsx          el lector (adaptado, misma librería)
  garita/invitacion/[id]/page.tsx   el veredicto, antes "Verdict" en memoria
```

`auditoria/page.tsx` no se mueve de lugar ni de contenido.

## Componentes

| Componente | Reemplaza | Qué hace |
|---|---|---|
| `ChromeGarita` | el `Shell` viejo, para esta sección | Banda del barrio, nombre de quien está de turno, navegación (banda en escritorio, barra inferior en mobile con el escáner como botón central vía el slot `central` de `BarraSeccion`, ya construido en la fase 2). |
| `AgendaDia` | `components/agenda.tsx` | Misma lógica (Esperando / Ya entraron / Frecuentes colapsados, `adentro` antes que `enteredCount`), con `Fila` + `EstadoTag` de dominio y `CampoFecha` para "otra fecha". |
| `BuscarInvitado` | el buscador inline de `garita/page.tsx` | Búsqueda en vivo con `useDemora` (ya existe, de la fase 2), sin botón de submit. Resultados con `Fila` + `EstadoTag`. |
| `UltimosMovimientos` | nuevo | Se arma en el cliente a partir de `/gate/agenda`: por cada fila con `lastEntryAt` o `lastExitAt` hoy, un evento; se ordenan todos por hora descendente y se muestran los primeros 5. Sin endpoint nuevo. Solo en la columna derecha de escritorio. |
| `Veredicto` | `components/verdict.tsx` | Misma lógica de negocio: tres canales (palabra, ícono, luminancia del campo), nunca el color solo; ingreso pide documento/patente, egreso es directo; confirmación con "Deshacer" y vuelta sola al escáner a los 8 s. Vive en la ruta nueva; `onSalir` pasa a ser `router.push('/garita')` o `router.back()`. El "sello" de entrada usa `motion` en vez de la clase CSS `.sello`. |

## Pantalla "Hoy"

- **Mobile:** título con el día (`EncabezadoPagina`), buscador, agenda. El
  botón de escanear vive en el centro de la barra inferior, no en el cuerpo.
- **Escritorio y tablet (≥768px):** agenda a la izquierda. A la derecha, en
  este orden: un botón grande "Escanear QR" que navega a pantalla completa
  (mismo componente que en mobile — un solo lector para los dos tamaños, sin
  manejar el ciclo de vida de la cámara en dos layouts), el buscador, y
  "Últimos movimientos".
- La navegación de día (`‹ Ayer`, `Hoy`, `Mañana ›`, calendario) ya quedó
  corregida en la fase 1 para moverse relativa a la fecha elegida; se
  mantiene tal cual.

## Escanear

El lector actual (`html5-qrcode`, `Html5Qrcode` imperativo sobre un
`<div id="reader">`) ya fue rediseñado recientemente (commit
`7e3206c feat: redisenar lector QR de la garita`) y encaja con el estilo
"Editorial cálido": visor oscuro, mira animada, estados claros (abriendo,
listo, sin cámara, validando, error con reintentar). Se mantiene casi sin
cambios. Lo único que cambia es el destino al validar: en vez de
`setResultado(r)`, `router.push(`/garita/invitacion/${r.invitation.id}`)` (o
guardar el resultado en una query de TanStack con esa clave y navegar, para
no pedirlo dos veces — se decide en el plan).

## Bugs que esto corrige

Del listado de la spec general:
- **#13** (detalle como estado en memoria, no ruta): se aplica acá al
  veredicto, el último lugar de la app donde faltaba.
- Dedo en el aire: hoy, salir del veredicto con el botón "atrás" del celular
  saca de toda la sección `/garita` en vez de solo cerrar el veredicto. Deja
  de pasar al ser una ruta propia.

## Pruebas

- E2E (Playwright) para el flujo de "Buscar → abrir veredicto → registrar
  ingreso → deshacer" y "la fecha de la agenda se mueve relativa al día
  elegido, no a hoy", contra el stack de docker compose, con la cuenta
  `e2e.guardia@visitpass.test` ya sembrada.
- Revisión visual en 390, 768 y 1280 px, claro y oscuro, antes de cerrar la
  fase — el breakpoint de 768 es el que usa esta sección (no el 640 que usa
  el chrome del vecino), porque el layout de dos columnas necesita más
  ancho para no apretarse.
