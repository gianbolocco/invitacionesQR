# Padrón, seguro del auto y contactos: diseño

Estado: diseño aprobado el 24/10. Sigue a `2026-10-21-seguro-proveedor-design.md`,
que dejó el seguro en la invitación y anotó cuándo revisarlo: *"si la lista de
vencimientos se llena de la misma póliza en muchos lotes"*. Es eso.

## Problema

- El vecino invita a las mismas personas todas las semanas y tipea todo de
  nuevo. "Volver a invitar" sirve, pero hay que encontrar la invitación vieja.
- El jardinero que trabaja en 15 lotes tiene 15 copias de su seguro, una por
  invitación. Si lo renueva, la garita se lo vuelve a pedir en cada lote.
- El barrio quiere pedir el seguro del auto a todo el que entra en auto, y no
  pedírselo de nuevo cada vez que ese auto vuelve.
- El admin quiere ver ordenados los seguros y sus vencimientos.

## Decisiones

- **Padrón del barrio con claves naturales, sin FKs nuevas.** `provider` (por
  DNI) y `vehicle` (por patente). La invitación y `entry_log` siguen guardando
  su copia de nombre, DNI y patente. La garita cruza por texto normalizado.
  - Descartado: FKs desde la invitación. El DNI es opcional al invitar, así
    que las FKs quedarían nulas hasta la garita y el padrón se llenaría con lo
    que tipea el vecino.
  - Descartado: sacar el seguro vigente del historial. El seguro del auto
    quedaría mezclado con los movimientos, y la retención futura de `entry_log`
    lo borraría.
- **El padrón de personas guarda solo proveedores.** De una visita no hay
  nada que recordar más allá de lo que trae la invitación: su agenda es el
  contacto del vecino. Una fila de `provider` existe porque alguien entró a
  trabajar o cargó un seguro desde su link. Es una persona, no un rol: si el
  jardinero viene un domingo de visita, sigue siendo la misma fila. Así el
  padrón guarda menos datos personales (Ley 25.326).
- **Un vehículo existe solo si tiene seguro cargado.** Un auto sin seguro no
  necesita fila: la patente queda en `entry_log` como hoy.
- **El auto no se vincula a la persona.** La garita sugiere "la última vez
  vino en AB123CD" sacándolo de `entry_log`, sin tabla n:n.
- **El padrón lo escribe la garita.** Solo hay una excepción: el seguro del
  proveedor, que carga él desde su link. El vecino no escribe en el padrón: un
  DNI mal tipeado por él no lo ensucia.
- **Seguro del auto: lo carga solo la garita**, con el certificado a la
  vista. Se guarda la vigencia del certificado. Si es mensual, se pide cada
  mes. La garita no puede saber si está pago, solo si el certificado está
  vigente.
- **Nadie entra sin DNI** (ya era así en la barrera). Por eso el padrón se
  completa solo.
- **El estado del seguro se congela en `entry_log` al ingresar.** El padrón
  cambia; la auditoría tiene que decir cómo estaba el día que entró.
- **El listado de seguros vuelve.** Se había sacado el 22/10 porque mostraba
  una fila por invitación. Ahora muestra una por proveedor o por auto.
- **Retención (Ley 25.326): spec aparte.** Este spec no borra nada del padrón.
  Con el padrón, ese spec pasa a ser obligatorio antes de Álamo Alto.

## Datos

Migración `0020_padron`.

