# Diseño — App de invitaciones para barrio cerrado

Fecha: 2026-09-14
Estado: aprobado para pasar a plan de implementación

## 1. Problema

Hoy los vecinos avisan a la guardia por WhatsApp quién va a entrar. Es incómodo,
no queda registro consultable, depende de que el guardia lea el mensaje correcto
en el momento correcto, y no hay forma de saber quién entró, cuándo ni invitado
por quién.

La app reemplaza ese WhatsApp por invitaciones con QR, una pantalla de garita y
una bitácora de ingresos.

## 2. Alcance

### En la v1

- Invitaciones creadas por el vecino: puntuales, frecuentes/permanentes, eventos
  con cupo, y proveedores.
- QR compartible por WhatsApp, con búsqueda manual como camino alternativo.
- Pantalla de garita: escaneo, búsqueda, autorización y registro de ingreso con
  DNI y patente.
- Padrón gestionado por un admin (UF, vecinos, guardias). Sin registro abierto.
- Bitácora de ingresos, auditoría de acciones administrativas y dashboard.
- Historial de invitaciones por vecino y por UF.

### Fuera de la v1

- Registro de egreso. Nadie escanea al salir; la data queda mintiendo.
- Lista nominal de invitados en eventos. Se carga cupo y el guardia anota el
  nombre real al ingresar.
- Notificación push al vecino cuando llega su invitado.
- Lectura automática de patentes / hardware en la barrera.
- Multi-barrio operativo (el modelo lo soporta, la UI no lo expone).
- Anonimización de datos personales por retención (ver sección 13).

## 3. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Back | Express + TypeScript | Decisión del dueño del proyecto. |
| ORM | Drizzle | Tipado punta a punta, migraciones versionadas, SQL predecible. |
| DB | PostgreSQL 16 | Datos relacionales, FKs y constraints en la base, transacciones para el cupo. |
| Front | Next.js 16 + Tailwind + shadcn | Mismo setup que `frontAdminAppConsorcios`; se usa como front puro contra la API. |
| Deploy | Docker Compose | Un solo comando en dev y en prod. |
| Mail | Resend | Free tier de 3.000/mes, suficiente. |

**Web, no mobile nativa.** El vecino comparte un link por WhatsApp; obligarlo a
instalar una app para eso no agrega nada. El guardia escanea QR desde el
navegador con `getUserMedia`. Sin app stores, sin releases, sin versiones viejas.

**Postgres, no Mongo.** Casi toda consulta útil es un join (quién invitó a quién,
ingresos por UF, frecuentes de una UF). El cupo de evento necesita una
transacción real para no pasarse con dos guardias escaneando a la vez. Las FKs y
los `CHECK` evitan escribir esas validaciones a mano en cada endpoint.

## 4. Arquitectura

Un repositorio, dos apps. Sin workspaces ni herramientas de monorepo.

```
invitacionesQR/
  api/                  Express + TS
    src/
      routes/           HTTP + validación con zod
      services/         reglas de negocio
      db/               schema Drizzle + queries
      lib/              auth, mail, audit
    drizzle/            migraciones
  web/                  Next.js (front puro)
  docker-compose.yml
```

Capas finas: `routes` → `services` → `db`. Sin interfaces de una sola
implementación, sin inyección de dependencias, sin patrón repositorio.

## 5. Modelo de datos

