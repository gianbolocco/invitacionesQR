# Auditoría de calidad — octubre 2026

Rama `auditoria`, desde `dev` en `5822f2a`. Todo lo que figura acá se verificó
leyendo el código; lo marcado **[probado]** se reprodujo además con un test o
con `EXPLAIN ANALYZE`.

Las mediciones de performance salen de una copia descartable de la base de
desarrollo (`auditoria_perf`) con volumen sintético: 20 000 invitaciones,
200 000 ingresos y 400 proveedores en el padrón, o sea unos dos años de un
barrio de 150 a 300 lotes.

Los puntos marcados **Decisión tuya** cambian algo que el usuario ve, o una
regla del README. No se tocan sin tu ok.

---

## Crítico

### C1. Un link de alta viejo sirve para quedarse con una cuenta ya activa [probado]

- **Dónde:** `api/src/services/auth.ts:34` (`consumeToken`) y
  `api/src/services/people.ts:223` (`inviteLink`) / `:206` (`resendInvite`).
- **Escenario:** el admin le reenvía el mail a un vecino y además le copia el
  link por WhatsApp (son dos tokens distintos, los dos válidos 7 días). El
  vecino se da de alta con el del mail. Quien tenga el de WhatsApp (un grupo,
  un celular prestado, un reenvío) hace `POST /auth/invite` con su token
  dentro de la semana: responde **200**, le pone una contraseña nueva a la
  cuenta, cierra todas las sesiones del vecino y queda logueado como él. La
  contraseña del dueño deja de andar (401). `consumeToken` solo exige que la
  cuenta no esté deshabilitada; `active` pasa.
  Lo mismo con dos tokens de reset pedidos seguidos.
- **Arreglo:** en `setPassword` (por donde pasan alta, reset y reset del admin),
  marcar como usados todos los tokens pendientes de la persona. Es lo mismo que
  ya hace `crearAdmin` al reemitir.
- **Riesgo:** bajo. Un segundo link deja de servir apenas se usó el primero,
  que es lo esperado.
- **Test:** dos links, se usa uno, el otro da `invalid_token`.

---

## Importante

### I1. El admin puede cambiarle la contraseña a cualquiera [probado]

- **Dónde:** `api/src/routes/admin.ts:109` → `api/src/services/people.ts:230`
  (`setGuardPassword`).
- **Escenario:** `POST /admin/people/<id de un vecino o de otro admin>/password`
  responde 200. El admin entra como ese vecino (y ve las invitaciones de su
  casa) o como el otro admin, y la auditoría dice que actuó la víctima. Además
  pone `status: 'active'`: le devuelve el acceso a un vecino dado de baja sin
  pasar por `enablePerson`.
- **Arreglo:** que `setGuardPassword` rechace si la persona no es guardia
  (`409 no_es_guardia`). La pantalla solo lo ofrece para guardias, así que no
  cambia nada visible.
- **Decisión tuya:** ¿cambiar la contraseña de un guardia **dado de baja** lo
  tiene que reactivar (como hoy) o rechazar con `deshabilitada`, como el resto?
- **Riesgo:** bajo.
- **Test:** vecino y admin dan 409; guardia sigue andando.

### I2. El login deja saber qué mails y usuarios existen [probado]

- **Dónde:** `api/src/routes/auth.ts:108`.
- **Escenario:** con un mail que no existe el login responde en ~3 ms; con uno
  que existe tarda ~37 ms, porque recién ahí corre argon2. El cuerpo es el mismo,
  pero el tiempo dice quién está en el padrón. El límite de 30 intentos por IP
  cada 15 minutos lo frena, pero no lo impide: alcanza para probar los mails de
  una lista corta, o se reparte entre varias IP.
- **Arreglo:** si no hay persona (o no tiene contraseña), verificar contra un
  hash fijo calculado una vez al arrancar, y recién después responder 401.
- **Riesgo:** bajo. El login fallido tarda lo mismo que el bueno.
- **Test:** con un `vi.spyOn` sobre `verifyPassword`, que se llame también para
  un mail inexistente.

### I3. CSRF desde otro subdominio de pazzit.com [probado]

- **Dónde:** `api/src/app.ts:29` (no hay chequeo de origen) y
  `api/src/services/sessions.ts` (`SameSite=Lax`).