```
provider
  id                      uuid pk
  neighborhood_id         uuid fk
  doc                     text not null       -- normalizado: [0-9A-Z], sin puntos ni espacios
  name                    text not null       -- el último que registró la garita
  trade_id                uuid null fk trade  -- el de su último ingreso como proveedor
  insurance_company       text null  check <= 80
  insurance_policy        text null  check <= 40
  insurance_expires_on    date null           -- los tres o ninguno, como hoy
  insurance_source        text null  check in ('garita','link')
  insurance_updated_by    uuid null fk person -- null si vino del link
  insurance_updated_at    timestamptz null
  unique (neighborhood_id, doc)

vehicle
  id                      uuid pk
  neighborhood_id         uuid fk
  plate                   text not null       -- normalizada: [0-9A-Z]
  insurance_company       text not null check <= 80
  insurance_policy        text not null check <= 40
  insurance_expires_on    date not null
  insurance_updated_by    uuid not null fk person   -- siempre un guardia
  insurance_updated_at    timestamptz not null
  unique (neighborhood_id, plate)

contact
  id                      uuid pk
  unit_id                 uuid fk
  kind                    text not null check in ('visita','proveedor')
  name                    text not null check <= 80
  doc                     text null           -- normalizado
  trade_id                uuid null fk trade  -- solo proveedor (check)
  created_by              uuid fk person
  created_at              timestamptz
  index (unit_id, name)

entry_log  (+)
  provider_insurance      text null check in ('no_aplica','sin_cargar','vencido','por_vencer','vigente')
  vehicle_insurance       text null check in ('no_aplica','sin_cargar','vencido','por_vencer','vigente')
  override_by             uuid null fk person -- autorizado igual: quién
  override_reason         text null

neighborhood  (+)
  vehicle_insurance_required   boolean not null default false
  vehicle_insurance_override   boolean not null default true

invitation  (−)
  insurance_company, insurance_policy, insurance_expires_on
```

- **Migración del seguro.** Por cada `guest_doc` normalizado con seguro, se
  crea su `provider` con el seguro que vence más tarde (`insurance_source =
  'link'`, porque no se sabe quién lo cargó). El nombre sale de la invitación
  más reciente. Las invitaciones sin DNI pierden el seguro, y la garita lo
  vuelve a pedir.
- **Filas viejas de `entry_log`:** las columnas nuevas quedan `null`. La
  auditoría muestra "—" (no había foto).
- **Override.** Hoy "Autorizar igual" crea un alta exprés. `override_by` y
  `override_reason` se llenan cuando el ingreso pasó por encima de un seguro
  que faltaba, para que el tablero y el Excel lo encuentren sin parsear
  `audit_log`.

## Normalización

`api/src/lib/padron.ts` (con su espejo `web/src/lib/padron.ts` y su `check.ts`):

- `normalizarDoc('30.123.456')` → `'30123456'`; `'aaa 123 456'` → `'AAA123456'`
  (pasaporte).
- `normalizarPatente('ab-123 cd')` → `'AB123CD'`.
- Se normaliza **todo** lo que entra al padrón y toda búsqueda que se hace en
  él. Lo que se muestra se formatea a partir del valor normalizado.

## Reglas

1. **Seguro del proveedor.** Se pide igual que hoy (rubro con
   `requires_insurance`, y el tipo según `aplicaFranjas`). Se busca en
   `provider` por el DNI **cargado en la garita**, no por el de la invitación.
2. **Seguro del auto.** Si `vehicle_insurance_required` está prendido y hay
   patente, se busca en `vehicle`:
   - no está o está incompleto → `no_vehicle_insurance`;
   - venció → `vehicle_insurance_expired`;
   - sin patente → viene a pie y no se controla.
3. **Por vencer.** Usa `insurance_warn_days` para los dos seguros. Avisa, no
   frena.
4. **Autorizar igual.**
   - Seguro del proveedor: como hoy. El alta exprés no lo controla.
   - Seguro del auto: el alta exprés tampoco lo controla **solo si**
     `vehicle_insurance_override` está prendido. Si está apagado, el alta
     exprés también pide el seguro del auto, y si no está, el auto no entra:
     la persona entra a pie o se carga el seguro.
5. **Carga manual post-corte.** No controla seguros (es retroactiva). Las dos
   columnas de la foto quedan `null`.
6. **Egresos.** No se tocan, como siempre.

## canEnter

- `InvitationLike` suma `vehicleInsurance: 'no_aplica' | 'sin_cargar' |
  'vencido' | 'vigente'`, que resuelve quien llama (patente, switch y padrón;
  "por vencer" llega como `vigente`) y `vehicleOverride: boolean` (el switch).