```sql
neighborhood (
  id, name, created_at
)

unit (
  id, neighborhood_id FK, label,
  UNIQUE (neighborhood_id, label)
)

person (
  id, neighborhood_id FK, email, name,
  role TEXT CHECK (role IN ('resident','guard','admin')),
  status TEXT CHECK (status IN ('invited','active','disabled')),
  password_hash,   -- NULL si solo usa Google
  google_sub,      -- NULL hasta que vincule Google
  last_login_at,
  created_at,
  UNIQUE (neighborhood_id, email)
)

unit_member (
  unit_id FK, person_id FK,
  PRIMARY KEY (unit_id, person_id)
)

invitation (
  id, unit_id FK, created_by FK -> person,
  kind TEXT CHECK (kind IN ('visita','frecuente','evento','proveedor')),
  guest_name, guest_doc, plate,
  valid_from DATE, valid_to DATE,
  weekdays SMALLINT[],      -- 0=domingo .. 6=sábado. NULL = todos los días
  capacity INT DEFAULT 1,
  token,                    -- 16 bytes aleatorios, base64url
  revoked_at,
  created_at,
  CHECK (valid_to >= valid_from),
  CHECK (capacity >= 1)
)

entry_log (
  id, invitation_id FK, unit_id FK, guard_id FK -> person,
  entered_at, guest_name, guest_doc, plate, note
)

audit_log (
  id, neighborhood_id FK, actor_id FK -> person,
  action, entity, entity_id,
  meta JSONB,
  at
)

auth_token (
  id, person_id FK, token_hash, purpose,  -- invite | reset
  expires_at, used_at, created_at
)

session (
  id, person_id FK, token_hash, user_agent,
  expires_at, last_seen_at, created_at, revoked_at
)
-- Sin UNIQUE en person_id: una fila por dispositivo, todas válidas a la vez.
```

Índices: `entry_log (unit_id, entered_at)`, `entry_log (invitation_id)`,
`invitation (unit_id, valid_to)`, `invitation (token)` único,
`invitation (created_by, created_at)`, `audit_log (neighborhood_id, at)`,
`session (token_hash)` único.

### Sesiones en tabla, no JWT

La cookie lleva un identificador opaco que se resuelve contra `session`. Un JWT
autocontenido no se puede revocar antes de que expire, y con sesiones de 6 a 12
meses eso significa que dar de baja a un vecino no lo saca del sistema hasta el
año que viene. El costo es una consulta por request a una tabla indexada.

### Zonas horarias

Todos los `timestamp` se guardan en UTC. Los cortes de día del dashboard
("ingresos hoy", "por hora del día") se calculan en `America/Argentina/Buenos_Aires`.
Sin esto, "hoy" arranca a las 21 del día anterior y los números salen mal.

### Una sola tabla de invitaciones

Los cuatro tipos son la misma fila con distintos valores. `kind` es una etiqueta
de UI: decide qué campos muestra el formulario y cómo se ve la tarjeta, **no
ramifica la lógica de autorización**.

| Tipo | Cómo se expresa |
|---|---|
| Visita puntual | `valid_from = valid_to = hoy`, `capacity = 1` |
| Frecuente | `valid_to` lejano, `weekdays` seteado, `capacity` alto |
| Evento | `capacity = N`, N filas en `entry_log` contra la misma invitación |
| Proveedor | igual a puntual, con `plate` cargada |

### Bajas

`status = disabled`, nunca `DELETE`. `entry_log` y `audit_log` referencian
personas; borrarlas dejaría registros huérfanos. Deshabilitado no puede entrar
ni loguear, pero su historial sigue siendo legible.

## 6. Lógica de autorización

Es la única pieza no trivial del sistema. Función pura:

```ts
function puedeEntrar(inv: Invitation, ahora: Date, usos: number): Resultado
```

Devuelve autorizado, o el motivo del rechazo:

- `revoked_at` no nulo → revocada
- `ahora` fuera de `[valid_from, valid_to]` → vencida o todavía no vigente
- `weekdays` seteado y hoy no está en la lista → no habilitado ese día
- `usos >= capacity` → cupo agotado (mostrando cuándo se usó la última vez)
- en cualquier otro caso → autorizado

El registro del ingreso corre **dentro de una transacción** que vuelve a contar
los usos, para que dos guardias escaneando a la vez no puedan pasarse del cupo.

**La ventana es por día, no por hora.** `valid_from` y `valid_to` son `DATE`, y
la comparación usa la fecha local de Buenos Aires. Una visita "de hoy" vale hasta
las 23:59 de hoy. Poner horas exactas suena más preciso pero castiga al invitado
que llega tarde y al vecino que se equivocó por media hora, y termina en un
llamado a la garita — que es justo lo que la app viene a eliminar.

