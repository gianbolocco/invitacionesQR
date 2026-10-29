# Diseño — Alta exprés en garita y DNI obligatorio al ingreso

Fecha: 2026-10-12
Estado: aprobado para pasar a plan de implementación

## 1. Problema

Un invitado llega a la garita sin invitación porque el vecino se olvidó de
crearla o de avisar. Hoy el guardia no tiene ningún camino dentro del sistema
para esto: lo único que puede hacer es dejarlo pasar a mano, sin que quede
registrado, o pedirle al vecino que cree la invitación desde su casa mientras
el invitado espera en la puerta.

Separado pero relacionado: hoy el campo Documento en el ingreso es opcional.
En la práctica, se quiere que **nadie entre sin DNI registrado** — si la
invitación no lo trae cargado, se carga ahí mismo, en la puerta.

## 2. Alcance

### Adentro

- Botón en la garita para dar de alta una invitación "exprés" cuando la
  búsqueda no encuentra al invitado, a nombre del vecino que aprobó por
  teléfono.
- Búsqueda de la unidad del vecino por lote o por apellido, nueva (hoy la
  garita solo busca invitados/invitaciones, no unidades).
- El Documento pasa a ser obligatorio para registrar cualquier ingreso, no
  solo los de altas exprés.
- Si el Documento no estaba cargado en la invitación, el valor tipeado en la
  puerta se guarda en la invitación (no solo en el registro de esa entrada).
- En todo lugar donde se muestra quién invitó, si la invitación fue creada
  por un guardia se etiqueta como tal en vez de mostrar su nombre.

### Afuera, y por qué

- **Ingreso/egreso sin invitación.** `entry_log.invitation_id` es `NOT NULL`:
  todo el sistema (agenda, auditoría, búsqueda, cupo) pivotea sobre una
  invitación. Armar un camino sin invitación es lógica paralela nueva, no una
  versión más chica de esto. Crear la invitación reutiliza el 100% de lo que
  ya existe.
- **Elegir tipo, ventana de validez o cupo en el alta exprés.** Es un
  invitado que está parado en la puerta ahora: la única fecha posible es hoy,
  no es recurrente (eso ya lo cubre "frecuente"/"proveedor") y es una persona
  (cupo 1). Preguntarlo sería una decisión con una sola respuesta sensata.
- **Elegir qué vecino específico de la unidad aprobó.** El guardia atiende a
  quien conteste el teléfono de esa unidad; pedirle que además busque y
  confirme una persona puntual es fricción sin un dato verificable del otro
  lado.
- **Validar formato del documento.** Hoy es texto libre en toda la app
  (`placeholder="30.123.456"`, sin `pattern`); esto no le suma una regla que
  no existía.

## 3. Decisiones

### 3.1 El alta exprés es una invitación normal con casi todo fijo

Se crea con `kind: 'visita'`, `validFrom = validTo = hoy`, `capacity: 1`,
`weekdays: null`, `guestDoc: null`, token nuevo — exactamente los defaults que
ya usaría una visita de un solo día. Lo único que pide el formulario es
**nombre del invitado** y **lote**, con **patente** opcional.

Al crearla, el flujo navega directo a la pantalla de veredicto de esa
invitación — el mismo destino al que llega un escaneo de QR o un resultado de
búsqueda. No hay pantalla intermedia ni paso extra: el "Registrar ingreso" es
el de siempre.

### 3.2 `createInvitation` no sirve para esto, y está bien que no sirva

`createInvitation` llama `assertMemberOfUnit(createdBy, unitId)` — exige que
quien crea sea miembro de esa unidad. Un guardia nunca lo es, a propósito: esa
función encarna la regla "un vecino solo invita sobre su propia casa", que
sigue siendo correcta para el alta normal.

Se agrega `createExpressInvitation`, una función separada en el mismo
servicio, que en vez de `assertMemberOfUnit` valida que la unidad pertenezca
al mismo barrio del guardia (`assertUnitInNeighborhood`, nueva, mismo patrón
de `AppError(403, ...)` que la que reemplaza). `createdBy` queda en el id del
guardia: es correcto a nivel de dato — es quien hizo el alta — y es la base
de la decisión 3.4.

