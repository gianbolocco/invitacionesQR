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

## Pendiente de decisión

Nada. Siguiente paso: revisión del dueño de la fase a; después, fase b (Pase, vecino e invitado).