- **Escenario:** `SameSite=Lax` frena a otro *sitio*, pero `qa.pazzit.com`, la
  landing `pazzit.com` y cada barrio en su subdominio son el **mismo sitio**. Una
  página en cualquiera de ellos (un XSS en la landing, otro despliegue) puede
  hacer `fetch(…, { method: 'POST', credentials: 'include' })` sin
  `Content-Type: application/json`: no hay preflight, la cookie viaja y el
  servidor ejecuta. Probado: `POST /invitations/:id/revoke` con
  `Origin: https://otro.pazzit.com` y `text/plain` → **200**, invitación anulada.
  Alcanza a todo POST que no necesita body: logout, anular/restaurar, dar de
  baja y reactivar personas, deshacer un movimiento, pedir un link de alta.
- **Arreglo:** un middleware que, en todo lo que no sea GET/HEAD, rechace con
  403 si el navegador declara `Sec-Fetch-Site` distinto de `same-origin`, o si
  manda un `Origin` distinto de `WEB_ORIGIN`. Sin ninguno de los dos headers (curl,
  supertest) pasa: no es un navegador, no hay cookie que robar.
- **Riesgo:** medio. En desarrollo la web (`:3000`) y la API (`:8080`) son
  orígenes distintos: hay que aceptar `Origin = WEB_ORIGIN` además de
  `same-origin`. El e2e lo cubre.
- **Test:** Origin ajeno → 403; Origin = WEB_ORIGIN → pasa; sin headers → pasa.

### I4. La pantalla Seguros tarda 22 segundos [probado]

- **Dónde:** `api/src/services/seguros.ts:71` (`listarProveedores`, el `left join
  lateral` de `:92`) y `:36` (`listarVehiculos`, `:49`). El mismo patrón en
  `api/src/services/padron.ts:63` (`ultimaPatente`) y en el KPI
  `segurosVencidos` (`api/src/services/reports.ts:74`).
- **Escenario:** por cada fila del padrón, el último ingreso se busca con
  `upper(regexp_replace(guest_doc …)) = pr.doc`, que no tiene índice: un *seq
  scan* de `entry_log` entero por proveedor. Con 400 proveedores y 200 000
  ingresos: **21 998 ms** (406 scans de 200 000 filas). El Excel hace la misma
  consulta. `ultimaPatente` corre en **cada recálculo del veredicto** (cada vez
  que el guardia cambia el DNI): 26 ms con ese volumen, y crece lineal.
  El código ya lo anota como `ponytail:`.
- **Arreglo:** una migración con índices de expresión, con la misma expresión
  que `docSql`:
  `entry_log (upper(regexp_replace(coalesce(guest_doc,''),'[^0-9A-Za-z]','','g')), entered_at desc)`,
  lo mismo para `plate`, y para `invitation.guest_doc`. Y usar `docSql()` en
  esas consultas en vez de la expresión copiada a mano (ver M12), para que
  sigan pegándole al índice.
- **Riesgo:** bajo. Son índices nuevos, no cambian datos; el `CREATE INDEX`
  bloquea escrituras en `entry_log` lo que tarde en construirse (segundos).
- **Medición:** antes/después con `EXPLAIN ANALYZE` en `auditoria_perf`.

### I5. La auditoría agrega todo `entry_log` en cada página [probado]

- **Dónde:** `api/src/services/entries.ts:860` (`auditRows`, los CTE `uso` y
  `ultimo`) y `:823` (`auditCounts`, el CTE `uso`).
- **Escenario:** pedir la primera página de los últimos 7 días agrupa y ordena
  los 200 000 ingresos de toda la historia, para quedarse con los de 409
  invitaciones: 177 ms las filas + 32 ms los contadores. Crece con cada ingreso,
  para siempre, y corre cada vez que alguien cambia un filtro o una página.
- **Arreglo:** mover `uso` y `ultimo` a `left join lateral` por invitación (ya
  hay índice en `entry_log.invitation_id`), así solo se leen los ingresos de las
  invitaciones que pasan el filtro.
- **Riesgo:** medio: es la consulta más larga del sistema. `audit.test.ts` y el
  e2e cubren estados, contadores y el último ingreso.

### I6. Una fecha imposible en la agenda o la auditoría da 500 [probado]

- **Dónde:** `api/src/routes/gate.ts:178` (`/agenda`) y `:194` (`auditFilters`,
  que usan `/audit` y `/audit.xlsx`).
