# Progreso del rediseño Pazzit

Se actualiza al cerrar cada fase de `PLAN-REDISENO.md`: lo hecho, commits, pendiente, decisiones y
desvíos del plan con su motivo.

| Fase | Estado |
|---|---|
| 1–4. Entender, inventario, auditoría y plan (Opus) | hecha y aprobada |
| a. Fundaciones | pendiente |
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

## Pendiente de decisión

Nada. Siguiente paso: fase a (Fundaciones).
