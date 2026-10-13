# VisitPass

Invitaciones con QR y control de acceso para barrios cerrados. El qué y el porqué
están en el [README](README.md): leerlo antes de tocar algo que no sea trivial.

## Verificar un cambio

```bash
cd api && npm test                  # vitest contra la base invitaciones_test (se crea sola)
cd api && npx tsc --noEmit
cd web && npm run check && npm run lint && npx tsc --noEmit
cd web && npm run e2e               # Playwright; necesita el stack levantado (docker compose up -d --build)
```

No hay tests de componentes en el front: la lógica pura va en `web/src/lib/*.ts`
con su `*.check.ts` al lado, que corre `npm run check`.

## Reglas que el código no grita

- **Un despliegue es un barrio.** Hay una sola fila en `neighborhood`. No agregar
  filtros ni pantallas multi-barrio.
- **Hora de Buenos Aires**, siempre: `api/src/lib/dates.ts` y `web/src/lib/fechas.ts`.
  Nunca `new Date()` para calcular un día.
- **`canEnter()` en `api/src/authz.ts`** es puro y el orden de los rechazos está
  testeado. El `FOR UPDATE` de `services/entries.ts` serializa el cupo: no sacarlo.
- **Tokens y sesiones se guardan como SHA-256.** El valor en claro existe solo al
  emitirlo: no se puede volver a leer de la base.
- **Errores**: `throw new AppError(status, 'codigo_en_snake')`; el front los
  traduce a texto en la mutación que los dispara.
- **Rate limit** en memoria (`middleware/rateLimit.ts`); en los tests,
  `resetRateLimits()` en el `beforeEach`.
- **Colores**: solo tokens de `web/src/app/globals.css`. El color del barrio entra
  por `--marca-base`; la paleta cerrada vive en `api/src/lib/marca.ts`.
- **Next.js 16**: ver `web/AGENTS.md` antes de usar una API de Next.

## Estilo

- Código, nombres y comentarios en español (salvo el esquema de la base y las rutas).
- Textos de la UI en voseo rioplatense ("Probá de nuevo", "Esperá").
- Comentarios que explican el porqué, no el qué. Los atajos deliberados llevan
  `ponytail:` con su techo.
- Commits: `feat:` / `fix:` / `style:` + descripción en español, en minúscula.

## Tamaño del proceso

- Cambio chico (texto, estilo, bug acotado): directo, sin spec ni plan.
- Feature mediana: modo plan, plan corto.
- Feature con decisiones de diseño: spec + plan en `docs/superpowers/`, planes de
  menos de 300 líneas.
