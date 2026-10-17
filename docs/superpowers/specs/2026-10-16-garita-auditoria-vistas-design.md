# Garita y auditoría: vistas, tablero y búsqueda

## Qué se resuelve

La agenda de la garita escondía a los frecuentes y no mostraba, en "Todos", a
quien sigue adentro desde otro día. La auditoría era una tabla de 920 px sin
búsqueda ni filtro por tipo, inusable en el celular, y había perdido el detalle
de movimientos por fila. El guardia, además, tenía una sola forma de mirar el
día.

## Garita

**Selector de vista**, recordada en el navegador (`localStorage`, con try/catch):

| Vista | Dónde | Para qué |
|---|---|---|
| Tablero | escritorio ≥1280 px | tres columnas: Por llegar · Adentro · Se fueron (+ Vencidas si hay). Solo lectura: abrir una tarjeta lleva al veredicto. No se arrastra: ingresar y egresar pasa por el veredicto. |
| Lista | todos | las secciones de siempre, con frecuentes y proveedores a la vista |
| Compacta | escritorio ≥768 px | tabla densa: invitado, tipo, unidad, patente, estado, hora |
| Por unidad | todos | agrupada por lote: "¿quién espera en el 142?" |

- **Frecuentes visibles**, con tag "Frecuente" (y "Proveedor"). La visita común no lleva tag: sería ruido.
- **Filtro por tipo** (Todos · Visitas · Frecuentes · Proveedores) y por estado, en todas las vistas.
- **Adentro** sale de `/gate/adentro` (cualquier día), no de la agenda. Una persona que entró ayer figura adentro hoy.
- Una persona nunca está en dos columnas: si está adentro, no está en "Por llegar" ni en "Se fueron".
- El marco de la garita pasa a `max-w-7xl`.
- La lógica que arma las columnas es pura: `web/src/lib/tablero.ts` + `tablero.check.ts`.

## Auditoría

- **Buscador** (nombre, documento por dígitos, patente, unidad, quién invita) y **filtro por tipo**, del lado del servidor: `q` y `kind` en `/gate/audit` y `/gate/audit.xlsx`. Los contadores respetan la búsqueda. "Exportar a Excel" lleva los mismos filtros.
- **Vistas**: Tabla (escritorio) y Tarjetas (mobile; en escritorio también elegible). En mobile se usa Tarjetas siempre.
- **Detalle de movimientos** por fila, de `/gate/audit/:id/entries`: se recupera, con "×3" desplegable.
- Franja de resumen con los contadores por estado, que además filtran.
- Rango: atajos Hoy · 7 días · 30 días y fechas a mano; el atajo activo se marca.

## Sistema visual (`globals.css`)

Se mantiene "Editorial cálido" y los colores solo por tokens. Se agrega lo que
el navegador dibuja por su cuenta: selección de texto y cursor en la marca,
scrollbars finas, `text-wrap: balance` en títulos, `:active` con escala sutil
en botones y filas (solo con puntero fino para el hover), curvas de easing
con nombre y una escala de elevación para tarjetas del tablero.

## Fuera de alcance

Arrastrar tarjetas, nuevos tipos de invitación, notificaciones al vecino.

## Verificación

`api`: `npm test`, `npx tsc --noEmit`. `web`: `npm run check`, `npm run lint`,
`npx tsc --noEmit`, e2e de la garita actualizado (los textos "Ya entraron" y
"Pendientes" cambian a "Se fueron" y "Por llegar").
