# Paquetes y avisos al vecino: diseño

Estado: diseñado (28/10), sin implementar. Es el spec B; el A (pase de delivery)
ya está en `dev`. Este spec trae el primer canal para avisarle algo al vecino
(web push + aviso en vivo con la app abierta) y lo estrena con los paquetes.

## Problema

Llega un paquete a la garita y el guardia tiene que llamar a la casa o mandar un
WhatsApp desde su celular. Si no atienden, el paquete queda en la garita y el
vecino no se entera. Pazzit hoy no tiene forma de avisarle nada al vecino: el
único canal es el mail, que se usa para el alta y el reset de contraseña.

## Qué hacen otros

- **Tusvecinos**: registro de paquetes con aviso de recepción (pensado para edificios).
- **OpenKey, AccessIn, CountrySafe**: notificaciones push del barrio; ninguno
  que hayamos visto avisa paquetes en un barrio cerrado.

## Decisiones

1. **Canal**: web push + aviso en vivo con la app abierta. Sin mail por ahora
   (decisión del dueño). WhatsApp queda para después (ver *Fuera de este
   spec*): el dueño inicia el trámite de Meta en paralelo.
2. **El guardia carga el lote y una nota opcional** (hasta 80 caracteres).
   Sin empresa (el envoltorio muchas veces no la dice) y sin foto.
3. **Se avisa a todos los vecinos activos de la unidad**, como las invitaciones.
4. **No se registra el retiro**: solo el aviso.
5. **Deshacer por 5 segundos**: el aviso sale a los 5 s de cargarlo. Después
   no se corrige.
6. **Al instante**: con la app abierta, el aviso aparece sin refrescar.
7. **El vecino ve los paquetes de los últimos 30 días**, en una tarjeta del
   inicio (no una pestaña nueva). Es lo que ve quien no activó el push.
8. **El admin prende o apaga la feature** (*Configuración → Garita*). Por
   defecto, prendida.

## Datos

`package`:

- `id`, `unit_id` (FK), `note text` (null o 1–80 caracteres, check),
  `created_by` (FK person, el guardia), `created_at`.
- `notify_at timestamptz` = `created_at + 5 s`.
- `notified_at timestamptz` null hasta que sale el aviso.
- `canceled_at timestamptz` null salvo que se deshizo. Check: no puede tener
  `notified_at` y `canceled_at` a la vez.
- Índice `(unit_id, created_at)`.

`push_subscription`:

- `id`, `person_id` (FK, on delete cascade), `endpoint text` único,
  `p256dh text`, `auth text`, `created_at`.
- Una persona puede tener varias (celular y compu).

`person`:

- `packages_seen_at timestamptz` null: los paquetes posteriores son "sin ver".

`neighborhood`:

- `packages_enabled boolean not null default true`.

## API

Garita (`requireRole('guard')`, como el resto de `/gate`):

- `POST /gate/packages { unitId, note? }` → 201 `{ id, notifyAt }`. Valida que
  la unidad sea del barrio. Con la feature apagada: `403 paquetes_apagados`.
- `POST /gate/packages/:id/cancel` → 200. Si ya se avisó: `409 ya_avisado`.
  Si ya estaba deshecho: 200 (idempotente).
- Los últimos movimientos de la garita suman los paquetes avisados del día
  (tipo "Paquete", lote, nota, hora).

Vecino (sesión):

- `GET /packages` → los de sus unidades, avisados y no deshechos, de los
  últimos 30 días, más nuevos primero, con `sinVer` según `packages_seen_at`.
- `POST /packages/seen` → `packages_seen_at = now()`.
- `POST /push/subscriptions { endpoint, keys: { p256dh, auth } }` → alta o
  reemplazo por `endpoint` (upsert, y el endpoint pasa a la persona actual).
- `DELETE /push/subscriptions { endpoint }` → baja.
- `GET /push/public-key` → la clave VAPID pública.
- `GET /events` → SSE con la sesión por cookie. Manda `package` cuando avisa
  un paquete de una unidad de la persona, y un comentario cada 25 s para que
  Caddy no corte la conexión.

Admin: `PATCH /admin/neighborhood { packagesEnabled }`; `GET` lo devuelve.

## El aviso

`services/avisos.ts` decide y despacha; los paquetes solo lo llaman:

```
avisarPaquete(packageId)
  → si canceled_at o notified_at: no hace nada
  → marca notified_at (en la misma transacción que lee la fila, FOR UPDATE)
  → destinatarios: vecinos activos de la unidad
  → por cada uno, en paralelo:
      SSE: evento 'package' a sus conexiones abiertas
      push: a cada suscripción (404/410 → se borra; otro error → log, sigue)
```

- **Cuándo**: al crear el paquete se programa `setTimeout(avisarPaquete, 5 s)`.
  Al arrancar, la API busca los `notify_at <= now()` sin `notified_at` ni
  `canceled_at` y los avisa. `ponytail:` timer en memoria, alcanza con un
  proceso por barrio; con varias réplicas, pasar a una cola o `pg` LISTEN/NOTIFY.
