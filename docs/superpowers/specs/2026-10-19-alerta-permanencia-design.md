# Alerta de permanencia: diseño

Estado: implementado en la rama `alerta-permanencia` (19/10). Este documento
describe lo que quedó; al final, en "Lo que se probó y se sacó", está lo que se
construyó y el dueño descartó, para no volver a proponerlo sin motivo.

## Problema

Una visita o un proveedor entra y nadie registra su salida. Puede ser que se
fue por otra barrera o sin que lo escaneen, o puede ser que sigue adentro
cuando ya no debería. La garita lo mostraba en "Adentro", pero nada decía que
alguien llevaba demasiado tiempo: el guardia se enteraba solo si recorría la
columna y hacía la cuenta.

## Qué hacen otros

- **Mygate**: el admin fija una estadía máxima **por tipo** de visitante. Al
  pasarla suena una alarma en todos los dispositivos de guardia.
- **ADDA Gatekeeper / Neighbium**: marcan la estadía excedida en tiempo real.
  Neighbium también avisa al vecino.
- **TimeTec**: la alerta dice quién es, a quién visita y el vehículo.
- En Argentina (RapiPass, Securos, Vizit) no encontramos una alerta por horas de
  permanencia: controlan horarios de ingreso y personas bloqueadas.

Lo que tomamos: un umbral por tipo y una marca que trae el contexto para actuar
(DNI, lote, cuánto lleva).

## Reglas

1. **Un umbral por tipo, configurado por el admin**, en *Administración →
   Barrio → Alertas de permanencia*: uno para visita y otro para proveedor, en
   horas enteras de 1 a 72. Cada uno puede estar apagado (NULL). Una instalación
   nueva arranca con los dos apagados.
2. **Una frecuente usa el umbral de lo que es.** La frecuente lleva un subtipo,
   `invitation.frequent_as` (`visita` | `proveedor`), que el vecino elige al
   crearla ("¿Viene de visita o a trabajar?"). Una frecuente sin subtipo (las
   que existían antes, o un insert crudo) cuenta como visita.
3. **Una visita frecuente dura hasta un mes**: hasta el mismo día del mes
   siguiente, o el último de ese mes si no existe (`unMesDespues`). Se valida en
   el formulario (el calendario no deja pasarse) y en la API
   (`400 frecuente_mas_de_un_mes`), al crear y al editar si cambian las fechas o
   el subtipo; una frecuente vieja de un año se puede corregir (nombre, DNI) sin
   acortarla. La frecuente de proveedor no tiene tope.
4. **El reloj corre desde el ingreso más viejo que sigue abierto** de esa
   invitación (con cupo 3 puede haber tres adentro).
5. **La cuenta es en vivo y no se guarda.** `/gate/adentro` trae el vencimiento
   ya calculado (`alertaDesde`) y la garita lo compara con su reloj cada 30 s
   (`AlertasProvider`). No hay job ni cron. Si el admin cambia un umbral,
   `avisarAlEscribir` avisa a las garitas y se recalcula solo.

## En la garita

No hay pantalla, panel ni aviso nuevos: la marca va en lo que el guardia ya mira.

- **Tablero y lista:** quien pasó su tiempo va primero en "Adentro". La tarjeta
  es la de siempre; solo el pie cambia a un ícono y "Hace 7 h 20 min adentro" en
  `espera`. Dice cuánto lleva, no cuánto se pasó: es el dato que se usa al
  llamar a la casa. Las vistas compacta y por unidad no cambian.
- **Filtro *Filtros → Advertencia → Tiempo excedido*,** con la cantidad. Anda en
  todas las vistas, también el tablero; se muestra como filtro aplicado y se
  quita con "Quitar todo". Mirando otro día no hay a quién marcar.
- **Marcas de tipo:** una frecuente proveedor lleva "Frecuente" y "Proveedor";
  todo proveedor se marca.
- **DNI:** todas las tarjetas del tablero lo muestran abajo a la izquierda,
  junto a la patente.

Se verifica a 1280 px y a 390 px, en claro y oscuro.

## Datos

```
neighborhood.overstay_hours_visita     smallint null  check 1..72
neighborhood.overstay_hours_proveedor  smallint null  check 1..72
invitation.frequent_as                 text null      solo en frecuentes: 'visita' | 'proveedor'
```

Migraciones: 0013 (umbrales), 0014 (subtipo, con las frecuentes existentes
pasadas a visita) y 0015 (borra las columnas del "Ya lo vi" que agregó la 0013;
ver abajo). Antes de mergear conviene juntarlas en una sola: producción no
corrió ninguna.

## API

- `GET/PATCH /admin/neighborhood`: `overstayHours: { visita: number | null; proveedor: number | null }`.
  El PATCH valida enteros de 1 a 72, o null para apagarlo; una clave que no viene no se toca.
- `GET /gate/adentro`: cada fila suma `alertaDesde: string | null` (ingreso
  abierto más viejo más el umbral de su tipo; null si ese tipo no alerta).
- `POST /invitations` y `PATCH /invitations/:id`: aceptan `frequentAs`.
  En una invitación que no es frecuente se ignora al crear y da
  `400 no_es_frecuente` al editar.
- `GET /gate/search`: cada resultado suma `frequentAs` y `anulada` (para las
  marcas del buscador).

## Lo que se probó y se sacó

Se construyó y el dueño lo descartó al verlo, el mismo día:

- **Aviso en el header** con la cantidad de alertas, y **panel lateral**
  "Pasaron su tiempo" con *Ver*, *Ver todos* y *Ya lo vi*.
- **"Ya lo vi"** compartido y auditado (`entry_log.overstay_seen_at/by`,
  `POST /gate/invitations/:id/alerta-vista`).
- **Sonido** (dos pitidos al aparecer una alerta nueva), con interruptor.
- **Tarjetas en amarillo entero** y el texto "Se pasó 1 h 20".
- **Chip de estado** "Pasaron su tiempo" en la agenda.

Lo que pidió en su lugar: una UI más limpia (la tarjeta normal con el texto en
amarillo) y un filtro. Sin panel ni sonido, la garita no avisa sola: las
advertencias se ven al mirar el tablero o al filtrar. Si hiciera falta un aviso
activo, lo más chico es volver a poner el pitido solo.

## Fuera de alcance

- Avisarle al vecino (queda junto al "aviso al vecino" pendiente del README).
- Notificaciones push con la pestaña cerrada.
- Un umbral distinto por invitación o que lo extienda el vecino.
- Cambiar el subtipo de una frecuente que ya se usó (editar está bloqueado
  después del primer ingreso, como el resto de los datos).
