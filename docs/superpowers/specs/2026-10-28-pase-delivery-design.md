# Pase de delivery: diseño

Estado: diseñado (28/10), sin implementar. Es el spec A de dos: el B (paquetes
en la garita + aviso por web push) va aparte y es el que trae las notificaciones.

## Problema

El motivo más común de llamada a la garita es "¿esperás un pedido de
PedidosYa?". El vecino ya sabe que viene alguien, pero no quién: no puede crear
una invitación (no hay nombre ni DNI que poner) y la garita termina llamando a
la casa cada vez.

## Qué hacen otros

- **OpenKey (iPark)** y **AccessIn**: permiten "autorizar servicios y
  deliveries" desde la app del vecino.
- Ninguno que hayamos visto controla la permanencia del repartidor ni le pide
  el seguro de la moto.

Lo que tomamos: un pase sin identidad que el vecino crea en dos toques. Lo
que agregamos: la garita identifica al repartidor al entrar, y le aplican las
mismas reglas que a cualquiera (seguro del vehículo, egreso, alerta).

## Reglas

1. **El repartidor entra hasta el lote.** El pase lo deja pasar como una visita
   corta: ingreso y egreso como cualquier otro.
2. **El vecino elige solo de dónde viene**: PedidosYa, Rappi, Mercado Libre u
   Otro (texto libre, obligatorio, hasta 40 caracteres). Nada de nombre, DNI ni
   fecha.
3. **Dura 2 horas fijas desde que se crea**, una sola entrada. El vecino puede
   anularlo antes. Sin configuración: se vuelve configurable si un barrio lo pide.
4. **La garita carga el DNI (obligatorio) y la patente (opcional)** al
   registrar el ingreso. Sin patente = a pie o en bici.
5. **El seguro del vehículo aplica igual que a todos**: si el barrio lo exige,
   la moto también. El padrón es por patente: el repartidor de siempre pasa sin
   que se lo pidan la segunda vez.
6. **No aplican** franjas horarias ni seguro del proveedor.
7. **Alerta de permanencia en minutos**, configurable por el admin (5 a 240,
   vacío = sin alerta, 30 por defecto).
8. **El alta exprés suma el tipo Delivery**, y **el DNI pasa a ser obligatorio
   en todo el alta exprés** (visita y proveedor incluidos): quien entra sin
   invitación queda identificado siempre.

## Datos

`invitation`:

- `kind` acepta `'delivery'` (se amplía `invitation_kind_ck`).
- `delivery_app text`: `'pedidosya' | 'rappi' | 'mercadolibre' | 'otro'`.
- `expires_at timestamptz`: el vencimiento exacto. La ventana actual es por día
  y no alcanza para "2 horas".
- Check: `delivery_app` y `expires_at` son not null si y solo si `kind = 'delivery'`.
- `guest_name` guarda la etiqueta ("PedidosYa") o el texto de "Otro". Así lista,
  buscador, auditoría y Excel lo muestran sin cambios.
- `valid_from` = hoy en Buenos Aires; `valid_to` = la fecha de `expires_at` en
  Buenos Aires. Un pase de las 23:30 vence a las 01:30 del día siguiente sin
  romper la ventana. Las dos se calculan con `api/src/lib/dates.ts`.
- `capacity` = 1. `token` se genera igual (la columna es obligatoria y única)
  pero no se muestra: no hay link ni QR para el repartidor.

`neighborhood`:

- `overstay_minutes_delivery smallint`, default 30, check `between 5 and 240`,
  null = sin alerta. Va al lado de `overstay_hours_visita/proveedor`.

Una migración de Drizzle con las tres columnas y los checks.

## API

- `POST /invitations/delivery` `{ unitId, app, otro? }` → crea el pase con
  `expires_at = now + 2 h`. Valida que el vecino pertenezca a la unidad, igual
  que la creación normal. Errores: `app_invalida`, `falta_detalle` (Otro vacío).
- `kind: 'delivery'` **no** entra por `POST /invitations`: ese schema sigue con
  los tres tipos. Un solo camino de alta por tipo.