### 3.3 Buscar la unidad: lote o apellido, nunca se restringe a "mis unidades"

Nueva función `searchUnits(neighborhoodId, query)`: cruza `units` +
`unit_members` + `people`, matchea por `unaccent(people.name)` o
`units.label` (sin `unaccent`, un lote no lleva tildes), acotada al barrio.
Devuelve una fila por combinación unidad+residente (`unitId, unitLabel,
residentName`), para que "142" o "Pérez" alcancen y el guardia vea a quién
corresponde cada lote antes de elegirlo.

Es una búsqueda distinta de `/gate/search` (que busca invitados/invitaciones
existentes) y de `unitsOfPerson` (que busca las unidades de un vecino para su
propia alta) — ninguna de las dos sirve para "buscar una unidad por quién
vive ahí", así que es la primera vez que existe.

### 3.4 El Documento es obligatorio al ingreso, no al crear la invitación

La pantalla de veredicto (`/garita/invitacion/[id]`) **ya tiene** un campo
Documento, precargado desde la invitación, editable, antes del botón
"Registrar ingreso" — hoy opcional. Se exige ahí, para toda invitación, en
vez de pedirlo en el formulario de alta exprés:

- El alta exprés ya aterriza en esa pantalla apenas se crea, así que exigirlo
  ahí cubre el caso exprés sin pedir nada de más en el formulario.
- Cubre también los casos que ya existían sin esto: una invitación normal
  cuyo invitado nunca completó su documento desde el link, o una
  "frecuente"/"proveedor" vieja que nunca lo tuvo.
- Es un solo mecanismo en un solo lugar, en vez de la misma regla repetida en
  cada camino de entrada.

El botón "Registrar ingreso" se deshabilita si el campo está vacío (hoy solo
se deshabilita mientras está registrando), y el servidor lo exige también —
no alcanza con el cliente, porque un ingreso se puede registrar pegándole
directo a la API.

Si la invitación no tenía `guestDoc` cargado y se tipea uno en la puerta,
además de guardarse en el registro de esa entrada (como ya pasa hoy) se
guarda en la invitación misma, **solo si estaba vacía** — mismo invariante
que ya usa `fillGuestDetails` para el autocompletado del invitado. Así, una
invitación que se usa varias veces (frecuente, proveedor) lo pide una vez y
después ya viene precargada.

Un egreso no pide ni muestra el campo: para egresar, la persona ya entró, y
si entró ya tiene documento registrado.

### 3.5 Quién invitó, cuando invitó un guardia

`createdBy` queda en el guardia (decisión 3.2), pero en todo lugar donde la
app hoy muestra el nombre de quien invitó, se cambia la etiqueta cuando ese
creador tiene rol `guard`: en vez de su nombre, **"Portería (autorizado por
teléfono)"**.

Evita dos problemas: mostrar el nombre del guardia da la impresión de que él
personalmente invitó a un desconocido (ruido, y hasta sospechoso en una
auditoría); atribuirlo al vecino sería directamente falso — no lo creó él.
"Portería (autorizado por teléfono)" es preciso en los dos sentidos: dice que
no fue el vecino sin acusar al guardia de nada raro, y punto.

No hay columna ni flag nuevos: es una proyección en el momento de leer,
condicionada por `people.role`.

**Encontré que este dato se muestra en cinco lugares**, los cinco con la
misma forma (`people.name` vía `createdBy`), y los cinco necesitan el mismo
cambio:

| Lugar | Función | Dónde se ve |
|---|---|---|
| Auditoría del admin | `auditInvitations` (`api/src/services/entries.ts`) | Tabla y Excel de auditoría |
| Export completo | `auditAll` (`api/src/services/entries.ts`) | Excel de auditoría |
| Agenda del día | `agendaForDay` (`api/src/services/entries.ts`) | "invita {inviterName}" en la garita |
| Historial del vecino | `consultaInvitaciones` → `listForUnits` (`api/src/services/invitations.ts`) | "por {creatorName}" cuando hay más de un vecino en la unidad |
| Link público del invitado | `findPublicByToken` (`api/src/services/invitations.ts`) | "Te invita {inviterName}" |

## 4. Modelo de datos

