# Pazzit

Invitaciones y control de acceso para barrios cerrados. Reemplaza el "avisá a la
guardia por WhatsApp": el vecino genera una invitación, el invitado carga sus
datos desde un link y se lleva un QR, y el guardia lo escanea en la barrera.

**Un despliegue es un barrio.** El nombre, la dirección, el color y el logo son
datos que carga el admin, no código. Instalar un barrio nuevo es levantar el
stack con el mail de su primer admin.

## Cómo funciona

**El vecino** crea una invitación a nivel unidad (UF), no a nivel persona: los
que viven en la misma casa ven y gestionan las invitaciones de esa casa. Hay
tres tipos —visita, frecuente y proveedor— y son todos la misma tabla, con
distinta ventana de validez y distinto cupo. Una frecuente dice si viene de
visita (la empleada, el profesor) o a trabajar (el jardinero): la de visita dura
hasta un mes, y en la garita la otra se marca también como proveedor.
Guarda a los que vienen seguido en **Contactos** (los ven todos los de la
casa). *Nueva invitación* arranca por a quién: elegir un contacto deja solo la
fecha. De un proveedor ve si su seguro está al día, nunca la póliza. El DNI
de un contacto lo escribe el vecino; si lo dejó vacío, lo completa la garita
con el documento a la vista en el primer ingreso (el del link no cuenta), y
nunca se pisa uno ya cargado.

**El invitado** recibe un link. Ahí ve quién lo invita, a qué unidad y cómo
llegar, carga su documento y su patente si quiere, y se queda con su QR.

**Un evento no es nada especial**: es una invitación por invitado. No hay tipo
"evento", ni cupo compartido, ni links de anotación. Cada persona tiene su
invitación, su QR y su fila en la lista del día, y eso es justamente lo que da
la trazabilidad de quién entró y quién no.

**El guardia** tiene su propia cuenta —cada movimiento queda a nombre de quien
estaba logueado, que es lo que hace auditable el "¿quién lo dejó pasar?"—, la
lista del día, el escáner y la auditoría exportable a Excel (cada fila abre su detalle en un panel: proveedor, invitación y movimientos). El buscador de la
garita muestra los resultados flotando sobre la pantalla (en el celular, a
pantalla completa) y se maneja con el teclado: flechas, Enter y Esc.

Escanear el QR de nuevo, o buscar por documento, registra la **salida**: el
sistema resuelve solo si el movimiento es un ingreso o un egreso según haya o no
una fila abierta. Un egreso nunca se rechaza —el que está adentro tiene que
poder salir— y no libera cupo, así que un reingreso rebota igual que antes.

Si una visita o un proveedor lleva adentro más horas de las que fijó el admin
para su tipo, la garita lo **marca**: va primero en "Adentro", con el tiempo que
lleva en amarillo, y en *Filtros → Tiempo excedido* se ven solo esos. La cuenta se
hace en la garita contra su reloj: no hay job en el servidor. Una frecuente usa
las horas de lo que es: visita o proveedor, según eligió el vecino.

**Horarios de proveedores.** El admin carga en *Administración → Barrio* los
rubros (plomero, jardinero…) y las franjas: días, horario, temporada opcional y
a qué rubros aplica. Sin franjas no hay restricción. Cuando las hay, el vecino
elige el rubro al invitar a un proveedor y ve cuándo puede entrar. Fuera de la
franja, la garita muestra NO PASA · Fuera de horario, y el guardia puede
**Autorizar igual**: queda en la auditoría.

**Seguro del proveedor.** El admin marca en *Administración → Barrio* qué rubros
piden seguro. El seguro vive en un **padrón del barrio, por DNI**: se carga una
vez y vale para todos los lotes donde trabaja. Lo carga el proveedor desde su
link (con su DNI) o el guardia en la garita; el vecino ya no lo carga. Lo que
verificó un guardia no lo pisa un link hasta que vence. Sin seguro vigente la
garita muestra NO PASA · Sin seguro (o Seguro vencido): el guardia lo carga ahí
mismo y registra el ingreso, o usa **Autorizar igual**. Si el admin fija con
cuántos días avisar, el guardia ve "vence en N días" antes de que venza.