- Anular: el endpoint actual de revocar, sin cambios.
- `canEnter()` (`api/src/authz.ts`): `InvitationLike` suma `expiresAt: Date | null`.
  Después de la ventana por día: `if (inv.expiresAt && now > inv.expiresAt) → 'expired'`.
  Mismo motivo que la ventana: la garita ya dice "Venció". El orden testeado
  no cambia.
- Ingreso: `POST /gate/entries` ya exige el documento para todos; no cambia.
  El `FOR UPDATE` queda como está.
- Alta exprés (`routes/gate.ts`): `kind` acepta `'delivery'` con `app/otro` en vez de
  `guestName`; el documento pasa a ser obligatorio para los tres tipos (zod,
  como en el ingreso). El delivery exprés también vence a las 2 h.
- `PATCH /admin/neighborhood`: `overstayMinutes.delivery` (5–240 o null).

## Vecino (mobile)

- **Inicio**: botón secundario "Espero un pedido" junto a "Nueva invitación":
  en el celular, arriba de él (el principal queda al alcance del pulgar); en
  escritorio, a su izquierda.
  Abre una hoja: "¿De dónde viene?", cuatro chips en grilla 2×2, campo de texto
  si es Otro, selector de lote solo si tiene más de uno, botón primario "Avisar
  a la garita". Debajo del título: "La garita lo deja pasar las próximas 2 horas."
- **Lista**: el pase vigente va primero, con tag "Delivery · vence 20:40" y
  "Anular". Al entrar: "Entró 20:12". Vencido sin uso: sale de la lista de
  vigentes y queda en el historial como cualquier invitación.
- No hay pantalla de detalle con QR: tocar el pase no navega.

## Garita (desktop)

- **Lista del día**: el pase aparece como un renglón más con tag "Delivery",
  meta "Lote 12 · Ana Gómez · vence 20:40". Se encuentra por el buscador (el
  repartidor dice el lote). Sin franja aparte: se agrega si los guardias pierden
  pedidos en la práctica.
- **Veredicto**: "PedidosYa → Lote 12", quién lo pidió, cuándo vence. Campo
  "Documento del repartidor" obligatorio (el botón no registra sin él) y
  "Patente (vacío = a pie o en bici)". La patente recalcula el seguro del
  vehículo, como hoy.
- **Alta exprés**: chip "Delivery" en *Tipo de ingreso*; al elegirlo, el nombre
  se reemplaza por los chips de app. DNI con asterisco en los tres tipos.
- **Permanencia**: `web/src/lib/permanencia.ts` lee los minutos del delivery;
  el resto de la alerta no cambia.
- **Tags y filtros**: `tag-tipo.tsx`, filtros de auditoría y agenda suman
  "Delivery" en sus mapas de etiquetas.

## Admin

*Barrio → Alertas*: "Delivery: avisar a los __ minutos" al lado de las horas de
visita y proveedor. Vacío = sin alerta.

## Textos y errores

| Código | Texto |
|---|---|
| `falta_detalle` | Contanos de dónde viene el pedido. |
| `app_invalida` | Elegí de dónde viene el pedido. |

## Tests

- `api`: `canEnter` con `expiresAt` (antes, justo después, cruce de medianoche,
  revocada gana sobre vencida); alta del pase (vecino de otra unidad rebota,
  Otro sin texto rebota); ingreso sin DNI rebota; alta exprés sin DNI rebota en
  los tres tipos; seguro del vehículo frena a un delivery con patente sin seguro.
- `web`: `permanencia.check.ts` con minutos; `estado-invitacion.check.ts` con el
  vencimiento por hora.
- `e2e`: vecino crea el pase → la garita lo busca por lote → carga DNI →
  ingreso → egreso. Actualizar los e2e de alta exprés que hoy no cargan DNI.

## Fuera de este spec

- "Tu pedido llegó" / "tu visita entró" y cualquier push: spec B.
- Duración configurable del pase, franja de "Pedidos esperados" en la garita,
  lista de apps editable por el admin.