Sin cambios de esquema. `invitations.createdBy` y `people.role` ya existen y
alcanzan para todo lo de este diseño.

## 5. API

### `GET /gate/units?q=` — nuevo

Bajo `gateRoutes` (ya exige `guard`/`admin`). Devuelve candidatos de unidad
para el alta exprés:

```ts
{ unitId: string; unitLabel: string; residentName: string }[]
```

`q` requerido, no vacío, igual que `/gate/search`.

### `POST /gate/invitations` — nuevo

```ts
{ unitId: string; guestName: string; plate?: string }
```

Llama `createExpressInvitation`, con `createdBy` del guardia de la sesión (no
del body, mismo patrón que `/gate/entries`). Devuelve la invitación creada
(`201`), el cliente navega a `/garita/invitacion/{id}` con el `id` de la
respuesta.

Errores: `403 not_your_neighborhood` si la unidad no es del barrio del
guardia.

### `POST /gate/entries` — el campo `guestDoc` pasa a requerido

```ts
{ invitationId: string; guestName: string; guestDoc: string; plate?: string; note?: string }
```

Antes `guestDoc` era `z.string().optional()`; pasa a `z.string().min(1)`
(recortado). Sin cambios en el resto del contrato.

`registerEntry` gana un paso: si `invitations.guestDoc` está `NULL`, lo
actualiza con el valor recibido, dentro de la misma transacción que ya abre
la fila con `for('update')` (no hace falta una condición de carrera nueva: la
fila ya está bloqueada antes de este `UPDATE`).

### Las cinco consultas de 3.5

Cada una cambia su columna de nombre por una expresión condicional:

```sql
case when p.role = 'guard' then 'Portería (autorizado por teléfono)' else p.name end
```

(En las que usan el query builder de Drizzle en vez de SQL crudo, se
reemplaza la referencia a la columna por un `sql<string>\`...\`` equivalente.)

## 6. Pantallas

### Búsqueda de la garita (`/garita`, `buscar-invitado.tsx`)

Cuando no hay resultados, el texto actual ("Sin resultados. Probá con el
apellido o la unidad.") se acompaña de un botón: **"¿No tiene invitación?
Autorizar ahora"**. Abre un formulario (sheet) con:

- **Nombre del invitado** (obligatorio).
- **Lote** (buscador con la unidad del vecino, por lote o apellido —
  `GET /gate/units`; se elige un resultado, no se tipea el id).
- **Patente** (opcional).

Al confirmar, crea la invitación y navega directo al veredicto.

### Veredicto (`/garita/invitacion/[id]`)

El campo Documento (ya existente) pasa a obligatorio: "Registrar ingreso" no
habilita sin texto en ese campo. Se agrega un texto de ayuda cuando está
vacío, visible cerca del campo, indicando que hace falta para poder
registrar el ingreso.

## 7. Errores

| Situación | Respuesta |
|---|---|
| Alta exprés con unidad de otro barrio | `403 not_your_neighborhood` |
| Ingreso sin documento | El cliente no deja enviar; si igual llega a la API, `400` de validación |
| Búsqueda de unidades sin `q` | `400` de validación, igual que `/gate/search` |

## 8. Tests

- `createExpressInvitation`: crea con los defaults correctos (`kind`,
  `validFrom`/`validTo` de hoy, `capacity: 1`, `createdBy` del guardia); lo
  rechaza si la unidad es de otro barrio; no exige membresía del guardia en
  la unidad (a diferencia de `createInvitation`).
- `searchUnits`: encuentra por lote, encuentra por apellido (con y sin
  tilde), no devuelve unidades de otro barrio.
- `POST /gate/entries` sin `guestDoc`: `400`.
- `registerEntry` con la invitación sin `guestDoc` previo: lo persiste en la
  invitación, no solo en el registro de esa entrada; con `guestDoc` previo
  distinto del tipeado, **no lo pisa** (se queda con el original).
- Las cinco consultas de 3.5: invitación creada por un vecino muestra su
  nombre; creada por un guardia muestra la etiqueta fija.
- E2e: búsqueda sin resultados → alta exprés → veredicto → ingreso exige
  documento → ingreso registrado, visible en la agenda con la etiqueta de
  portería.
