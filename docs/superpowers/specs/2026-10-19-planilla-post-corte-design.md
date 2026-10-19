# Planilla post corte

Reemplaza la pantalla de [carga manual](2026-10-16-carga-manual-design.md). Las
reglas de la API se mantienen; cambian la forma de cargar, quién se puede
cargar y lo que muestra la auditoría.

## Para qué

Cuando se corta la luz, la garita anota en papel hasta que el generador y el
router vuelven: a veces son minutos y otras veces horas, si el proveedor de
internet también se quedó sin luz. La planilla puede tener 3 renglones o 40.

Problemas de la pantalla actual:

- **Lentitud:** carga de a una persona, con unos 8 pasos por renglón.
- **Gente sin invitación:** no se puede cargar a quien llegó sin invitación,
  que en un corte es lo más común.
- **Tanda frágil:** vive en la memoria de la pantalla y se pierde al recargar.
- **Auditoría incompleta:** el Excel no distingue lo cargado a mano de lo
  escaneado, y la nota y el momento de la carga no se ven en ningún lado.

Contexto: las apps del rubro (MyGate, Gate Sentry, Tap2Open) resuelven el corte
con un modo sin conexión. Acá no aplica: hay generador, y validar sin la base
choca con `canEnter()` y el cupo. Ese modo queda fuera de alcance.

## Pantalla `/garita/cargar` (guardia y admin)

Arriba va la **fecha de la planilla**, elegida una sola vez (por defecto, hoy).
Debajo, una tabla con estas columnas fijas, igual que el papel:

| Ingreso | Persona | DNI | Lote | Salida | Nota | |
|---|---|---|---|---|---|---|
| `21:40` | buscador | obligatorio | automático o elegido | `23:10` o vacío | texto | quitar |

- **Teclado primero:** Tab avanza de celda y Enter en la última celda agrega
  una fila nueva y pone el foco en su "Ingreso". La hora se escribe (`2140` →
  `21:40`), sin selector.
- **Salida pasada la medianoche:** si la salida es menor que el ingreso, se toma
  como del día siguiente, y la fila lo aclara ("+1 día").
- **Persona:** escribiendo, sugiere primero las invitaciones vigentes ese día
  (`/gate/agenda?date=`) y después la búsqueda general (`/gate/search`). Elegir
  una invitación completa el lote y lo bloquea.
- **Sin invitación:** si nadie coincide, la opción "Cargar «Juan Pérez» sin
  invitación" deja el nombre escrito y habilita el selector de lote
  (`/gate/units`). La fila muestra el tag "Sin invitación".
- **DNI obligatorio en toda fila,** con la misma regla de la puerta: cada fila
  es un paso por la puerta anotado en papel. Si la invitación ya tiene DNI, se
  completa solo y se puede corregir. Si no lo tiene, o si es una persona sin
  invitación, la fila no se puede guardar hasta cargarlo. El DNI solo es
  opcional al crear el alta exprés, no al pasar por la puerta.
- **Errores por fila:** se validan al salir de cada fila con la misma lógica
  pura de hoy (`validarCarga`, `pisaOtra`). La fila con error se marca y dice
  qué corregir; "Guardar" queda deshabilitado mientras haya alguna con error.
- **Borrador:** la planilla (fecha y filas) se guarda en `localStorage` en cada
  cambio y se recupera al volver. Se borra al guardar bien. Una sola planilla
  por navegador.
- **Guardar:** "Guardar 12 movimientos". Si la API rechaza la tanda, el error
  se pinta en la fila que indica la respuesta y no se pierde nada.

En el celular, cada fila se apila como una tarjeta con los mismos campos. La
tabla empieza en 1024 px de ancho; por debajo van las tarjetas. Toda fila sin
invitación también exige un lote.

## API `POST /gate/manual`

Cada ítem trae **una de dos formas**:

- `{ invitationId, guestDoc, enteredAt, exitedAt?, note? }`, como hoy más el
  DNI.
- `{ guest: { name, unitId }, guestDoc, enteredAt, exitedAt?, note? }` para una
  persona sin invitación.

`guestDoc` es obligatorio en las dos formas (`trim().min(1)`), igual que en
`POST /gate/entries`. Se guarda en el movimiento y, si la invitación no tenía
DNI, se le completa, como hace `registerEntry`.

Para un ítem con `guest`, dentro de la misma transacción de `registerManual`:

1. Se valida que la unidad sea del barrio (`assertUnitInNeighborhood`).
2. Se crea una invitación de portería: `kind = 'visita'`, `capacity = 1` y
   `validFrom = validTo =` **el día del ingreso** en Buenos Aires, no hoy, con
   `createdBy =` quien carga. Así figura como "Autorizado por portería". Se
   comparte el armado con `createExpressInvitation`, a la que se le agrega el
   parámetro del día.
3. Se registra el movimiento como cualquier otro. No hay chequeo de
   superposición, porque la invitación es nueva.

**Reglas sin cambios:** máximo 50 ítems, nada en el futuro, ingreso dentro de
las 48 h, salida ≥ ingreso, sin superposición, sin validar cupo ni anulación, y
todo o nada.

**Error por fila:** `AppError` suma un campo opcional `fila` (el índice del
ítem) y el `errorHandler` lo devuelve: `{ error: 'se_superpone', fila: 7 }`.
Lo usa solo `registerManual`.

## Auditoría

- **Migración:** se agrega la columna `entry_log.loaded_at timestamptz`, que se
  completa con `now()` solo en `registerManual`. No hay backfill: las cargas
  manuales viejas quedan con `null`.
- **Detalle de movimientos (`Movimientos`):** en las manuales, además del tag,
  se muestra "Cargado a mano por Juan Pérez el 19/10 10:40" y la nota.
- **"Guardia ingreso" y "Guardia salida":** en las manuales dicen
  "Carga manual · Juan Pérez", en pantalla y en el Excel.
- **Fila principal de la auditoría** (tabla/tarjetas): mantiene el nombre plano
  del guardia más el tag "Manual", porque resume varios movimientos; "Carga
  manual · X" se muestra por movimiento, en el detalle y en el Excel.
- **Excel, hoja "Ingresos":** se agregan las columnas **Origen**
  ("Escaneo" o "Carga manual"), **Cargado el** y **Nota**. **Hoja
  "Invitaciones":** se agrega la columna **Carga manual** (sí/no), que es el mismo
  `manual` que ya usa la tabla.

## Fuera de alcance

- Modo sin conexión.
- Subir una foto o un CSV de la planilla.
- Elegir qué guardia estaba de turno.
- Varias planillas en borrador a la vez.

## Verificación

- **`api`:** tests de `registerManual` con filas sin invitación (crea la
  invitación con la vigencia del día del ingreso y `createdBy` del guardia,
  rechaza una unidad de otro barrio, rechaza un ítem sin DNI, completa el DNI
  de una invitación que no lo tenía, y si falla otra fila no queda ni la
  invitación ni el movimiento). También que el error traiga `fila`,
  `loaded_at` en las manuales y `null` en las escaneadas, y las columnas nuevas
  del Excel.
- **`web`:** `carga-manual.check.ts` con la salida pasada la medianoche
  (+1 día), la hora escrita sin dos puntos y el borrador que se serializa y se
  recupera.
- **e2e:** cargar dos filas, una con invitación y otra sin, guardarlas y verlas
  en Auditoría con "Manual", "Autorizado por portería" y la nota. Además,
  recargar la página a mitad de la planilla y que las filas sigan ahí.
