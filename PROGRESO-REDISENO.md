# Progreso del rediseño Pazzit

Se actualiza al cerrar cada fase de `PLAN-REDISENO.md`: lo hecho, commits, pendiente, decisiones y
desvíos del plan con su motivo.

| Fase | Estado |
|---|---|
| 1–4. Entender, inventario, auditoría y plan (Opus) | hecha y aprobada |
| a. Fundaciones | hecha, a revisar |
| b. Pase, vecino e invitado | pendiente |
| c. Garita | pendiente |
| d. Admin y auditoría | pendiente |
| e. Estados, errores y acceso | pendiente |
| f. Pulido de movimiento | pendiente |
| 6. Verificación (Opus) | pendiente |

## Fases 1–4 (2026-10-17)

- Stack levantado con `docker compose up -d --build` (Docker Desktop tiene que estar corriendo). La base de
  desarrollo ya tenía el barrio "Los Aromos" y datos de e2e anteriores.
- Cuentas de prueba: el SQL de `web/e2e/preparar.ts` (lo corre `npm run e2e` en su `globalSetup`).
- Capturas del "antes": `node docs/rediseno/capturas.cjs docs/rediseno/antes` → 156 capturas (39 pantallas y
  estados × claro/oscuro × 390/1280) + 3 de viewport hechas aparte (`30b-…`, `11b-…`). El script crea sus
  propios datos (invitación vigente, anulada, con alguien adentro y frecuente) en cada corrida.
  `_log.json` registra errores de consola y desborde horizontal: ninguno fuera de los 400/401/404 esperados.
- Decisiones del dueño: marca "Pazzit manda"; vecino e invitado celular primero, garita y admin escritorio primero.
- Hallazgo fuera de la app: pazzit.com no respondía (HTTP "no available server", HTTPS con certificado inválido).
- Desvío de proceso: `CLAUDE.md` pide planes de menos de 300 líneas; este supera ese largo porque el pedido
  exige que sea autosuficiente para otro modelo (tokens, componentes, copy y fases completos).
- Decisiones del §8 resueltas por el dueño: pase vertical en el link del invitado; veredicto "Ingreso / No pasa /
  Egreso" en sentence case; campo `entered` en la API pública dentro del rediseño (la respuesta ya contaba los
  ingresos para `frozen`, así que no suma consultas); capturas fuera de git (`.gitignore`).
- Rama `rediseno-pazzit` creada desde `dev` con el plan, este registro, el prototipo y el script de capturas.

## Fase a. Fundaciones (2026-10-17)

Commits: `45ceaf9` tokens, Onest y logo · `fd7e6ae` componentes base · `512db2a` headers · `73fe2bf` reemplazo
mecánico en pantallas.

Hecho:
- `globals.css`: tokens §1.1 (claro y oscuro escritos dos veces), escala `t-*`, radios 8/14/24 (se fue
  `--radius-xl`), `--sombra-pase` y `--sombra-flotante` (se fueron las `shadow-*` propias y `.tarjeta-viva`),
  curvas `--ease-out` / `--ease-in-out` / `--ease-hoja` (pisan las de Tailwind) y duraciones `--t-*`. Variante
  nueva `hover-fino:` (hover solo con puntero fino). `::selection` en sol con navy.
- Movimiento reducido §4.4: se sacó el bloque que ponía todo en 0,01ms. Ahora la escala al presionar,
  `entra-vista` y el brillo del skeleton van dentro de `no-preference`; con `reduce`, las entradas de
  tw-animate-css pierden traslado y escala y duran 150ms. Los `animate-spin` siguen girando.
- `layout.tsx`: Onest (400/600/700/800), se van Geist y Bricolage; `viewport` estático con `#F3F6FF` /
  `#0A1030`. `manifest.ts` con fondo `#F3F6FF`. `AplicarMarca` ya no pisa `theme-color`.
  `MARCA_DEFAULT.nombre = 'Pazzit'`.
- `web/public/brand/` (los 12 SVG de la landing) y `LogoPazzit` (`lockup` claro/oscuro por CSS, `mark` azul).
- Componentes §1.4: Button (variantes y tamaños nuevos; `outline` alias de `secondary`; se borraron `xs`,
  `icon-xs`, `icon-sm`), Input/Select/CampoFecha/CampoHora (h-12, borde 2px `control`), Campo (error con
  ícono), Chips (radio 8, activa en `ink`), EstadoTag (mapa nuevo, prop `contexto="garita"` → "Por llegar"),
  TagTipo/TagManual, Fila (`densa` para garita y admin), Nota (tono nuevo `atencion`), Vacío,
  ErrorConReintento ("Probar de nuevo"), Skeleton, KPI (sin `amber`/`emerald` ni ▲▼), BarChart, Hoja
  (`side="auto"`: abajo en el celular, a la derecha 480px desde 640), Diálogo, Toasts, SelectorTema (44×44),
  Marca (sin variante `banda`), SelectorVista (radio 8).
- Headers de vecino, garita y admin en `bg-card` con mark + barrio (+ rol en garita/admin) y pestañas; botones
  de 44px. Se fue el "Lote 900" del header del vecino.
