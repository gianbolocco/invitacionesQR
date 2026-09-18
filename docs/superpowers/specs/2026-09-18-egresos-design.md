# Diseño — Registro de egresos

Fecha: 2026-09-18
Estado: aprobado para pasar a plan de implementación

## 1. Problema

La bitácora registra ingresos y nada más. De una visita se sabe a qué hora
entró, nunca si se fue ni cuándo. La auditoría y el Excel quedan con media
historia, y no hay forma de contestar "¿a qué hora se fue el plomero?".

El guardia ya tiene el QR delante cuando la persona se va, así que el gesto
existe: falta que el segundo escaneo signifique algo.

## 2. Alcance

### Adentro

- Una salida por visita, registrada escaneando el QR de nuevo o buscando por
  documento.
- El escaneo resuelve solo si es ingreso o egreso.
- La salida visible en la lista del día, en la auditoría y en el Excel.
- Deshacer el último movimiento, acotado en el tiempo.
- El buscador de la garita pasa a matchear documento.

### Afuera, y por qué

- **Pantalla de ocupación en tiempo real** ("quiénes están adentro ahora"). El
  motivo elegido para esta función fue la auditoría, no la ocupación. El dato
  queda en la base y la pantalla se puede agregar después sin migrar nada.
- **Alertas de permanencia** (el que entró y no salió). Depende de decidir
  cuándo eso es raro, que es otra conversación.
- **Varios pares entrada/salida por visita.** Con cupo 1 una invitación entra
  una vez; una frecuente ya resuelve el caso de entrar y salir seguido.
- **Cerrar automáticamente las filas abiertas** a fin del día. Inventar una hora
  de salida es peor que no tenerla.

## 3. Decisiones

### 3.1 Una fila por visita, no una por movimiento

`entry_log` gana `exited_at` y `exit_guard_id`. Una visita es una fila con sus
dos horarios.

La alternativa era una fila por movimiento con `kind: 'in' | 'out'`, que deja la
bitácora inmutable. Se descartó por dos razones concretas:

1. Todos los conteos de cupo del sistema —`canEnter`, la agenda, la auditoría,
   el historial— pasarían a necesitar `where kind = 'in'`. Son muchos lugares y
   basta olvidarse de uno para que un egreso queme cupo.
2. "Entró a las 20, salió a las 21" en una línea exigiría emparejar filas con
   una función de ventana. Es exactamente el dato que motiva la función.

Con una fila por visita, un egreso **no agrega fila**, así que todos los
`count(*)` que hoy cuentan ingresos siguen contando lo mismo. El cupo no se
toca.

Costo aceptado: la bitácora deja de ser solo-agregar. El momento en que se
registró la salida es el del `UPDATE`, y una salida corregida no deja rastro más
allá del `audit_log` del deshacer.

### 3.2 El guardia de la salida se guarda aparte

`exit_guard_id` no es lo mismo que `guard_id`. En un cambio de turno la persona
entra con un guardia y sale con otro, y "quién lo dejó pasar" ya era un dato de
auditoría deliberado del sistema.

### 3.3 El escaneo resuelve solo

Sin botones ni pantallas separadas: si hay fila abierta es un egreso, si no es
un ingreso. Es lo más rápido en la barrera y no hay nada que el guardia pueda
elegir mal.

**Quién resuelve:** el cliente elige a qué endpoint pegar, con el campo
`adentro` que le devolvió el check; el servidor valida igual. No es que el
servidor adivine: si el cliente pega a `/gate/exits` con alguien que no está
adentro, o a `/gate/entries` con alguien que sí, el servidor lo rechaza. Así el
cliente puede tener el dato viejo —otro guardia registró la salida mientras esta
pantalla estaba abierta— y lo peor que pasa es un error claro.

### 3.4 Un egreso nunca se rechaza

Sin control de fechas, de cupo ni de anulación. El que está adentro tiene que
poder salir. Si le anularon la invitación mientras estaba adentro, sale igual —
y eso es justamente lo que se quiere registrado.