- **Escenario:** `GET /gate/agenda?date=2026-02-30`, `/gate/audit?from=2026-13-01`
  o `/gate/audit.xlsx?to=2026-02-31` → **500**. El regex `\d{4}-\d{2}-\d{2}`
  deja pasar la fecha y Postgres la rechaza. Encima el 500 imprime en el log la
  consulta con todos sus parámetros (ver M2).
- **Arreglo:** usar el `isoDate` de `routes/invitations.ts`, que ya resuelve
  esto (exportarlo y reusarlo).
- **Riesgo:** bajo. Da 400 en vez de 500.

### I7. Campos sin tope de largo, y uno que rompe el ingreso [probado]

- **Dónde:** `api/src/routes/invitations.ts:66` (`createSchema`: `guestName`,
  `guestDoc`, `plate`, `capacity`) y `:132` (`editSchema`);
  `api/src/routes/gate.ts:63` (alta exprés), `:86` (`/entries`: `guestName`,
  `guestDoc`, `note`), `:50` (`/search`: `q`); `api/src/routes/admin.ts:68`
  (`POST /people`: `name`, `email`).
- **Escenario:** un vecino crea una invitación con un nombre de 60 000
  caracteres y cupo 1 000 000 000: **201**. Ese nombre después va a la agenda, a
  la auditoría y al Excel (una celda de Excel admite 32 767). Peor: un DNI de más
  de 40 caracteres en una invitación que salió de un contacto hace que el
  ingreso falle con 500, porque `completarDocContacto` lo copia al contacto y
  `contact_doc_ck` lo rechaza: el guardia no puede registrar a esa persona.
- **Arreglo:** los mismos topes que ya usan el link público y los contactos:
  nombre 120, documento 40, patente 20, nota de ingreso 200, búsqueda 80, cupo
  hasta 999 (el front manda 999 para una frecuente), nombre de persona 160 y
  mail 254 (como el import CSV).
- **Riesgo:** bajo. El front ya no permite nada más largo; reviso los
  `maxLength` antes de cerrar.
- **Test:** 400 con nombre de 121 y con cupo 1000.

### I8. El Excel de auditoría corta en silencio

- **Dónde:** `api/src/services/reports.ts:206` (`limit 1000` de `entriesLog`) y
  `api/src/services/entries.ts:788` (tope de 5000 de `auditAll`).
- **Escenario:** un rango con 1500 ingresos exporta la hoja Ingresos con 1000
  filas, y la portada dice "Ingresos registrados: 1000" (`api/src/routes/gate.ts:288`).
  Quien lo usa para un reclamo cree que tiene todo.
- **Arreglo:** dos opciones.
  (a) Subir el tope de la hoja Ingresos a 20 000 (lo que pesa un Excel normal) y
  que la portada diga "primeros N de M" si se corta.
  (b) Solo el aviso en la portada.
- **Decisión tuya:** cuál de las dos.
- **Riesgo:** bajo.

### I9. `npm audit`: dos vulnerabilidades en runtime de la API

- **Dónde:** `api/package-lock.json`.
- **Escenario:** `body-parser 2.3.0` (lo trae `express.json()`, que infla
  cuerpos gzip): DoS con bytes de sobra después de un cuerpo comprimido
  (GHSA-27r3-jxmh-p828). `zod 4.6.5`: puede agotar la memoria validando
  colecciones grandes con tope (GHSA-mrhx-c7xc-m3w5). La web: 0 vulnerabilidades.
- **Arreglo:** `npm audit fix` (solo el lockfile, versiones dentro del rango).
- **Riesgo:** bajo.

---

## Menor

### M1. `/auth/forgot` limita por mail y no por IP

- **Dónde:** `api/src/routes/auth.ts:117`.
- **Escenario:** desde una IP se puede pedir reset para mil mails distintos (tres
  cada uno): son mil mails salientes por Resend a cuenta del barrio. Y cualquiera
  puede gastar los tres intentos de un vecino, que se queda 15 minutos sin poder
  pedir el suyo.
- **Arreglo:** sumar un límite por IP (como el login), p. ej. 10 cada 15 minutos.
- **Riesgo:** bajo.

### M2. Los logs de producción llevan datos personales

- **Dónde:** `api/src/lib/errors.ts:40` (`console.error(err)`),
  `api/src/lib/mail.ts:30`, `api/src/services/people-import.ts:192`.
- **Escenario:** un 500 de una consulta imprime el error de Drizzle con
  `params: [...]`: DNI, patente, nombre, hash de token (lo vi en el 500 de I6).
  Los mails aceptados por Resend se loguean con la dirección. Ningún log imprime
  contraseñas, tokens en claro ni links de alta en producción (el de consola de
  `mail.ts` está bloqueado con `NODE_ENV=production`).