- Reemplazo mecánico en 37 archivos: `marca*` → `azul*`, `sobre-marca` → `white`, `peligro` → `alto`,
  `pass-*`/`deny-*` → tokens de estado, radios (`lg` → `md`, `xl` → `lg`), etiquetas de 10–11px en
  mayúsculas → 13px/600 sentence case. Grep de tokens viejos: cero.
- `colores.check.mjs` ampliado con los tokens y tamaños prohibidos del §6.
- Copy tocada en esta fase: estados de cuenta "Activa" / "Sin activar" / "De baja" (también en
  `lib/admin.ts`, para que celular y escritorio digan lo mismo), "Probar de nuevo", "Cerrar" en hojas y
  diálogos, "Ese código no es un pase de Pazzit…" en el escáner.
- e2e tocados: `secciones.spec.ts` (el nombre por defecto ahora es Pazzit) y `vecinos-por-lote.spec.ts`
  (estados nuevos).

Verificación: `api npm test` 326 ok · `api tsc` ok · `web check`, `lint`, `tsc` ok · `docker compose up -d
--build` · `npm run e2e` 67 ok, 1 salteado (ya estaba así) · capturas en `docs/rediseno/despues/` (156):
sin desborde a 390 ni a 1280 en claro y oscuro; los mismos 28 errores de consola esperados que en el antes
(400/401/404 de los estados de error, `ERR_FAILED` de sin conexión, 404 de `/kit` en prod).
No hice el recorrido a mano en un navegador: las capturas y el e2e cubren esos flujos, pero conviene que lo
mires vos.

Desvíos y decisiones:
- **`destructive` en oscuro lleva texto navy**, no blanco: el `alto` oscuro es `#FF8A7A` y el blanco encima
  queda en ≈2,3:1. Es la misma regla que el plan da para "No pasa".
- **Token nuevo `--escaner-marco` (`#7D93FF`)** en lugar del `--escaner-acento` borrado: el visor es oscuro
  siempre y el `azul-text` del tema claro no contrasta sobre navy. Es el `azul-text` oscuro, fijo.
- **Pestañas del admin desde 1024px** (no 640): cinco pestañas + tema + cerrar sesión no entran en una tablet;
  hasta 1024 sigue la barra de abajo (`BarraSeccion hasta="lg"`). Garita y vecino siguen en 640.
- **Toasts**: abajo a la derecha solo en garita/auditoría/admin desde 1024px; en el resto, arriba al centro.
- El botón del escáner en la barra de la garita pasó de círculo a radio 14 (regla "sin `rounded-full`").
- Quedan a propósito para su fase: el pase (`pase.tsx`, con sus hex y el sello en mayúsculas → b), la palabra
  del veredicto en mayúsculas y en `ink` en vez de `verde` (→ c), las pastillas y colores sueltos del
  escáner (→ c), lockup y halo del login (el halo ya se fue porque usaba `--marca-suave`; el lockup → e),
  arranque y 404 (→ e), `/kit` (→ f). Los `uppercase` que quedan son de los inputs de patente (funcional) y
  del kit.

### Revisión del dueño de la fase a (2026-10-17)

Pedido: el azul de Pazzit contra el color y el logo del barrio hacía ruido. Default azul; cada color
propio con su modo claro y oscuro sin romper la identidad; sin logo, el mark de Pazzit en el color
elegido + nombre del barrio; con logo, solo el logo.

Hecho:
- `#2f5bff` (azul de Pazzit) entra primero en la paleta cerrada de `api/src/lib/marca.ts` y es el
  `COLOR_DEFAULT`: un barrio sin color guardado queda en azul. Los 8 colores anteriores siguen.
  **Desvío aprobado por el pedido:** toca `api/` (una constante; sin cambios de endpoints ni de modelo).
  Tests de `admin.test.ts` y `branding.test.ts` actualizados (9 colores, default azul).
- Con el azul, la paleta es la del §1.1 tal cual. Con otro color, el layout pone `data-marca="propia"` en
  el `<html>` (y `AplicarMarca` lo cambia en vivo al guardar) y `globals.css` deriva `surface`, `card`
  (oscuro), `surface-sunk`, `line`, `control`, `ink`, `ink-soft`, `azul`, `azul-text`, `azul-tint` y
  `focus` del color, en claro y en oscuro (oklch relativo: mismo tono, luminosidad fija; el tinte de los
  neutros se topa con un tercio del croma, así pizarra no sale celeste). Estados, sol, talón y escáner no
  cambian.
- `LogoPazzit variante="mark"` se dibuja como máscara sobre `bg-azul` (toma el color del barrio).
  `Marca conPazzit`: sin logo, mark + nombre; con logo, solo el logo (h-9). Lo usan los tres headers y la
  vista previa de `/admin/barrio`.
- Ayuda del logo: "Sin logo, mostramos el nombre del barrio." (copy del §5, adelantada de la fase d).