## 7. Autenticación

### Vecinos: el magic link es el alta; después, contraseña o Google

No hay registro abierto. El admin da de alta a la persona y eso dispara el mail.

**Alta, una sola vez:**

1. El admin crea la persona (`status = invited`) → mail con magic link (7 días).
2. El vecino abre el link → página con botón → **POST** con el token.
3. La API valida el token y lo marca usado → pantalla **"Creá tu contraseña"**,
   con un botón **Continuar con Google** como alternativa.
4. Elige uno de los dos → se crea la sesión, `status` pasa a `active`, se
   registra `last_login_at`.

Si entra por Google, `password_hash` queda `NULL` y puede crear una contraseña
más tarde desde su perfil.

**Login, siempre después:** mail + contraseña, o Google. Sin ir al mail.

**Olvidé mi contraseña:** el mismo `auth_token` con `purpose = 'reset'`, 15
minutos, consumido por POST como el resto.

**El magic link no desaparece: es el alta y el camino de recuperación.** El costo
de esta decisión es tener tres caminos de entrada (link, contraseña, Google) en
vez de uno; se paga a cambio de que el segundo dispositivo no exija un viaje al
mail. Decisión explícita del dueño del proyecto.

Reglas de contraseña:

- **argon2**, mínimo 10 caracteres, **sin reglas de composición**. Exigir
  mayúscula y símbolo produce `Barrio2026!` y nada más.
- Rate limit de 5 intentos por mail cada 15 minutos.
- La cuenta de garita usa esta misma implementación; lo único que no tiene es
  autogestión de reset, porque no tiene mail.

Reglas del magic link, todas obligatorias:

- Token de 32 bytes aleatorios, **guardado hasheado** (SHA-256) en `auth_token`.
- Un solo uso. Expira en **7 días** para el alta (el vecino puede tardar días en
  ver el mail) y en **15 minutos** para el reset de contraseña.
- **Se consume por POST, no por GET.** Los escáneres de links de los clientes de
  mail hacen GET a todo lo que llega y consumirían el token antes que el usuario.
  El link abre una página con un botón; el botón hace el POST.
- **Sin código de 6 dígitos.** Existía para resolver el login cruzado entre
  dispositivos; con contraseña ese problema desaparece y el código pasa a ser
  código muerto.
- Rate limit por mail y por IP. La respuesta es siempre "te mandamos un mail",
  exista o no la cuenta.
- Vinculación de Google **solo por mail verificado** (Google lo entrega
  verificado; el magic link prueba posesión). Linkear por mail sin verificar es
  una vulnerabilidad de account takeover conocida.

Sesión: cookie `httpOnly` + `Secure` + `SameSite=Lax`, 6 a 12 meses, renovada en
cada uso, revocable desde el admin.

**Varios dispositivos a la vez.** Una fila de `session` por dispositivo, todas
válidas en paralelo: loguearse en la computadora no cierra la sesión del celular.
En el segundo dispositivo se entra con mail y contraseña o con Google, **sin
ningún viaje al mail**. Este es el motivo por el que la contraseña existe.

`session.user_agent` se guarda desde el día uno para poder mostrar más adelante
una lista de sesiones activas con botón de cerrar. La columna ahora, la pantalla
cuando haga falta.

### Garita

La garita es una PC compartida con turnos rotativos y sin mail personal por
guardia, así que no tiene alta por magic link ni reset autogestionado: la clave
la setea y la resetea el admin. Fuera de eso usa exactamente la misma
implementación de contraseñas que el resto — no es un caso especial en el código.

El `guard_id` de cada ingreso sale de un selector de "guardia de turno"
persistente en la pantalla, no de la cuenta compartida.

### Primer admin

No se puede crear por UI (huevo y gallina). Sale de
`npm run seed:admin -- --email=...`, que corre una vez.

## 8. Flujos y pantallas

