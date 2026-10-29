# Rediseño · Fase 5: Limpieza — Design

Fecha: 2026-10-11 · Estado: aprobado

## Objetivo

Cerrar el rediseño sacando todo lo que las fases 1 a 4 dejaron sin uso: el
`Shell` viejo y sus primitivas, navegación y CSS que ya nadie referencia, y
primitivas de shadcn que se instalaron pero nunca se conectaron a nada. Suma
el escenario de egreso que faltaba en los e2e de garita y una pasada de
accesibilidad por teclado en los flujos críticos. Sin pantallas nuevas: es
la fase de higiene.

## Qué se borra

Verificado archivo por archivo con `grep` sobre todo `web/src`: ninguno de
estos tiene un importador vivo hoy.

| Archivo | Líneas | Por qué está muerto |
|---|---|---|
| `components/shell.tsx` | 257 | Reemplazado por `ChromeVecino`/`ChromeGarita`/`ChromeAdmin` en las fases 2 a 4. |
| `components/ui.tsx` | 260 | Primitivas del sistema de diseño viejo (`Button`, `Field`, `Filete`, `Eyebrow`, `ErrorNote`, `Tabla`, `Estado`...), todas con su equivalente nuevo en `components/dominio/` o `components/ui/`. |
| `components/feedback.tsx` | 142 | `Cargando`, `Aviso`, `useAviso`, `Confirmar`, `SkeletonFilas`/`SkeletonTarjetas` viejos — reemplazados por `components/dominio/skeleton-*` y los `Dialog` de shadcn. |
| `lib/nav.ts` | 71 | La tabla de navegación que usaba el `Shell` viejo. Su único importador era `shell.tsx`. |
| `lib/nav.check.ts` | 47 | El chequeo de `nav.ts`, sin sentido sin él. Se saca también su línea en `npm run check` (`package.json`). |
| `components/ui/command.tsx` | 184 | Se instaló para el Ctrl K que la fase 4 evaluó y descartó a favor de banda + barra. Nunca se importó. |
| `components/ui/drawer.tsx` | 134 | El `Drawer` de vaul. Todas las fases usaron `Sheet` (Radix) para esto — filtros del historial, "Más" del admin, altas. Nunca se importó. |
| `components/ui/textarea.tsx` | 17 | Ningún formulario del rediseño usa un campo multilínea. |
| `components/ui/tooltip.tsx` | 56 | El tooltip de `BarChart` es manual (CSS, no este componente). Nunca se importó. |

Con `command.tsx` y `drawer.tsx` fuera, `cmdk` y `vaul` dejan de usarse en
todo el proyecto — se sacan de `package.json` y se corre `npm install` para
actualizar el lockfile.

## CSS huérfano

En `web/src/app/globals.css`, las reglas que solo los archivos de arriba
usaban quedan sin ningún consumidor:

- `.filete` — solo `ui.tsx`.
- `.surgir`, `.escalonar` (+ sus `@keyframes surgir` y los `nth-child` de
  retraso) — solo `shell.tsx`/`feedback.tsx`; `.escalonar` ya no se usa en
  ningún lado, ni siquiera en esos.
- `.sello`, `@keyframes sello` — quedó solo en un comentario del veredicto
  de garita; la fase 3 ya usa `motion` para esa animación, como decía su
  spec.
- `.skeleton` (sin el sufijo `-brillo`) + `@keyframes latir` — solo
  `feedback.tsx`. El esqueleto nuevo (`components/ui/skeleton.tsx`) usa
  `.skeleton-brillo`, que se queda.
- `.con-barra-inferior`, `.con-accion` (+ su media query) — solo
  `shell.tsx`.

`.display`, `.eyebrow`, `.tabular`, `.titulo-display` y `.skeleton-brillo`
se quedan: los sigue usando código vivo (el visor de la garita, el veredicto,
`EncabezadoPagina`, `Kpi`, `Skeleton`).

## E2e: el egreso que faltaba

La spec madre pedía un recorrido de "el guardia encuentra al invitado,
registra el ingreso, lo deshace y registra el egreso" desde la fase 3, pero
nunca se escribió la parte del egreso — hoy `garita.spec.ts` prueba ingreso
y deshacer nada más. Se agrega un test nuevo: registrar un ingreso, volver
a "Hoy", buscar al mismo invitado de nuevo y confirmar que el veredicto
ahora ofrece "Registrar egreso" en vez de "Registrar ingreso", registrarlo,
y confirmar que la agenda lo mueve a "Ya entraron" dejándolo afuera.

## Accesibilidad

Pasada manual, sin herramienta de escaneo nueva, sobre los tres flujos con
más interacción:

- **Crear invitación**: el formulario se completa y se manda sin mouse;
  los errores de validación quedan anunciados (`role="alert"`, ya presente
  en `Campo`).
- **Escanear y veredicto**: el foco cae solo en el botón de acción al
  llegar el resultado (ya construido en la fase 3); Escape vuelve.
- **Altas del admin** (sheet de vecino/guardia, diálogos de lote/contraseña/baja):
  el foco queda atrapado adentro, Escape cierra, y vuelve a donde estaba al
  cerrar — comportamiento que ya dan Radix `Sheet`/`Dialog`, se verifica que
  de verdad pase en los tres.

Si algo falla en la pasada, se corrige en el mismo componente — no se abre
un hallazgo aparte para después.

## Verificación final

- `cd api && npx tsc --noEmit && npx vitest run`
- `cd web && npx tsc --noEmit && npx eslint . --max-warnings=0 && npm run check && npm run build`
- `npm run e2e` contra el stack de docker compose, con el escenario de
  egreso nuevo incluido.
- Capturas en 390, 768 y 1280 px, claro y oscuro, de una pantalla por
  sección (`/`, `/garita`, `/admin`, `/auditoria`) para confirmar que sacar
  el CSS compartido no rompió nada fuera de los archivos borrados.

## Fuera de alcance, a propósito

- No se tocan `lib/theme.ts`, `components/proveedores.tsx` ni
  `lib/icono-marca.tsx`: aunque suenan a infraestructura vieja, los sigue
  usando código vivo (`selector-tema.tsx`, el layout raíz, los íconos de
  la PWA).
- No se audita el backend: la limpieza de esta fase es la deuda que dejó
  el sistema de diseño viejo del frontend, no una revisión general de la
  API.
- Sin auditoría WCAG formal ni herramienta de escaneo automatizado — la
  pasada es manual y acotada a los tres flujos de arriba.