- **Arreglo:** en el handler genérico, loguear `message`, `cause.message` y
  `cause.code`, sin `params`. Dejar el mail como está o loguear solo el id de
  Resend.
- **Riesgo:** bajo. Se pierde detalle para depurar un 500; el código de Postgres
  y el mensaje alcanzan casi siempre.

### M3. Búsquedas que no escapan `%` y `_`

- **Dónde:** `api/src/services/entries.ts:483` (búsqueda de la garita),
  `api/src/services/invitations.ts:335` (historial), `api/src/services/units.ts:116`
  (unidades del alta exprés).
- **Escenario:** buscar `_` o `%` devuelve todo (hasta 20 resultados de la garita,
  o el historial entero). La auditoría y Seguros ya los escapan
  (`comoTexto`, `patron`), estas tres no.
- **Arreglo:** un helper `comoTexto` en `lib/` y usarlo en las cinco.
- **Riesgo:** bajo.

### M4. La auditoría no encuentra "Martín" buscando "martin"

- **Dónde:** `api/src/services/entries.ts:812`.
- **Escenario:** la garita y el historial del vecino buscan el nombre con
  `unaccent`; la auditoría no. "martin" encuentra a Martín en la garita y no en la
  auditoría.
- **Arreglo:** `unaccent(i.guest_name) ilike unaccent(…)`, y lo mismo con quién
  invita.
- **Decisión tuya:** cambia resultados de búsqueda (para mejor).
- **Riesgo:** bajo.

### M5. Carreras chicas entre leer y escribir

- **Dónde y escenario:**
  - `api/src/services/entries.ts:435` (`undoMovement`): el guardia A deshace un
    ingreso de hace 2 minutos en el mismo instante en que el guardia B le
    registra la salida. A leyó la fila sin salida y la borra entera: la salida de
    B desaparece sin auditoría propia.
  - `api/src/services/invitations.ts:388` (`revokeInvitation`) y `:594`
    (`editInvitation`): miran si hay alguien adentro o algún ingreso y después
    escriben, sin lock. Un ingreso que entra en el medio deja una invitación
    anulada con el invitado adentro, o editada después de usada.
  - `api/src/services/units.ts:79` (`setPersonLot`): borra las UF y después
    inserta, fuera de transacción; si el insert falla, el vecino queda sin lote.
- **Arreglo:** condiciones en el propio `UPDATE`/`DELETE` (`where exited_at is
  null`, `where not exists (…)`) o el mismo `FOR UPDATE` sobre la invitación que
  usa `registerEntry`; `setPersonLot` en una transacción.
- **Riesgo:** bajo.

### M6. Dos garitas pueden registrar dos ingresos abiertos de la misma frecuente

- **Dónde:** `api/src/services/entries.ts:179` (`registerEntry`). El comentario de
  `:130` dice "el servidor valida igual por si el dato quedó viejo", y para el
  ingreso no es cierto.
- **Escenario:** una frecuente (cupo 999) llega; dos guardias la escanean a la
  vez, los dos ven "no está adentro" y los dos registran ingreso. Quedan dos filas
  abiertas, "Adentro" la muestra una vez y el egreso cierra solo la última: la
  otra queda abierta para siempre y cuenta en "lleva más de 12 h" del tablero.
- **Arreglo:** dentro de la transacción, después del `FOR UPDATE`, si hay fila
  abierta responder `409 ya_adentro`.
- **Decisión tuya:** cambia un comportamiento (el segundo escaneo simultáneo
  rebota en vez de duplicar).
- **Riesgo:** bajo.

### M7. Cada escritura del barrio refresca todas las garitas

- **Dónde:** `web/src/lib/queries/garita.ts:64` (`useAvisosGarita`) y
  `api/src/lib/avisos.ts`.
- **Escenario:** cada POST/PATCH bajo `/admin`, `/invitations` y `/gate` —incluido
  el invitado completando su DNI en el link o el admin cambiando el logo— invalida
  todo `['garita']` en cada garita abierta: agenda, "Adentro" y el veredicto que
  el guardia tiene en pantalla. En un sábado con un evento, son ráfagas de tres
  consultas por garita por cada invitación creada.
- **Arreglo:** juntar los avisos (refrescar como mucho una vez por segundo) y no
  invalidar el veredicto en vivo, que ya se recalcula con lo tipeado.