- **SSE**: un mapa en memoria `personId → conexiones`. Mismo techo que el timer.
- **Push**: librería `web-push` con claves VAPID. Payload:
  `{ titulo: 'Llegó un paquete', cuerpo: 'Lote 12 · caja grande', url: '/' }`.
- Si la feature está apagada no se puede crear un paquete, así que no hay nada
  que avisar. Los ya avisados siguen en la lista del vecino.

## Web

**Service worker** `web/public/sw.js` (archivo estático, sin librerías):

- `push`: si hay alguna ventana de la app visible (`clients.matchAll`), no
  muestra la notificación del sistema (el SSE ya mostró el toast). Si no,
  `showNotification` con el ícono del barrio.
- `notificationclick`: enfoca una ventana abierta o abre `url`.
- La CSP (`web/src/proxy.ts`) suma `worker-src 'self'`.

**Vecino (mobile)**:

- *Inicio*: si hay paquetes sin ver, una tarjeta arriba de las invitaciones:
  "Te llegó un paquete", hora y nota del más reciente, y "Ver paquetes (N)".
  Sin borde lateral de color: tarjeta con fondo `--azul-tint`.
- *Paquetes* (`/paquetes`): lista de los últimos 30 días (hora, nota, "Lo
  recibió la garita"). Al abrirla, `POST /packages/seen`. Vacío: "No llegó
  ningún paquete en los últimos 30 días."
- *Aviso en vivo*: la app abre `EventSource('/events')` mientras hay sesión de
  vecino; con un `package`, toast "Llegó un paquete · Lote 12 · nota" e
  invalida la query de paquetes.
- *Banner "Activá los avisos"* en el inicio si: la feature está prendida, el
  navegador soporta push, el permiso no está concedido en este dispositivo y no
  tocó "Ahora no" (se recuerda en `localStorage`). En iPhone sin instalar
  (Safari, no `standalone`): en vez del botón, la guía de 3 pasos (Compartir →
  Agregar a inicio → abrir desde el ícono). Permiso denegado: el banner no
  aparece; Perfil explica cómo habilitarlo en el navegador.
- *Perfil*: "Notificaciones en este dispositivo" (switch: pide permiso,
  suscribe/desuscribe).
- La lógica pura (cuándo mostrar el banner, el conteo sin ver) va en
  `web/src/lib/avisos.ts` con su `avisos.check.ts`.

**Garita (desktop)**:

- Botón "Llegó un paquete" al lado de "Autorizar sin invitación" (solo con la
  feature prendida). Abre una hoja: título "Llegó un paquete", bajada "Le
  avisamos a la casa al instante.", buscador de lote (el del alta exprés), nota
  opcional, botón "Avisar al Lote N".
- Al guardar: toast "Avisando al Lote N en 5 s · Deshacer" con cuenta
  regresiva. Deshacer → `cancel`; si responde `ya_avisado`: "Ya se avisó."

**Admin**: switch "Paquetes" en *Configuración → Garita* con la bajada "La
garita avisa al vecino cuando llega un paquete."

## Infra

- Variables nuevas en la API: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` (`mailto:` del soporte). Se generan con
  `npx web-push generate-vapid-keys`. Con `NODE_ENV=production` la API no
  arranca sin ellas (como con Resend); en desarrollo, sin ellas no se manda
  push y se loguea.
- Caddy: el SSE necesita que no bufferee `/events` (`flush_interval -1` en el
  `reverse_proxy` de la API).
- README: cómo generar las claves y qué hace la feature.

## Textos y errores

| Código | Texto |
|---|---|
| `paquetes_apagados` | Los avisos de paquetes están apagados. |
| `ya_avisado` | Ya se avisó. |

## Tests

- `api`: alta (unidad de otro barrio rebota; nota > 80 rebota; feature apagada
  → 403); cancel antes (no avisa) y después del aviso (409); `avisarPaquete`
  avisa solo a vecinos activos de la unidad, borra la suscripción ante 410 (con `web-push` mockeado);
  arranque con pendientes; `GET /packages` respeta 30 días, deshechos y
  `sinVer`; upsert de suscripción por endpoint.
- `web`: `avisos.check.ts` (banner según soporte/permiso/standalone/"ahora no";
  conteo sin ver).
- `e2e`: el guardia avisa un paquete al Lote 900 → pasados los 5 s el vecino,
  con la app abierta, ve el toast y la tarjeta sin recargar; el guardia deshace
  otro antes de los 5 s y el vecino no lo ve. (El push del sistema no se
  prueba en e2e.)

## Fuera de este spec

- Mail como canal de aviso (se suma en `services/avisos.ts` con una preferencia
  por vecino en el perfil).
- WhatsApp (spec chico cuando Meta apruebe: celular + consentimiento + plantilla).
- Registro del retiro, foto, empresa, recordatorio de paquetes sin retirar.
- "Tu visita llegó" y otros avisos: usan este mismo `services/avisos.ts`.
- Avisos a la garita o al admin.