### 3.5 El cupo sigue contando ingresos

Una invitación de cupo 1 entra una vez. Si sale y quiere volver, rebota por
cupo, igual que hoy. El cupo NO pasa a significar "cuántos adentro a la vez".

Consecuencia asumida: el invitado que sale al auto y vuelve no puede reingresar
con su QR, y el guardia lo va a dejar pasar a mano sin que quede registrado. Se
acepta porque es el comportamiento actual y porque el vecino que necesita eso
puede crear la invitación como frecuente.

## 4. Modelo de datos

```sql
ALTER TABLE entry_log ADD COLUMN exited_at timestamptz;
ALTER TABLE entry_log ADD COLUMN exit_guard_id uuid REFERENCES person(id);

-- La consulta caliente: ¿esta invitación tiene alguien adentro?
CREATE INDEX entry_open_idx ON entry_log (invitation_id) WHERE exited_at IS NULL;
```

Nada es `NOT NULL`: las 17 filas existentes quedan como ingresos sin salida
registrada, que es la verdad.

### Invariantes

- **"Está adentro"** = existe una fila de esa invitación con `exited_at IS NULL`.
- Si hay más de una fila abierta —posible en una frecuente donde el guardia
  olvidó una salida— se cierra **la más reciente por `entered_at`**. Las
  anteriores quedan abiertas para siempre y se muestran como
  *salida: sin registrar*.
- `exited_at >= entered_at` siempre. No se agrega un CHECK porque el único
  camino que escribe la columna es el egreso, que usa `now()`.

## 5. API

### `POST /gate/entries` — sin cambios de contrato

Sigue registrando un ingreso. Se mantiene tal cual para que el flujo del guardia
no dependa de que el cliente sepa resolver ingreso vs egreso.

### `GET /gate/check/:token` y `GET /gate/invitation/:id` — campo nuevo

La respuesta gana:

```ts
adentro: { entryId: string; enteredAt: Date } | null
```

Si viene, el cliente sabe que el próximo movimiento es un egreso y tiene la hora
de entrada para mostrarla. `check` sigue siendo el veredicto del **ingreso**: el
cliente lo ignora cuando `adentro` no es null, porque un egreso no se valida.

### `POST /gate/exits` — nuevo

```ts
{ invitationId: string }
```

Cierra la fila abierta más reciente de esa invitación:

```sql
UPDATE entry_log SET exited_at = now(), exit_guard_id = $guardia
WHERE id = (
  SELECT id FROM entry_log
  WHERE invitation_id = $inv AND exited_at IS NULL
  ORDER BY entered_at DESC LIMIT 1
)
AND exited_at IS NULL
RETURNING *
```

El `AND exited_at IS NULL` del final no es redundante: es lo que hace que dos
egresos simultáneos no escriban los dos. El que pierde recibe cero filas y
devuelve `409 no_esta_adentro`.

Si no hay fila abierta: `409 no_esta_adentro`. El guardia sale de la sesión, no
del body, igual que en los ingresos.

Devuelve la fila actualizada. El cliente necesita su `id` para el deshacer, y lo
mismo vale para `POST /gate/entries`, que ya la devuelve.

### `POST /gate/entries/:id/undo` — nuevo

Deshace el último movimiento de esa fila:

- Si tiene `exited_at` → lo pone en `NULL` junto con `exit_guard_id`.
- Si no → borra la fila.

Con dos límites:

1. **5 minutos** desde el movimiento que se deshace (`exited_at` o `entered_at`
   según el caso). Después: `409 fuera_de_plazo`. Sin el límite, un guardia
   podría borrar un ingreso de hace tres semanas; eso no es corregir un error,
   es borrar evidencia.
2. Queda en `audit_log` con la acción `entry.undone` y el movimiento deshecho en
   el `meta`.

### `GET /gate/search` — matchea documento