**Seguro del auto.** Si el admin lo pide (*Barrio → Alertas*), la garita frena a
todo el que entra en auto sin un seguro vigente cargado para esa patente. Lo
carga **solo la guardia**, con el certificado a la vista, y queda en el padrón
por patente: la próxima vez ese auto pasa sin que se lo pidan, venga al lote que
venga. Borrar la patente es "viene a pie". Un segundo switch decide si la
portería puede autorizar igual un auto sin seguro. Cada ingreso guarda cómo
estaban los dos seguros ese día: renovarlos después no cambia la auditoría.

El veredicto de la garita se ordena en tres secciones —**Visitante/Proveedor**,
**Vehículo** e **Invitación**— con el estado de cada seguro al lado del título y
"Corregir" para actualizarlo. Se recalcula al cambiar el documento o la patente.

**Seguros.** La pantalla *Seguros* (garita y admin) lista los autos y los
proveedores ordenados por vencimiento, con filtros (vencidos, por vencer,
vigentes, sin cargar), buscador y Excel. El guardia corrige desde ahí; el admin
solo mira. El tablero avisa los vencidos que siguen entrando, los que vencen
pronto y los ingresos autorizados sin seguro, y lleva a donde se resuelven. La
auditoría y su Excel muestran el seguro del auto y cómo estaba cada seguro **el
día del ingreso**.

El alta exprés de la garita (**Autorizar sin invitación**) puede ser visita o
proveedor, con su rubro; los seguros se cargan en el veredicto que abre después.
A un proveedor que autoriza la portería no se le controla horario ni el seguro
del proveedor (el del auto, solo si el admin lo permite).

**El admin** da de alta vecinos y guardias, corrige lotes, edita los datos del
barrio (las horas de la alerta de permanencia, los rubros y los horarios de
proveedores incluidos) y ve el tablero.

**El plano del barrio**: el admin sube una imagen (SVG, PNG o JPG, hasta 1 MB) y el
invitado la ve en su link. Si es un SVG con los lotes como `lote-N`, el lote del
invitado aparece resaltado. El de Alamo Alto está en `docs/barrios/`.

## Correr en desarrollo

```bash
docker compose up -d --build
# web  http://localhost:3000
# api  http://localhost:8080
```

La API corre las migraciones al arrancar. Con la base vacía, el barrio y su
admin se crean con un comando (ver *Instalar un barrio*).

Sin `RESEND_API_KEY` los mails no se envían: **se imprimen en el log del
contenedor**. El alta de un vecino y el "olvidé mi contraseña" se prueban
enteros sin cuenta de mail, copiando el link de `docker compose logs api`.
Esto vale solo en desarrollo: con `NODE_ENV=production` la API no arranca sin
`RESEND_API_KEY` y `MAIL_FROM`.

### Instalar un barrio

Con el stack levantado, desde la terminal del contenedor `api` (en Coolify:
el recurso → *Terminal* → `api`; en local, `docker compose exec api sh`):

```bash
node dist/crear-admin-cli.js admin@losaromos.com.ar "Nombre del admin"
```

Con la base vacía crea el barrio (como "Mi barrio") y el admin, e imprime el
link de alta (que también sale por mail, si hay `RESEND_API_KEY`). El admin elige
su contraseña con ese link, igual que cualquier vecino. El mismo comando suma
otro admin a un barrio que perdió el suyo, y con un admin que todavía no entró
le reemite el link.

El nombre, la dirección, el link de mapas, el color y el logo se cargan desde
*Administración → Barrio*. El color sale de
una paleta cerrada de ocho: son los que mantienen legible el texto que va
encima, en tema claro y oscuro.

### Sin Docker

```bash
cd api  && cp .env.example .env && npm ci && npx drizzle-kit migrate && npm run dev
cd web && npm ci && npm run dev
```

### Tests

```bash
cd api && npm test          # vitest contra una base invitaciones_test aparte
cd web && npm run check     # la lógica pura de web/src/lib (*.check.ts); no hay tests de componentes
cd web && npm run e2e       # Playwright, con el stack levantado
```

