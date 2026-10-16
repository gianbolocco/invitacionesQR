# Carga manual de movimientos

## Para qué

Cuando se corta la luz o internet, la garita anota en papel. Después hay que
pasar esos ingresos y egresos al sistema con la hora en que pasaron, no la de
ahora. Es un registro de lo que ya ocurrió, no una decisión de acceso.

## Pantalla `/garita/cargar` (guardia y admin)

1. **Persona:** se busca la invitación por nombre, DNI, patente o unidad (misma búsqueda de la garita).
2. **Datos:** fecha y hora de ingreso; opcional "ya se fue" con fecha y hora de salida; nota.
3. **Tanda:** cada movimiento se agrega a una lista. Se pueden cargar varios y guardarlos juntos, todo o nada.

Se reusan `Fila`, `Campo`, `CampoFecha`, `EncabezadoPagina`, `Vacio`, `Switch`.
Nuevo y reusable: `CampoHora`. El acceso es un botón "Cargar movimientos" en la garita.

## Reglas (API, `POST /gate/manual`)

- Máximo 50 por tanda; todo en una transacción.
- La invitación tiene que ser del barrio de quien carga.
- Ninguna hora en el futuro; ingreso dentro de las últimas 48 h; salida ≥ ingreso.
- No se superpone con otro movimiento de la misma invitación (ni con uno abierto).
- **No valida cupo, fecha ni anulación** (como `registerExit`): lo que pasó, pasó.
- La fila queda con `source = 'manual'` y `loaded_by`; el guardia del ingreso y de
  la salida es quien carga. Cada fila escribe una entrada en `audit_log`.
- Zona horaria: la pantalla manda la hora de Buenos Aires con offset `-03:00`
  (Argentina no tiene horario de verano).

## En la auditoría

La fila y el detalle por movimiento llevan el tag "Carga manual". Hay un filtro
de origen implícito: la etiqueta se ve en la tabla, las tarjetas y el desplegable.

## Fuera de alcance

Cargar a alguien sin invitación, subir planillas, elegir otro guardia de turno,
y que el guardia anule invitaciones (decisión pendiente, ver conversación).

## Verificación

`api`: tests de `registerManual` (camino feliz, futuro, ventana, superposición,
otro barrio, marca en auditoría). `web`: `carga-manual.check.ts` (armado de la
fecha y validación), tsc, lint, e2e de la pantalla.

## Anulación por la guardia (misma entrega)

La portería puede anular una invitación desde el veredicto, con **motivo
opcional**. Mismas reglas que la del vecino: no se anula con
el invitado adentro. El motivo queda en `invitation.revoked_reason` (`''` = anulada por la portería sin motivo; `null` = no fue la portería); el vecino lo
ve en su invitación ("Anulada por portería: …") y solo él (o quien sea de su
unidad) puede volver a habilitarla —la guardia no—, lo que borra el motivo.
Quién anuló y cuándo queda en `audit_log` (`invitation.revoked_by_guard`). La
auditoría muestra el motivo de las anuladas.
