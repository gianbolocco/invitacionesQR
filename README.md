# Invitaciones — Álamo Alto

Gestión de invitaciones y control de acceso para un barrio cerrado. Reemplaza
el "avisá a la guardia por WhatsApp": el vecino genera una invitación, el
invitado carga sus datos desde un link y se lleva un QR, y el guardia lo escanea
en la barrera.

## Cómo funciona

**El vecino** crea una invitación a nivel unidad (UF), no a nivel persona: los
que viven en la misma casa ven y gestionan las invitaciones de esa casa. Hay
tres tipos —visita, frecuente y proveedor— y son todos la misma tabla, con
distinta ventana de validez y distinto cupo.

**El invitado** recibe un link. Ahí ve quién lo invita, a qué unidad y cómo
llegar, carga su documento y su patente si quiere, y se queda con su QR.

**Un evento no es nada especial**: es una invitación por invitado. No hay tipo
"evento", ni cupo compartido, ni links de anotación. Cada persona tiene su
invitación, su QR y su fila en la lista del día, y eso es justamente lo que da
la trazabilidad de quién entró y quién no.

**El guardia** tiene su propia cuenta —cada ingreso queda a nombre de quien
estaba logueado, que es lo que hace auditable el "¿quién lo dejó pasar?"—, la
lista del día, el escáner y la auditoría exportable a Excel.

**El admin** da de alta vecinos y guardias, corrige lotes, edita los datos del
barrio y ve el tablero.

## Correr en desarrollo

```bash
docker compose up -d --build
# web  http://localhost:3000
# api  http://localhost:8080
```

La API corre las migraciones al arrancar. Para crear el primer admin:

```bash
docker compose exec api node dist/seed-admin.js
```

Sin `RESEND_API_KEY` los mails no se envían: **se imprimen en el log del
contenedor**. El alta de un vecino y el "olvidé mi contraseña" se prueban
enteros sin cuenta de mail, copiando el link de `docker compose logs api`.

### Sin Docker

```bash
cd api  && cp .env.example .env && npm ci && npx drizzle-kit migrate && npm run dev
cd web && npm ci && npm run dev
```

### Tests

```bash
cd api && npm test          # contra una base invitaciones_test aparte
cd web && npm run check     # el chequeo de navegación (no hay runner de tests en el front)
```

Los tests usan **otra base** (`invitaciones_test`), que se crea y migra sola.
No tocan la de desarrollo.

## Desplegar

Hace falta un VPS y un dominio apuntándole. **No es opcional tener HTTPS**: el
escáner usa `getUserMedia` y los navegadores solo dan acceso a la cámara en
`https://` o `localhost`. Sobre una IP de la red local por HTTP, el guardia no
va a poder escanear nunca.

```bash
cp .env.prod.example .env    # completar DOMINIO y DB_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy saca y renueva el certificado solo. El dominio tiene que resolver a la IP
del servidor **antes** de levantar el stack, o Let's Encrypt falla.

El stack de producción agrega, sobre el de desarrollo: `NODE_ENV=production`
(que es lo que hace que la cookie de sesión salga con `Secure`), la contraseña
de Postgres desde el entorno, los puertos de la base y de la API sin publicar
—solo salen 80 y 443, por Caddy— y `restart: unless-stopped`.

### Backup

Todo el estado vive en el volumen `dbdata`:

```bash
docker compose exec -T db pg_dump -U invitaciones invitaciones | gzip > backup-$(date +%F).sql.gz
```

## Arquitectura

```
api/   Express 5 + TypeScript · Drizzle · PostgreSQL 16 · zod · argon2id
web/   Next.js 16 (App Router) · React 19 · Tailwind v4
```

**Sesiones en tabla, no JWT.** El token va en una cookie `httpOnly`/`SameSite=Lax`
y en la base se guarda solo su SHA-256. Se puede revocar una sesión sin esperar
que venza, hay una fila por dispositivo, y cambiar la contraseña las cierra
todas de una.

**Todo en hora de Buenos Aires.** Ningún límite de día sale del reloj del
proceso: entre las 21 y la medianoche acá ya es el día siguiente en UTC, que es
justo cuando más gente entra al barrio.

### Dónde mirar primero

| Archivo | Qué es |
|---|---|
| [`api/src/authz.ts`](api/src/authz.ts) | `canEnter()`. La única pieza no trivial: función pura, sin base ni reloj interno. El orden de los rechazos importa y está testeado. |
| [`api/src/services/entries.ts`](api/src/services/entries.ts) | Registro de ingresos, agenda del día, búsqueda y auditoría. El `FOR UPDATE` sobre la invitación es lo que serializa el cupo: sin él, dos escaneos simultáneos del mismo QR leen el mismo contador y los dos entran. |
| [`api/src/services/invitations.ts`](api/src/services/invitations.ts) | Alta, edición, anulación y la página pública del invitado. |
| [`web/src/components/shell.tsx`](web/src/components/shell.tsx) | El marco de las tres secciones. Qué menú va lo decide [`web/src/lib/nav.ts`](web/src/lib/nav.ts). |
| [`web/src/app/globals.css`](web/src/app/globals.css) | Los tokens del tema. Claro y oscuro son valores de variables CSS: ningún componente sabe en qué tema está. |

El diseño sale del cartel de entrada del barrio: la itálica del nombre, el doble
filete, y los veredictos distinguidos por **luminancia y no por tono**, para que
se lean en escala de grises y con daltonismo.

## Pendiente

- **Aislamiento entre barrios.** Los servicios reciben el barrio de quien pide
  pero no filtran por él. Con un solo barrio el impacto es cero. El arreglo está
  escrito y salteado en
  [`api/tests/aislamiento-barrios.test.ts`](api/tests/aislamiento-barrios.test.ts):
  sacar el `.skip` y hacerlos pasar.
- **Ley 25.326.** Falta decidir cuánto se guardan los ingresos con documento y
  patente, y el job de anonimización.
- **Aviso al vecino** cuando su invitado llega a la barrera.