Los tests de la API usan **otra base** (`invitaciones_test`), que se crea y
migra sola. No tocan la de desarrollo.

El e2e sí escribe en la de desarrollo y no limpia. Antes de correr,
[`web/e2e/preparar.ts`](web/e2e/preparar.ts) crea o reactiva tres cuentas con
contraseña `e2e-contrasena-larga` —`e2e.admin@visitpass.test`,
`e2e.vecino@visitpass.test` (Lote 900) y `e2e.guardia@visitpass.test`— y
**deja el barrio en cero**: archiva todos los rubros, borra las franjas de
proveedores y apaga las alertas y el seguro del auto. Lo que hayas configurado
a mano en desarrollo se pierde. Si se pone lento o intermitente,
`--workers=1`.

## Flujo de trabajo

| Rama | Para qué |
|---|---|
| `dev` | Donde se trabaja. Las features chicas van directo; las grandes, en una rama que se mergea a `dev`. |
| `qa` | Lo que está desplegado en el ambiente de pruebas (qa.pazzit.com). Coolify la despliega sola con cada push. |
| `main` | Reservada para producción. Hoy está desactualizada y no se despliega en ningún lado. |

**Pasar `dev` a qa.** `qa` nunca lleva commits propios, así que se adelanta
sin merge:

```bash
cd api && npm test && npx tsc --noEmit
cd web && npm run check && npm run lint && npx tsc --noEmit && npm run e2e
git push origin dev:qa      # falla si qa tiene algo que dev no: no forzar, mirar qué es
```

La API corre las migraciones pendientes al arrancar. Antes de un push con
migraciones nuevas (`api/drizzle/`), un backup de la base de qa, y leerlas: una
migración que borra columnas no se deshace volviendo atrás el código.
Después del despliegue, `/api/health` y una pasada a mano por la garita.

**Volver atrás.** `git push --force-with-lease origin <commit-anterior>:qa`
revierte el código, no la base. Si la versión nueva migró, la vieja puede no
andar con el esquema nuevo: restaurar el backup.

**Producción.** Cuando haya un barrio en producción, `main` se adelanta desde
`qa` de la misma forma (`git push origin qa:main`), después de probar en qa.

## Desplegar

Hace falta un VPS y un dominio apuntándole. **No es opcional tener HTTPS**: el
escáner usa `getUserMedia` y los navegadores solo dan acceso a la cámara en
`https://` o `localhost`. Sobre una IP de la red local por HTTP, el guardia no
va a poder escanear nunca.