### Vecino (diseñado para celular)

```
/              Invitaciones vigentes + botón grande "Nueva invitación"
/nueva         Un solo formulario. Cuatro chips de tipo que cambian qué
               campos se ven, no cuatro formularios distintos.
/historial     Invitaciones pasadas de la UF, con si el invitado entró o no,
               cuándo, y cuántas veces. Botón "Volver a invitar" que precarga
               el formulario con los mismos datos.
/perfil        Cambiar contraseña, vincular o desvincular Google.
/i/<token>     Página pública: QR, nombre, UF, vigencia.
```

**El alcance es la UF, no la persona.** Una UF puede tener varios vecinos
(`unit_member`), cada uno con su login. Todos ven las invitaciones de la UF, con
"creada por" visible y un filtro *Solo las mías*. Si la mujer invitó a alguien
para el sábado, el marido tiene que enterarse: de lo contrario la app le resuelve
el WhatsApp con la guardia pero le deja el WhatsApp con la familia. El guardia
autoriza contra la UF, así que la UF es la unidad correcta.

Como `unit_member` es N:M, una persona puede pertenecer a más de una UF (dos
lotes, o la propia y la de los padres). En el formulario: con una sola UF no se
muestra nada; con dos o más aparece un selector. Sin tablas nuevas.

Si un vecino se muda o se da de baja, las invitaciones y la bitácora **quedan con
la UF**: el historial de ingresos pertenece a la unidad, no a quien lo tipeó.
`created_by` conserva la trazabilidad de quién generó cada invitación.

`unit.label` guarda el string completo que use el barrio ("Lote 142", "UF 7B"),
sin prefijo configurable ni lógica de formato.

Al guardar aparece el QR y un botón **Compartir** que usa la Web Share API
nativa: abre WhatsApp con el link y el texto ya armados. Sin librería, sin
integración con la API de Meta. El invitado recibe un link común.

DNI y patente los precarga el vecino (opcionales). El guardia solo corrige: la
barrera, con un auto esperando, es el peor lugar para tipear datos.

### Garita (pantalla horizontal, una sola vista)

Cámara escaneando permanentemente a la izquierda, buscador a la derecha
(apellido, UF o patente). **El QR y la búsqueda manual caen en el mismo
resultado**, así que el camino alternativo no es un segundo flujo: es el mismo
sin el paso del escaneo.

El resultado ocupa media pantalla: verde o rojo, nombre, UF, tipo, vigencia.
Si es evento, "12 de 30 ingresaron". Abajo, **Registrar ingreso**, con DNI y
patente precargados y editables.

Escaneo: `BarcodeDetector` nativo donde exista, `html5-qrcode` como respaldo.

### Admin

```
/admin              Dashboard (sección 10)
/admin/unidades     ABM de UF
/admin/usuarios     Alta (mail + nombre + UF + rol) → dispara el mail
                    Estados: invitado · activo · deshabilitado
                    Acciones: reenviar invitación, deshabilitar, cambiar de UF
/admin/guardias     Cuentas de garita, alta y reseteo de clave
/admin/bitacora     Ingresos filtrables por fecha, UF y guardia + export CSV
/admin/invitaciones Historial global filtrable + export CSV
```

## 9. Seguridad del QR

El QR es un secreto que viaja por WhatsApp y **se puede reenviar**. Eso no tiene
solución completa: cualquier cosa que el invitado pueda mostrar en la barrera,
también la puede mandar a un tercero. Lo que se hace es acotar el daño.

| Defensa | Efecto |
|---|---|
| Cupo (`capacity`) | Visita puntual = 1 uso. El segundo sale en rojo con la hora del primero. |
| Ventana de validez | El QR del sábado no sirve el martes. |
| El guardia ve el nombre esperado | El QR no abre la barrera: autoriza a una persona. Se pide DNI y se compara. |
| Revocar | Un tap desde la app del vecino, efecto inmediato. |
| Token de 16 bytes aleatorios | No se adivina. Igual va rate limit en el endpoint de validación. |
| Bitácora contra la UF | Todo ingreso tiene dueño identificable. |