- Suma `no_vehicle_insurance` y `vehicle_insurance_expired` **al final,
  después del seguro del proveedor**: el seguro de la persona pesa más que el
  del auto, y los dos se arreglan en la barrera.
- `porteria` sigue salteando franjas y seguro del proveedor. Saltea el del
  auto solo si `vehicleOverride` está prendido.
- El seguro del proveedor deja de salir de la invitación. Lo resuelve quien
  llama con el `provider` del DNI cargado.
- Sigue siendo puro, con el orden testeado.

## API

- **`GET /gate/padron?doc=&plate=`** (garita). Devuelve
  `{ provider: { name, insurance } | null, vehicle: { insurance, updatedBy,
  updatedAt } | null, lastPlate: string | null }`. La garita lo llama al
  cambiar el documento o la patente, con 300 ms de espera después de la última
  tecla, y recalcula el veredicto en el front con el mismo `canEnter`. El
  servidor revalida todo al registrar.
- **Registrar ingreso** (endpoint de hoy): acepta `insurance` (proveedor) y
  `vehicleInsurance` opcionales. Dentro de la transacción, después del `FOR
  UPDATE` y antes de `canEnter`:
  - si la invitación es de trabajo (`aplicaFranjas`), hace upsert del
    `provider` (nombre, rubro, y seguro si vino);
  - si vino `vehicleInsurance`, hace upsert del `vehicle`;
  - audita `provider.insurance_updated` y `vehicle.insurance_updated` con
    `{ antes, despues }`;
  - si `canEnter` rechaza, el throw revierte el padrón y su auditoría.

  Después del ingreso se escribe la foto en `entry_log`.
- **`PUT /gate/padron/vehicle/:plate`** y **`PUT /gate/padron/provider/:doc`**:
  "Corregir" sin registrar (el guardia corrige y aprieta Volver). Se auditan
  igual. Los usa también la pantalla Seguros.
- **Alta exprés:** acepta `plate` y `vehicleInsurance` con la misma regla.
- **Link público** (`PATCH /invitations/public/:token`): el proveedor manda
  `doc` + `insurance`.
  - Sin `doc`, responde `400 doc_required`.
  - Con `doc`, hace upsert en `provider` (`insurance_source = 'link'`).
  - Mantiene las reglas de hoy: no borra el seguro y rechaza un vencimiento
    pasado (`seguro_vencido`).
  - El GET público devuelve `insuranceState` y `insuranceExpiresOn` del
    `provider`, **nunca compañía ni póliza**. Si la invitación no tiene DNI,
    devuelve `sin_cargar`. No hay búsqueda por un DNI arbitrario.
- **Invitaciones del vecino:** `POST`/`PATCH /invitations` ya no aceptan
  `insurance`. Mandarlo responde 400 genérico (zod `strict`).
- **Contactos** (vecino, de su UF):
  - `GET /contacts` devuelve los contactos con `insuranceState` y
    `insuranceExpiresOn` si es proveedor y su rubro lo pide. Se cruzan por
    `doc` con `provider`.
  - `POST /contacts`, `PATCH /contacts/:id`, `DELETE /contacts/:id` (borrado
    real). Si el contacto no es de la UF del vecino, responde `404
    contact_not_found`.
  - `POST /invitations` acepta `contactId` opcional, solo para la auditoría.
- **Seguros** (admin y garita): `GET /insurance/vehicles` y
  `GET /insurance/providers`.
  - Filtros: `estado` (vencido, por_vencer, vigente; en proveedores, también
    sin_cargar) y `q`.
  - Orden: por vencimiento ascendente; "sin cargar" va al final.
  - Cada fila trae el último ingreso (fecha, persona, lote) y, en los
    proveedores, los lotes con invitación vigente.
  - Las mismas rutas con `.xlsx` exportan el Excel.
  - El admin solo lee; los `PUT` de Corregir son de la garita (`requireRole`).