- **Riesgo:** bajo.

### M8. `searchUnits` muestra vecinos dados de baja

- **Dónde:** `api/src/services/units.ts:116`.
- **Escenario:** en el alta exprés, el guardia busca "Pérez" y aparece el Pérez que
  se mudó y el admin dio de baja, como si viviera en ese lote.
- **Arreglo:** filtrar `people.status <> 'disabled'`.
- **Decisión tuya:** cambia lo que ve el guardia (para mejor).
- **Riesgo:** bajo.

### M9. Código muerto (verificado a mano sobre lo que reporta `knip`)

- `api/src/middleware/uuidParam.ts:26`: `esUuid`, sin uso.
- `web/src/components/dominio/campo-hora.tsx`: archivo entero sin uso (la planilla
  usa su propio `CampoHoraTexto`).
- `web/package.json`: `date-fns` no se importa en ningún lado.
- `web/src/lib/invitations.ts:3`: re-exporta `hoyISO` y `fechaCorta`, que todos
  importan de `fechas`.
- `web/src/app/globals.css:146-147,161,197,221`: `--talon-fondo`, `--talon-qr` y
  `--sombra-pase` no los usa nadie.
- No se tocan: los exports sin uso de `components/ui/*` (shadcn, se usan al sumar
  componentes), `--color-card-foreground` (mapeo de shadcn), `@emnapi/*` (entraron
  con Tailwind v4 en `7f398b8`, probablemente para `npm ci` en Windows; sin
  certeza, mejor no tocar), y los exports que solo se usan en el mismo archivo.
- **Riesgo:** bajo.

### M10. Columnas que nadie lee (anotadas, no se borran)

- `session.user_agent` (`api/src/db/schema.ts:295`): se escribe en cada login,
  ninguna pantalla ni consulta la lee. Es un dato personal guardado de más.
- `session.last_seen_at` (`:297`): solo se lee para decidir si se vuelve a
  escribir.

### M11. Índice que existe en la base y no en `schema.ts`

- `entry_open_idx` (`entry_log(invitation_id) where exited_at is null`) lo crea a
  mano `api/drizzle/0004_egresos.sql:8`, pero no está en `schema.ts` ni en el
  snapshot. Lo usa "Adentro". Un `drizzle-kit push` lo borraría; un `generate` no.
- **Arreglo:** anotarlo en `schema.ts` con un comentario. Declararlo con
  `.where()` haría que el próximo `generate` intente crearlo de nuevo.

### M12. La normalización del DNI y la patente está copiada a mano en SQL

- **Dónde:** `api/src/services/entries.ts:937-939`, `api/src/services/seguros.ts:57,84,99`,
  `api/src/services/reports.ts:78,83`.
- **Escenario:** `lib/padron.ts` dice "toda búsqueda en el padrón pasa por acá",
  pero seis consultas repiten la expresión en texto. Si `normalizarDoc` cambia (por
  ejemplo, para aceptar la Ñ), la garita y la auditoría dejan de cruzar con el
  padrón sin que falle ningún test.
- **Arreglo:** `docSql()` en esas seis. Va junto con I4: la expresión tiene que
  ser idéntica a la del índice.
- **Riesgo:** bajo.

### M13. Documentación que describe algo que ya cambió

- `README.md:292`: apunta a `web/src/components/shell.tsx` y `web/src/lib/nav.ts`,
  que no existen.
- `README.md:319`: "qa en buscadores" figura como pendiente, pero el
  `X-Robots-Tag` por `NOINDEX` ya está (`7d2d9b3`). Falta confirmar que qa tenga
  `NOINDEX=1` cargado en Coolify.
- `api/src/services/entries.ts:130`: ver M6.

### M14. Imágenes sin tamaño

- `web/src/components/dominio/marca.tsx:39` (logo del barrio) y
  `web/src/components/dominio/plano-barrio.tsx:29,51` (plano): sin `width`/`height`,
  el contenido salta cuando cargan. El logo va en un contenedor de alto fijo, así
  que solo salta en ancho; el plano empuja todo lo de abajo en la página del
  invitado.
- **Arreglo:** `aspect-ratio` o el tamaño real del archivo, que la API puede
  devolver con la marca.
- **Riesgo:** bajo; va a Ideas si pide tocar la API.

---

## Datos personales (Ley 25.326, no se implementa)