Verificación: `api npm test` 326 ok · web `check`, `lint`, `tsc` ok · `npm run e2e` 67 ok, 1 salteado.
Capturas puntuales con azul, verde, violeta y pizarra en claro y oscuro (admin, tablero, inicio del
vecino). El color del barrio de desarrollo quedó en azul (el que tenía al empezar).
No verificado a la vista: el header sin logo (la base de desarrollo tiene logo cargado y no lo borré).
La barra del navegador (`theme-color`) sigue con el fondo de Pazzit también con color propio.

### Segunda ronda de revisión de la fase a (2026-10-17)

Pedidos del dueño y lo hecho:
- **Oscuro cálido en todos los modos oscuros** (el de antes del rediseño): `surface #12110e`, `card #201e19`,
  `surface-sunk #1c1a16`, `line #34312b`, `control #8a8378`, `ink #f2eee6`, `ink-soft #a8a195`, iguales
  para el azul por defecto y para los colores propios. En oscuro solo el acento sigue al barrio;
  `azul-tint` pasa a `color-mix(azul 24%, card)`. El escáner y la barra del navegador en oscuro también
  van a `#12110e`.
- **"No pasa" en bordó** `#7a1420` con texto `#fff1f0`, igual en los dos temas (tokens `--no-pasa` y
  `--no-pasa-texto`); "Autorizar igual" invierte los dos. Reemplaza al `alto` del §3.3.
- **Header con el color del barrio** (en su variante de cada tema), texto, mark, pestañas, tema y botones
  en blanco; foco blanco en claro y sol en oscuro (`HEADER` en `barra-seccion.tsx`, `SelectorTema
  sobreColor`, `Marca sobreColor`). La barra del navegador en claro vuelve a llevar el color del barrio
  (`generateViewport` + `AplicarMarca`). La barra inferior del celular sigue en `card`.
- **Tablero de la garita con dos columnas**: "Por llegar" y "Adentro". "Se fueron" sale del tablero (sigue
  en la vista lista y en el filtro); `lib/tablero.ts` no cambia. Se borró la prop `apagada` de
  `TarjetaInvitado`, que solo usaba esa columna.

Verificación: web `check`, `lint`, `tsc` ok · e2e completo 67 ok, 1 salteado (antes del cambio del
tablero) y `garita.spec.ts` 29 ok después · capturas 156 sin desborde.

### Tercera ronda: una sola familia de color (2026-10-17)

Problemas que marcó la autoevaluación y el dueño eligió resolver así (opciones 1A + 2A):
- **Neutros cálidos fijos en los dos temas**: crema (`#F6F3EE`, `#ECE7DF`, `#E6E0D6`, ink `#14130F`,
  ink-soft `#6B645A`) en claro y el espresso que ya estaba en oscuro, iguales para todos los barrios.
  Sombras en `rgb(20 19 15)` en vez de navy. Manifest con fondo `#F6F3EE`.
- **Rellenos con el color real del barrio** en los dos temas (`--azul: var(--marca-base)`): el header
  bordó en oscuro es bordó, no rosado. Solo `azul-text` se aclara en oscuro; `azul-tint` es una mezcla
  del color con la tarjeta (12% claro, 26% oscuro).
- Con eso la paleta ya no depende de si el color es el azul de Pazzit: se borraron `data-marca`,
  `esMarcaPropia`, `COLOR_PAZZIT` y los bloques de neutros derivados por oklch.
- Plan actualizado (§0, §1.1, §1.2 sombras, §1.4 navegación, §3.3 "No pasa", §3.4 tablero) para que
  vuelva a ser la única referencia.

Verificación: web `check`, `lint`, `tsc` ok · capturas con azul, verde, bordó y pizarra en claro y
oscuro (admin barrio, tablero, inicio del vecino). Pizarra en oscuro es el caso más tenue: el botón se
distingue, pero con poco contraste contra la tarjeta.

### Cuarta ronda (2026-10-17)

- Inicio del vecino: el estado vacío ya no repite "Nueva invitación" (queda el del encabezado / flotante).
- Rama pusheada a `origin/rediseno-pazzit`.
- **Fondo del acceso** (login, olvidé, reset, acceso), pedido del dueño en contra del "diseño plano" del plan:
  `.fondo-acceso` en `globals.css`, tres manchas con degradados radiales en tonos del color del barrio (la
  tercera era del sol; se cambió a otro tono del barrio para respetar la regla del sol), sin `filter: blur`. En oscuro la mancha usa `azul-text` (el color tal cual, si es oscuro, no se
  ve sobre el espresso). Se mueven muy lento con `transform` (24 s y 30 s, ida y vuelta); con movimiento
  reducido, quietas. La tarjeta suma `--sombra-flotante` para despegarse del fondo.
- **Favicon e íconos**: `lib/icono-marca.tsx` dibuja el ícono de app de Pazzit (mark blanco sobre
  cuadrado redondeado) con el color del barrio. Lo usan la pestaña, la app instalada (manifest) y el
  ícono de iOS (este último sin redondear: iOS redondea solo). El logo del barrio ya no se usa como
  ícono.

## Pendiente de decisión

Nada. Siguiente paso: revisión del dueño de la fase a; después, fase b (Pase, vecino e invitado).
