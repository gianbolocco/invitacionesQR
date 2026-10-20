# Alerta de permanencia: diseño

## Problema

Una visita o un proveedor entra y nadie registra su salida. Puede ser que se
fue por otra barrera o sin que lo escaneen, o puede ser que sigue adentro
cuando ya no debería. Hoy la garita lo muestra en "Adentro", pero no hay nada
que avise que alguien lleva demasiado tiempo. El guardia se entera solo si
recorre la columna y hace la cuenta.

## Qué hacen otros

- **Mygate**: el admin fija una estadía máxima **por tipo** de visitante. Al
  pasarla suena una alarma en todos los dispositivos de guardia, con los datos
  de la persona.
- **ADDA Gatekeeper / Neighbium**: marcan la estadía excedida en tiempo real.
  Neighbium también avisa al vecino.
- **TimeTec**: la alerta dice quién es, a quién visita y el vehículo, y desde
  ahí se llama al anfitrión o se registra la salida.
- En Argentina (RapiPass, Securos, Vizit) no encontramos una alerta por horas de
  permanencia: controlan horarios de ingreso y personas bloqueadas.

Lo que tomamos: un umbral por tipo, una alerta que trae el contexto para actuar
y las acciones en el mismo lugar. También que se pueda marcar como vista, porque
una alerta que no se calla termina ignorada.

## Decisiones

> **Segunda revisión del dueño (19/10):** se sacaron el aviso del header, el
> panel lateral, el "Ya lo vi" (endpoint y columnas, migración 0015) y el
> sonido. Lo que queda: la marca en amarillo en tablero y lista, los excedidos
> primero en "Adentro" y el filtro **Advertencia → Tiempo excedido** en *Filtros* (funciona en
> todas las vistas, también el tablero). Los puntos 5, 6 y 7 de abajo y la
> sección "Celular y revisión del dueño" quedan como historia.

1. **Un umbral por tipo, configurado por el admin**, en *Administración →
   Barrio*: uno para visita y otro para proveedor, en horas enteras de 1 a 72.
   Cada uno puede estar apagado (NULL). Una instalación nueva arranca con los
   dos apagados: nada cambia hasta que el admin lo decide.
2. **Una frecuente alerta según lo que es** (cambio del 19/10). La frecuente
   lleva un subtipo, `invitation.frequent_as` (`visita` | `proveedor`), que el
   vecino elige al crearla ("¿Viene de visita o a trabajar?") y puede editar
   mientras no se usó. Usa el umbral de ese subtipo. Las que ya existían
   quedaron como visita; una frecuente sin subtipo (un insert crudo) cuenta como
   visita. En la garita, una frecuente proveedor lleva las dos marcas:
   "Frecuente" y "Proveedor". Una **visita frecuente dura hasta un mes** (mismo
   día del mes siguiente; `frecuente_mas_de_un_mes` si no): se valida en el
   formulario y en la API, al crear y al editar si cambian las fechas o el
   subtipo. La de proveedor no tiene tope.
3. **El reloj corre desde el ingreso más viejo que sigue abierto** de esa
   invitación (una invitación con cupo 3 puede tener a tres personas adentro).
4. **La cuenta es en vivo y no se guarda.** La API devuelve en `/gate/adentro`
   el momento en que vence cada uno (`alertaDesde`), y la garita compara ese
   momento con su reloj cada 30 s. No hay job ni cron. Si el admin cambia el
   umbral, `avisarAlEscribir` ya notifica a las garitas y la alerta se recalcula
   sola.
5. **"Ya lo vi" es compartido y queda auditado.** Se guarda en el `entry_log`
   abierto (`overstay_seen_at`, `overstay_seen_by`) y se registra en
   `audit_log`. Lo marca un guardia y se calla en todos los dispositivos. La
   persona sigue marcada en "Adentro", pero deja de contar en el aviso del
   header y de sonar. Si vuelve a entrar es una fila nueva de `entry_log`, así
   que vuelve a alertar.