**No se usa JWT firmado para el QR.** Hay que consultar la base igual (revocación,
cupo, registro del ingreso), así que la firma no ahorra el viaje: solo agrega
claves que rotar y tokens más largos que no entran cómodos en un QR.

## 10. Registro, auditoría y reportes

### Auditoría

`audit_log` es una tabla genérica, no un historial por entidad. Un helper
`audit(actor, action, entity, meta)` llamado desde los services. Acciones:
`person.created`, `person.disabled`, `person.reinvited`, `unit.created`,
`invitation.revoked`, `guard.password_reset`, `session.revoked`.

**`audit_log` y `entry_log` no se mezclan.** `entry_log` es dominio: tiene DNI,
patente y guardia, y se consulta constantemente desde la garita. `audit_log` es
rastro administrativo, se escribe mucho y se lee poco. Juntos darían una tabla
con la mitad de las columnas en `NULL`.

### Dashboard (`/admin`)

- **KPIs**: ingresos hoy / semana / mes · invitaciones vigentes · vecinos
  habilitados vs. vecinos que entraron en los últimos 30 días · **UF sin
  ningún vecino registrado** (el agujero del padrón).
- **Ingresos por día** (últimos 30) e **ingresos por hora del día**, este último
  para dimensionar turnos de guardia con datos.
- **Invitaciones generadas por usuario y por UF**, con ranking y evolución.
- **Tablas**: últimos ingresos · últimas altas y bajas · actividad por guardia
  (ingresos registrados por turno).
- Todo filtrable por fecha y UF, todo exportable a CSV.

`last_login_at` en `person` existe porque "usuario activo" tiene dos
significados y los dos importan: habilitado (`status = active`) y que realmente
usa la app. La diferencia entre esos números dice si el barrio adoptó la
herramienta.

Son consultas SQL directas. **Sin stack de analytics, sin pipeline de eventos,
sin vistas materializadas**: un barrio genera decenas de miles de filas por año.
Si alguna consulta duele, ahí se agrega una vista materializada.

## 11. Docker y despliegue

```yaml
services:
  db:   postgres:16      :5432   volumen persistente
  api:  build ./api      :8080
  web:  build ./web      :3000   Next con output: 'standalone'
```

```bash
docker compose up -d --build   # mismo comando en dev y en prod
```

Sin servicio `migrate` separado: el comando de `api` es
`drizzle-kit migrate && node dist/index.js`. Si la migración falla, la API no
levanta, que es el comportamiento deseado.

```
# ponytail: migraciones al arrancar la API. Si alguna vez corre más de una
# réplica, mover a un servicio `migrate` aparte para que no compitan.
```

Producción: el mismo compose en un VPS con Caddy adelante, que resuelve HTTPS y
certificados solo. **HTTPS no es opcional**: sin él el navegador no da acceso a
la cámara y la garita no escanea.

## 12. Testing

- **`puedeEntrar()` con tests de tabla**: ventana, día de semana, cupo agotado,
  revocada, vencida, todavía no vigente. Si esa función está bien, la app está
  bien.
- **Un test de concurrencia del cupo**: dos registros simultáneos contra una
  invitación de `capacity = 1` dejan un solo `entry_log`.
- **Un smoke test de punta a punta**: crear invitación → escanear → registrar
  ingreso → aparece en la bitácora.

Sin fixtures, sin mocks, sin un test por endpoint. El resto es CRUD.

## 13. Diferido

- **Ley 25.326 / retención de datos personales.** Se guardan DNIs de personas
  que no son del barrio. Queda pendiente definir un job que anonimice el DNI de
  ingresos con más de N meses, dejando el resto del registro para estadísticas.
  Decisión postergada a pedido del dueño del proyecto.
- Notificación al vecino cuando llega su invitado (push o mail).
- Lista nominal de invitados en eventos.
- Exposición de multi-barrio en la UI.
