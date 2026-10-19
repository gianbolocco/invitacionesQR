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

1. **Un umbral por tipo, configurado por el admin**, en *Administración →
   Barrio*: uno para visita y otro para proveedor, en horas enteras de 1 a 72.
   Cada uno puede estar apagado (NULL). Una instalación nueva arranca con los
   dos apagados: nada cambia hasta que el admin lo decide.
2. **Los frecuentes nunca alertan.** Son el personal de la casa y pasan la
   jornada entera adentro.
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

## Celular

Es la misma pieza en los dos tamaños. En el celular el botón del header muestra
solo el ícono y el número, el panel sube desde abajo y las acciones de cada
fila tienen al menos 44 px de alto. Se verifica primero a 1280 px y después a
390 px.

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