6. **No hay pantalla nueva.** La alerta aparece en lo que el guardia ya tiene
   abierto:
   - **Aviso en el header de la garita** (`ChromeGarita`, que cubre Garita,
     Auditoría, Cargar y Probar lectora), en escritorio y en el celular: un
     botón con ícono y la cantidad de alertas sin ver. Si no hay ninguna, no se
     muestra.
   - **Un panel** (`Sheet side="auto"`: abajo en el celular, al costado en
     escritorio) con la lista. Arriba van las sin ver y abajo, en "Ya vistas",
     el resto. Cada fila muestra nombre, tipo, lote, patente, la hora de
     ingreso y cuánto se pasó ("Se pasó 1 h 20"), con dos acciones: *Ver*
     abre el veredicto, donde ya está *Registrar salida*, y *Ya lo vi*.
   - **Columna "Adentro" del tablero y vista lista:** los excedidos van primero,
     con borde y fondo `espera` y el pie "Se pasó 1 h 20". Las vistas compacta y
     por unidad no cambian, porque el aviso del header ya cubre esos casos.
   - **Chip "Pasaron su tiempo (N)"** en los chips de estado de la agenda
     (lista, compacta y por unidad), solo mirando hoy y solo si N > 0. Es la
     vista completa de los excedidos, con DNI, quién invita y agrupación; el
     panel es el atajo. Si N llega a 0 con el chip elegido, se vuelve a "Todos".
   - **Sonido:** dos pitidos cortos (Web Audio, sin archivo) cada vez que aparece
     una alerta sin ver que antes no estaba. No se repite. En el panel hay un
     interruptor para silenciarlo, que se guarda por dispositivo
     (`usePreferencia`).
7. **Escanear y el veredicto no muestran el aviso**, porque se abren a
   pantalla completa y sin el marco de la garita. Son pantallas de paso: al
   volver, el aviso está ahí.

## Celular y revisión del dueño (19/10)

- El aviso del header es un ícono más (como el tema o salir) con un número chico
  de las sin ver: discreto, porque el que llama la atención es el pitido. Entra
  igual en el celular, así que no hay franja.
- El panel tiene **"Ver todos"**, que lleva a `/garita?ver=excedidos`: la agenda
  de hoy con el chip "Pasaron su tiempo" puesto (en lista si estaba en tablero).
- La tarjeta del tablero es la misma que la de cualquiera adentro: solo el pie va
  en amarillo, con ícono, "Hace 7 h 20 min adentro", y suma el **DNI**. Igual en
  la lista y en el panel (que además muestra la hora de ingreso). No se dice
  "se pasó": cuánto lleva es lo que el guardia usa al llamar a la casa.
- El chip "Pasaron su tiempo" va segundo, después de "Todos", para que se vea
  en el celular.
- Se verifica a 1280 px y a 390 px, en claro y oscuro.

## Datos

```
neighborhood.overstay_hours_visita     smallint null  check 1..72
neighborhood.overstay_hours_proveedor  smallint null  check 1..72
entry_log.overstay_seen_at             timestamptz null
entry_log.overstay_seen_by             uuid null → person
```

## API

- `GET/PATCH /admin/neighborhood`: suma
  `overstayHours: { visita: number | null; proveedor: number | null }`. El PATCH
  valida enteros de 1 a 72, o null para apagarlo.
- `GET /gate/adentro`: cada fila suma `alertaDesde: string | null`, que es el
  ingreso abierto más viejo más el umbral de su tipo, o null si ese tipo no
  alerta, y `alertaVista: boolean`, que es true si todos los ingresos abiertos
  están vistos.
- `POST /gate/invitations/:id/alerta-vista`: marca como vistos los ingresos
  abiertos de esa invitación. Devuelve 403 si la invitación es de otro barrio, 404 si
  no existe, y 409 `no_esta_adentro` si no hay ninguno abierto.

## Fuera de alcance

- Avisarle al vecino (queda junto al "aviso al vecino" pendiente del README).
- Notificaciones push con la pestaña cerrada: sin la garita abierta no hay a
  quién avisar en la barrera.
- Un umbral distinto por invitación o que lo extienda el vecino.
- Avisar cuando la invitación vence con la persona adentro: es otra regla, y
  el umbral la cubre en la práctica.