- **Barrio:** `GET/PATCH /admin/neighborhood` suma los dos switches.
- **Tablero:** `dashboardKpis` suma `segurosVencidos` (padrón con vencido y un
  ingreso en los últimos 30 días), `segurosPorVencer` (en `insurance_warn_days`,
  o 15 si es null) y `autorizadosSinSeguro` (`entry_log.override_by` no null en
  los últimos 7 días).
- **Auditoría y Excel:** `entriesLog` suma la foto (`provider_insurance`,
  `vehicle_insurance`), el seguro actual del auto y `override_by` y
  `override_reason`.

**Errores nuevos:** `no_vehicle_insurance` y `vehicle_insurance_expired` (409),
`override_not_allowed` (403), `contact_not_found` (404) y `doc_required` (400).

## Pantallas

Mockups en `.superpowers/brainstorm/8-1792885331/content/`:
`vecino-contactos.html` (A + B), `garita-secciones.html` y
`seguros-admin.html`.

**Vecino** (mobile-first)
- "Nueva invitación" abre la hoja *¿A quién invitás?*: buscador, "+ Alguien
  nuevo" y los contactos agrupados en Visitas y Proveedores. En los
  proveedores se ve el estado del seguro en una línea ("Seguro hasta 03/2027"
  o "Seguro vencido").
  - Elegir un contacto abre el formulario completo: arriba, una tarjeta del
    contacto con "Cambiar". Quedan la fecha y la nota.
  - "Alguien nuevo" abre el formulario de hoy, con el tilde "Guardar en
    contactos" al final.
- Pestaña "Contactos" en la barra (Invitaciones · Contactos · Historial ·
  Perfil):
  - Filtros Todos / Visitas / Proveedores y buscador por nombre o DNI.
  - "Invitar" en cada contacto, y "+ Agregar contacto".
  - Tocar un contacto lo edita; borrarlo pide confirmación.
  - Un contacto visita tiene nombre y DNI; un proveedor, nombre, DNI y rubro.
- El formulario ya no tiene el bloque del seguro. Si el rubro lo pide, se ve
  la nota "Lo carga él desde su link o la guardia en la entrada."

**Link del invitado**
- Proveedor de un rubro que pide seguro: bloque "Tu seguro".
  - Con un seguro vigente: "Vence el 12/03/2027" y el botón "Actualizar".
  - Sin seguro: los tres campos, y el DNI pasa a ser obligatorio.
- Visita: como hoy.

**Garita** (desktop-first, una pantalla)
- La ficha de la derecha se divide en tres secciones con título:
  **Visitante** (o **Proveedor**, según el tipo), **Vehículo** e
  **Invitación**. Las que controlan un seguro muestran su estado al lado del
  título ("Seguro vigente", "Falta el seguro", "Vencido", "Vence en 5 días").
  - Visitante/Proveedor: documento (editable), tipo y rubro, seguro.
  - Vehículo: patente (editable, con la sugerencia "Última vez: AB 123 CD"),
    seguro.
  - Invitación: lote y quién invita, vigencia, cupo, nota, entró y salió.
- Un seguro cargado se muestra como texto, con "Corregir" en el título de su
  sección. Al tocarlo, los campos se abren completos. Si falta o venció, los
  campos aparecen abiertos.
- La acción principal es "Registrar ingreso", o "Guardar seguro y registrar
  ingreso" si hay algo para guardar. Enter registra, como hoy.
- NO PASA por el auto: "Viene a pie" (borra la patente y recalcula) y
  "Autorizar igual…", solo si el switch lo permite.
- Alta exprés: suma patente y seguro del auto.
- Nav: Garita · Auditoría · **Seguros**.

**Seguros** (garita y admin)
- Pestañas Vehículos y Proveedores, buscador, filtros con conteo
  (Vencidos / Por vencer / Vigentes, y Sin cargar en Proveedores), "Exportar a Excel".
- Vehículos: patente · seguro (compañía y póliza) · vence · estado · último
  ingreso (persona, lote, "autorizado sin seguro") · cargado por.
