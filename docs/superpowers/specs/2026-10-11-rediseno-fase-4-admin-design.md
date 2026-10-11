# Rediseño · Fase 4: Admin y auditoría — Design

Fecha: 2026-10-11 · Estado: aprobado

## Objetivo

Rehacer con el diseño nuevo (fases 1 a 3 ya en `main`) todo lo que usa el
administrador: tablero, vecinos, guardias, unidades, personalización del
barrio, y la auditoría compartida con la garita. Reemplaza el `Shell` viejo
por un *chrome* propio de la sección, igual que hicieron las fases 2 y 3.

Punto de partida distinto a las fases anteriores: entre el cierre de la fase
3 y el arranque de esta, se construyó funcionalidad real sobre el admin
**viejo** — importación masiva de vecinos por CSV, búsqueda, asignación de
lote al invitar, mails con la marca del barrio, confirmación de contraseña
en alta y reset. Esta fase re-viste esa funcionalidad con el sistema de
diseño nuevo; no le cambia el comportamiento. Se revisó el código de todo
eso antes de diseñar y se corrigieron dos problemas chicos que encontró esa
revisión (ya en `main`, fuera de esta fase): una condición de carrera en
`findOrCreateLot` y un hueco donde una importación CSV interrumpida a mitad
de camino no mostraba las filas que sí se habían cargado.

## Arquitectura

```
app/(admin)/
  layout.tsx           SeccionProtegida + ChromeAdmin
  admin/page.tsx        Tablero
  admin/vecinos/         antes admin/usuarios
  admin/guardias/
  admin/unidades/
  admin/barrio/
app/(garita)/
  auditoria/page.tsx    se rediseña en el lugar, sin cambiar de ruta
```

- **`ChromeAdmin`** (`components/admin/chrome.tsx`), mismo patrón que
  `ChromeVecino`: banda con `Marca variante="banda"` + navegación, montado
  **una vez en el layout** (a diferencia de `ChromeGarita`, que lo monta
  solo la pantalla "Hoy" porque el veredicto necesita pantalla completa —
  acá no hay ninguna pantalla así).
- **Navegación**: seis destinos — Tablero, Vecinos, Guardias, Unidades,
  Barrio, Auditoría.
  - **Escritorio**: los seis como pills en la banda, igual que
    `ChromeVecino`/`ChromeGarita`. Hay lugar de sobra.
  - **Mobile**: `BarraSeccion` no tiene manejo de superflujo (`items.map`
    liso) y seis íconos en 390px quedan apretados. La barra inferior lleva
    los cuatro que se usan seguido — Tablero, Vecinos, Guardias,
    Auditoría — y un quinto botón "Más" abre un `Sheet` chico con Unidades
    y Barrio, que son tareas de configuración, no de todos los días.
- **Redirect permanente**: `/admin/usuarios` → `/admin/vecinos` en
  `next.config.ts`, mismo mecanismo que ya usa `/nueva`.
- **Auditoría** no se mueve de `/auditoria`: se rediseña en el lugar. La
  `ChromeGarita` de la fase 3 ya enlaza ahí; `ChromeAdmin` suma el mismo
  enlace.
- **Datos**: `lib/queries/admin.ts` nuevo — hooks de lectura y mutaciones
  (altas, reenviar, reactivar, deshabilitar, cambiar lote, cambiar
  contraseña, crear unidad, KPIs, barrio), con el mismo patrón que
  `queries/garita.ts` y `queries/invitaciones.ts`: mutaciones con
  `onError` → toast y `onSettled` → invalidar.

## Componentes nuevos o que cambian de fondo

| Componente | Reemplaza | Qué hace |
|---|---|---|
| `ChromeAdmin` | el `Shell` viejo, para esta sección | Banda, navegación (pills en escritorio, barra + "Más" en mobile). |
| `SheetAlta` (genérico) | los formularios inline de alta | Un `Sheet` (vaul) con un formulario adentro; lo usan vecinos y guardias para su alta, y guardias para cambiar contraseña. Un solo componente parametrizado por el formulario que recibe como children, no tres. |
| `MenuFila` | los botones sueltos por fila | `DropdownMenu` de Radix (ya es dependencia vía `radix-ui`, no se instala nada nuevo) para las acciones de cada vecino/guardia. |
| `BarChart` | el actual (el archivo ya dice "la fase 4 reemplaza este gráfico") | Mismo gráfico de barras de una serie, re-vestido con los tokens nuevos. |
| `VistaPreviaMarca` | nuevo | Maqueta chica (banda del vecino + `Pase`) que refleja el color/logo que se está editando en Barrio, antes de guardar. Estado local, no toca `useMarca()`. |

`Kpi` (`components/dominio/kpi.tsx`) ya existe desde la fase 1 con
`variacion` y `tono="atencion"` — se usa tal cual, sin cambios.

## Pantallas

### Tablero (`/admin`)

- Fila de `Kpi`: "Ingresos hoy" (con `variacion` contra
  `entriesSameDayLastWeek`), "Adentro ahora" (`insideNow`, nuevo),
  "Invitaciones vigentes" (ya existe).