```bash
cp .env.prod.example .env    # completar DOMINIO, DB_PASSWORD y el barrio
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy saca y renueva el certificado solo. El dominio tiene que resolver a la IP
del servidor **antes** de levantar el stack, o Let's Encrypt falla.

El stack de producción agrega, sobre el de desarrollo: `NODE_ENV=production`
(que es lo que hace que la cookie de sesión salga con `Secure`), la contraseña
de Postgres desde el entorno, los puertos de la base y de la API sin publicar
—solo salen 80 y 443, por Caddy— y `restart: unless-stopped`.

### Lectora 2D en la garita

Cualquier lectora 2D (USB, dongle o Bluetooth) en **modo teclado (HID)** lee el
QR de la invitación y el DNI desde `/garita`, sin campo enfocado. Configurarla
con terminador Enter (Tab o ninguno también andan) y **envío inmediato**, no en
modo inventario. La distribución de teclado puede quedar en US aunque Windows
esté en español: el texto deformado se repara solo. Para instalarla, *Garita →
Probar lectora* muestra qué mandó y cómo se entendió. Los modos HID-POS y
Alt+numpad no sirven: el navegador no recibe texto.

### En Coolify

La base va en un recurso propio y la app en otro: así los backups de Coolify
la cubren y rehacer la app nunca toca los datos. Ver el encabezado de
[`docker-compose.coolify.yml`](docker-compose.coolify.yml).

1. **New Resource → Database → PostgreSQL.** Levantarla y copiar su
   *Postgres URL (internal)*.
2. En la base, pestaña **Backups**: programar uno diario y apuntarlo a un S3
   (Settings → S3 Storages). Probar una restauración una vez.
3. **New Resource → Docker Compose** con este repo, rama `main`,
   *Docker Compose Location* = `/docker-compose.coolify.yml`.
4. En ese recurso, activar **Connect To Predefined Network** (si no, la API no
   alcanza la base) y cargar las variables: `DATABASE_URL` (la del paso 1),
   `DOMINIO`, `RESEND_API_KEY`, `MAIL_FROM`.
5. Asignar el dominio al servicio `caddy` y desplegar.
6. En *Terminal*, servicio `api`, crear el admin con `node dist/crear-admin-cli.js`
   (ver *Instalar un barrio*).

Para probar cambios antes de producción, usá una segunda aplicación Coolify con
la rama `qa` y una base de datos de pruebas separada. El webhook despliega solo
la rama configurada en cada aplicación. Cómo se pasa código de una rama a otra,
en *Flujo de trabajo*.

### Datos de demo

[`api/scripts/demo.sql`](api/scripts/demo.sql) deja qa lista para mostrar:
vecinos y guardias con contraseña `pass123`, dos semanas de historia y un día
armado (gente adentro, uno con el tiempo excedido, visitas con nota, una
anulada). Borra todo menos el barrio, admins incluidos: después va
`crear-admin-cli`. Los horarios salen de `now()`, así que se corre la mañana de
la demo. **Nunca en producción.**

```bash
psql "$DATABASE_URL_QA" -v ON_ERROR_STOP=1 -f api/scripts/demo.sql
```

### Backup

Todo el estado vive en la base, el logo incluido. En Coolify lo cubre el
backup programado del recurso de base de datos. Con el stack de VPS:

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
| [`web/src/app/globals.css`](web/src/app/globals.css) | Los tokens del tema. Claro y oscuro son valores de variables CSS: ningún componente sabe en qué tema está. El color del barrio entra por una sola, `--marca-base`, y el resto se deriva con `oklch(from …)`. |
| [`api/src/lib/marca.ts`](api/src/lib/marca.ts) | La paleta de ocho y el sniffing del logo por bytes. Lo único que sabe qué colores existen. |

El diseño sale del cartel de entrada del barrio: la itálica del nombre, el doble
filete, y los veredictos distinguidos por **luminancia y no por tono**, para que
se lean en escala de grises y con daltonismo.

## Documentación

| Dónde | Qué hay |
|---|---|
| [`docs/superpowers/`](docs/superpowers/) | Specs de diseño y planes de cada feature, con fecha. El [índice](docs/superpowers/README.md) dice cuáles siguen vigentes. |
| [`docs/rediseno/`](docs/rediseno/) | Plan y progreso del rediseño con la identidad Pazzit, y el prototipo visual. |
| [`docs/barrios/`](docs/barrios/) | El plano SVG de Alamo Alto, con los lotes como `lote-N`. |

## Pendiente

- **Ley 25.326.** Antes del primer barrio en producción:
  1. Retención: `entry_log` y el padrón (`provider`, `vehicle`) guardan
     documento, patente y seguro para siempre. Falta el job de anonimización.
  2. Aviso a la visita: quién guarda sus datos, para qué, cuánto tiempo y a quién
     reclamar.
  3. La cláusula del contrato: el barrio es el responsable y Pazzit, el
     encargado del tratamiento.
- **Backups de Coolify.** Confirmar que el backup diario a S3 corre y hacer una
  restauración de prueba en una base descartable.
- **qa en buscadores.** `X-Robots-Tag: noindex` en el Caddyfile, solo para qa y
  activado por variable de entorno. Basic auth no: se probó y se sacó.
- **Aviso al vecino** cuando su invitado llega a la barrera.
- **Ruta en el plano**, desde la entrada hasta el lote del invitado.
- **Base propia para el e2e.** Hoy escribe en la de desarrollo y no limpia; con
  el tiempo la suite se vuelve lenta e intermitente.