Se agrega `invitation.guest_doc` a los campos que compara, sin `unaccent`
—un documento no lleva tildes— y cada resultado devuelve el mismo campo
`adentro` que el check, para que el guardia vea qué va a pasar antes de tocar.

## 6. Pantallas

### Resultado del escaneo

Hoy el veredicto usa tres canales y ninguno es el color: la palabra, el ícono y
la luminancia del campo. Se mantiene la regla:

| Caso | Campo | Palabra | Ícono |
|---|---|---|---|
| Ingreso permitido | claro | **INGRESO** | flecha entrando |
| Egreso | claro | **EGRESO** | flecha saliendo |
| Rechazado | oscuro | **NO PASA** | ✕ |

La luminancia codifica lo único que el guardia lee en un segundo: *¿abro o no
abro?*. Ingreso y egreso comparten campo claro porque los dos significan "abrí",
y se distinguen por palabra e ícono, que es una lectura de segundo orden y
alcanza. Poner el egreso en campo oscuro chocaría con el rechazo justo en el
canal más rápido.

En un egreso, debajo del nombre va **"entró a las 20:00"**: es el dato con el
que el guardia confirma que es la persona.

### Confirmación y deshacer

Después de registrar, la misma pantalla pasa a confirmación —*EGRESO REGISTRADO
· 21:04*— con **Deshacer** y **Siguiente**. Vuelve sola al escáner a los 8
segundos y "Siguiente" la saltea.

El camino común no suma ni un toque respecto de hoy, y el deshacer está a mano
justo cuando el guardia nota el error. Deshacer vuelve a la pantalla anterior
con el estado recalculado.

### Lista del día

El chip `Estado` gana un tercer valor: **SALIÓ 21:00**. Hoy solo hay ESPERANDO y
ADENTRO, y decir "adentro" de alguien que se fue pasa a ser mentira.

La agrupación en secciones no cambia: *Esperando* y *Ya entraron* siguen
partiendo por "tuvo un ingreso hoy", y el chip lleva el estado fino.

### Auditoría y Excel

- Columna *Salida* en la tabla, con `—` cuando no se registró.
- La fila desplegable muestra los dos horarios con sus dos guardias.
- Hoja Invitaciones del Excel: columnas *Salida* y *Guardia salida*.

## 7. Errores

| Situación | Respuesta |
|---|---|
| Egreso de alguien que no está adentro | `409 no_esta_adentro` |
| Dos egresos simultáneos | el segundo, `409 no_esta_adentro` |
| Deshacer pasados 5 minutos | `409 fuera_de_plazo` |
| Deshacer una fila que no existe | `404 not_found` |
| Reingreso con el cupo agotado | `409 no_capacity`, como hoy |

## 8. Tests

Dos importan más que el resto:

1. **Los 162 tests actuales pasan sin tocarlos.** Es la prueba de que el cupo no
   cambió. Cualquiera que haya que editar es señal de que algo se movió de lugar.
2. **Dos egresos simultáneos de la misma fila: solo uno gana.** Con un bloqueo
   externo, como el test de concurrencia que ya existe para los ingresos.

Los demás:

- Escanear dos veces da ingreso y después egreso; el tercer escaneo rebota por
  `no_capacity`.
- Un egreso se registra con la invitación **anulada**, y también **vencida**.
- El `check` devuelve `adentro` con la hora de entrada cuando corresponde, y
  `null` cuando no.
- Frecuente con dos filas abiertas: el egreso cierra la más reciente y la otra
  queda abierta.
- Una fila abierta no se cierra sola al pasar el día; la auditoría la muestra sin
  salida.
- Deshacer un egreso lo reabre; deshacer un ingreso borra la fila; a los 6
  minutos falla; queda en `audit_log`.
- El buscador encuentra por documento, y devuelve `adentro`.
- El guardia del egreso sale de la sesión: un `exitGuardId` mandado en el body se
  ignora.
- El Excel trae las dos columnas nuevas, buscadas por encabezado y no por índice.