- Proveedores: nombre y DNI · rubro (`provider.trade_id`) · seguro ·
  vence · estado · trabaja en (lotes con invitación vigente) · cargado por
  (guardia, o "Él, desde su link").
- La garita corrige desde una hoja lateral; el admin solo mira.

**Admin**
- Barrio → Alertas: "Pedir seguro del auto" y "Permitir Autorizar igual sin
  seguro del auto" (el segundo, deshabilitado si el primero está apagado).
- Tablero → Atención: "Seguros vencidos", "Vencen en N días" y "Autorizados
  sin seguro (7 días)". Cada uno lleva a Seguros o a Auditoría filtrada.
- Auditoría:
  - La fila marca "auto sin seguro", "autorizó igual".
  - El panel de detalle suma la sección **Vehículo** (patente, seguro actual,
    estado al ingresar) y el estado del seguro al ingresar en Proveedor.
  - Filtro nuevo: "Autorizados sin seguro".
- Excel de auditoría: columnas *Seguro auto*, *Vence auto*, *Estado seguro
  auto (al ingresar)*, *Estado seguro proveedor (al ingresar)*, *Autorizado
  igual por* y *Motivo*.

Los textos van en voseo y los colores salen de los tokens de `globals.css`.
Los títulos de sección sobre NO PASA y PASA tienen que cumplir contraste AA:
en el mockup, con `opacity: .7`, no llegan.

## Fases

| # | Fase | Despliegue |
|---|---|---|
| 1 | API del padrón: tablas, migración, normalización, `canEnter`, `/gate/padron`, registrar con upsert y foto, link público, switches | junto con la 2 |
| 2 | Web de la garita: secciones, Corregir, búsqueda en vivo, alta exprés, link del proveedor, switches en Barrio | junto con la 1 |
| 3 | Contactos: API y web (hoja + pestaña), formulario sin seguro | sola |
| 4 | Seguros y reportes: pantalla Seguros, tablero, auditoría, Excel | sola |

"Pedir seguro del auto" arranca apagado. Un barrio que se actualiza no
empieza a frenar autos hasta que el admin lo decide.

Un plan por fase, de menos de 300 líneas cada uno.

## Demo

`demo.sql` suma:
- `vehicle_insurance_required = true`;
- cuatro autos: uno vigente, uno que vence en 5 días, uno vencido y uno sin
  cargar;
- el seguro del gasista y del albañil pasado al padrón;
- tres contactos en un lote: dos visitas y un proveedor;
- un ingreso autorizado sin seguro del auto.

## Pruebas

- **`canEnter`:**
  - el seguro del proveedor gana sobre el del auto;
  - sin patente pasa;
  - con el switch apagado pasa;
  - alta exprés con y sin `vehicleOverride`;
  - vence hoy pasa.
- **Normalización:** tests en API y `padron.check.ts` en web.
- **Servicios:**
  - la migración se queda con el seguro que vence más tarde;
  - Corregir en el ingreso se revierte si `canEnter` rechaza;
  - la foto en `entry_log` no cambia cuando cambia el padrón;
  - el GET público no devuelve compañía ni póliza;
  - `doc_required`;
  - una UF no ve ni edita los contactos de otra;
  - `override_not_allowed`;
  - el orden y los filtros de `/insurance/*`;
  - los KPIs nuevos.
- **E2E:**
  - la garita frena un auto sin seguro, lo carga, registra, y en el segundo
    ingreso pasa sin pedirlo;
  - el vecino guarda un contacto e invita desde la hoja;
  - el admin filtra Vencidos en Seguros y exporta.

## Fuera de alcance

- Retención y borrado del padrón (Ley 25.326): spec propio, antes de Álamo
  Alto.
- Seguro por empresa (una póliza para varios empleados), ART, CUIT.
- VTV, foto del certificado, validación contra la aseguradora.
- Autos de los vecinos.
- Bloquear una persona o una patente.
- Teléfono en el contacto y envío directo por WhatsApp.