- Bloque **Atención**: solo los `Kpi` con `tono="atencion"` que tengan algo
  que decir — unidades sin vecinos (ya existe), gente sin salida hace más
  de 12 horas (`staleInside`, nuevo), invitados que nunca entraron
  (`invitedNeverLoggedIn`, nuevo). Ninguno se muestra en 0.
- Gráficos (`BarChart` nuevo): ingresos por día (30) y por hora, color de
  marca, tooltip.
- Invitaciones por vecino y actividad por guardia: listas con `Fila`.

### Vecinos (`/admin/vecinos`)

- Buscador en vivo (ya existe, se mantiene) + tabla en escritorio /
  `Fila` apiladas en mobile.
- "Dar de alta" abre `SheetAlta` con nombre, mail y lote opcional. Mismo
  comportamiento de hoy (si el mail falla, queda la persona cargada y se
  reenvía desde la lista).
- `MenuFila` por vecino: reenviar invitación, cambiar lote (abre un sheet
  chico con el campo de lote), dar de baja / reactivar.
- Importar desde CSV: se mantiene (diálogo, preview, confirmación por
  tandas, resultados en vivo tras el fix de esta semana), re-vestido con
  los componentes nuevos (`Dialog` ya es de shadcn, no cambia).

### Guardias (`/admin/guardias`)

Misma estructura: alta en `SheetAlta` (nombre, usuario/mail, contraseña);
`MenuFila` con cambiar contraseña (abre un sheet con el aviso de que
desloguéa si está en la barrera) y dar de baja / reactivar.

### Unidades (`/admin/unidades`)

Grilla de tarjetas, una por unidad, con la cantidad de vecinos — se deriva
en el cliente contando, para cada unidad, cuántos vecinos de la lista ya
cargada (`/admin/people`) la tienen entre las suyas. **Sin cambio de API.**
Alta rápida se queda como formulario inline (no sheet): es la única
pantalla donde "rápida" significa no abrir nada aparte.

### Barrio (`/admin/barrio`)

- Formulario re-vestido: nombre, dirección, link de mapas, paleta de ocho
  colores con swatches.
- Logo: zona de arrastrar y soltar (reemplaza el `<input type=file>` liso
  de hoy), con vista previa, reemplazar y quitar.
- `VistaPreviaMarca` al costado (debajo en mobile): maqueta de la banda del
  vecino y del `Pase` del invitado reflejando los cambios mientras se
  editan. Al guardar, sigue invalidando `['marca']` como hoy — eso ya
  propaga el cambio a toda la app sin recargar.

### Auditoría (`/auditoria`)

Se rehace en el mismo lugar, sin moverse de ruta ni de rol (`guard` y
`admin`, como hoy):
- Atajos de rango (hoy, 7 días, 30 días) nuevos, además del rango manual
  que ya existe.
- Tabs de estado con contador (ya existen, se re-visten).
- Tabla densa con fila desplegable para los movimientos (se queda como
  `<table>` real, no `Fila`: es la pantalla donde la densidad importa más
  que en cualquier otra).
- Exportar a Excel: el link que ya existe, sin cambios.

## Cambios en la API

Uno solo, chico y con tests: `GET /reports/kpis` suma cuatro campos:
- `insideNow`: cantidad de `entry` sin `exitedAt`.
- `staleInside`: de esos, cuántos tienen `enteredAt` hace más de 12 horas.
- `entriesSameDayLastWeek`: ingresos del mismo día de la semana, hace una
  semana (para la variación de "Ingresos hoy").
- `invitedNeverLoggedIn`: personas en estado `invited` cuya invitación de
  alta ya venció (más de 7 días) y nunca entraron.

## Fuera de alcance, a propósito

- Barra lateral y Ctrl K (se evaluó y se descartó por esta vez: la banda +
  barra inferior ya está probada en dos fases y alcanza para seis
  destinos con el recorte de "Más").
- Separar auditoría en `/garita/auditoria` y `/admin/auditoria`: se queda
  como una sola ruta compartida.
- Cambios de comportamiento en lo que ya se construyó (CSV, búsqueda, lote
  al invitar, mails con marca, confirmación de contraseña): solo se
  re-viste.

## Pruebas

- API: tests de los cuatro campos nuevos de `/reports/kpis`, con
  `entry_log` sembrado a propósito para cada caso (adentro ahora, sin
  salida hace más de 12 horas, mismo día la semana pasada, invitado
  vencido sin login).
- E2E (Playwright), nuevos en `web/e2e/`:
  - el admin da de alta un vecino desde el sheet y lo ve en la lista;
  - el admin cambia el color del barrio y lo ve aplicado sin recargar (en
    la vista previa y, al guardar, en el resto de la app);
  - `/admin/usuarios` redirige a `/admin/vecinos` conservando lo que haga
    falta.
- `npm run check`: sin cambios nuevos (la búsqueda de colores de marca
  escritos a mano ya corre desde la fase 1).
- Revisión visual en 390, 768 y 1280 px, claro y oscuro, antes de cerrar
  la fase — con atención especial al menú "Más" en mobile y a la tabla
  densa de auditoría en 390px.