- `audit_log.meta` guarda para siempre el DNI, la patente y el nombre de cada
  ingreso deshecho (`entry.undone`) y el DNI de cada cambio de seguro
  (`provider.insurance_updated`). La retención que falta en el README tiene que
  incluir esta tabla, no solo `entry_log` y el padrón.
- `session.user_agent` (M10) y los logs con parámetros (M2).
- Un vecino puede ver estado y vencimiento del seguro de cualquier DNI: lo carga
  en un contacto de proveedor (`api/src/services/contacts.ts:40`) o en su propia
  invitación y abre el link (`api/src/services/invitations.ts:431`). Es lo que la
  spec del padrón acepta para los contactos; la frase "no hay búsqueda por un DNI
  arbitrario" de la spec no es del todo cierta, porque la invitación del vecino se
  edita libremente mientras está pendiente. No sale compañía ni póliza.

---

## Revisado, sin hallazgos

- **Roles:** cada router chequea el suyo (`admin`, `reports`: admin; `gate`,
  `insurance`: guardia o admin; correcciones de seguro: solo guardia).
  `/invitations` y `/contacts` no piden rol, pero todo pasa por la membresía de
  la UF (`assertMemberOfUnit`, `propio`).
- **IDOR:** invitaciones, contactos, `contactId` (se valida contra la UF),
  rubros (se validan contra el barrio), entradas, padrón. Los servicios que no
  filtran por barrio lo hacen a propósito (un despliegue es un barrio) y lo dicen.
- **Link público:** token de 128 bits (no se enumera); expone lo que acepta el
  comentario de `findPublicByToken`, nunca mail, compañía ni póliza; solo escribe
  DNI y patente si están vacíos y el seguro con las reglas de la spec. El límite
  de escritura por token alcanza.
- **Plano SVG:** se sirve con `Content-Security-Policy: sandbox`, `nosniff` y
  siempre en `<img>`; `?lote=` solo acepta dígitos, así que no se inyecta CSS ni
  marcado. El logo solo acepta PNG/JPEG por firma de bytes.
- **Excel:** ExcelJS escribe `=…`, `+…` y `@…` como texto compartido, nunca como
  fórmula (verificado en el XML generado). El import CSV tiene tope de 1 MB y
  1000 filas, y no ejecuta nada.
- **Cookies y sesiones:** `httpOnly`, `Secure` en producción, `SameSite=Lax`;
  token en SHA-256; cambiar la contraseña revoca todas; una baja corta la sesión
  en el request siguiente.
- **argon2:** argon2id con los parámetros por defecto (64 MiB, t=3, p=4).
- **Reset:** token de un uso, 15 minutos, misma respuesta exista o no la cuenta,
  mail sin `await` para no filtrar por tiempo.
- **Headers:** HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y
  `Permissions-Policy` en Caddy; CSP con nonce en `proxy.ts`. CORS de la API con
  un solo origen.
- **Hora de Buenos Aires:** ningún cálculo de día con la hora local fuera de
  `dates.ts`/`fechas.ts` (los `new Date()` que quedan son instantes, o formatean
  una fecha ya resuelta).
- **Errores del front:** todos los códigos que el front traduce los sigue
  emitiendo la API. Los que no traduce caen en un mensaje genérico razonable.
- **Bundle de la garita:** `html5-qrcode` (376 KB) solo carga en
  `/garita/escanear`.
- **Agenda del día:** 1,6 ms con 200 000 ingresos; usa `invitation_unit_idx` y
  `entry_invitation_idx`. "Adentro" usa `entry_open_idx`.

## Para verificar

- Las consultas con `db.execute` devuelven los timestamps como
  `2026-10-25 19:20:05.990149+00` (espacio y `+00`), no ISO. Chrome los parsea;
  falta probar Safari de iPhone, que con ese formato históricamente da
  `Invalid Date`. Afecta a la agenda, "Adentro", la auditoría y Seguros. No lo
  pude probar: Playwright no tiene WebKit instalado acá.

## Ideas (fuera de alcance)

- Contraseña mínima de 6 caracteres: es corta para un admin.
- Rate limit en Postgres si algún día hay más de una réplica (ya anotado como
  `ponytail:`).
- `web/src/app/(garita)/garita/invitacion/[id]/page.tsx` tiene 632 líneas. Se
  lee bien por secciones y no hay un beneficio claro en partirlo ahora.
- Las imágenes de la API y la web corren como root y con las devDependencies
  adentro.
- Base propia para el e2e (ya está en Pendiente del README).
