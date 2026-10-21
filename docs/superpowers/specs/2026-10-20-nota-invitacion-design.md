# Nota de la invitación: diseño

Estado: diseño aprobado (20/10), rama `nota-invitacion`.

## Problema

El vecino sabe cosas que le sirven al guardia y no tiene dónde ponerlas: "viene
en un Gol rojo", "deja un paquete", "es el plomero, va al lote 12". Hoy eso va
por WhatsApp, justo lo que Pazzit viene a reemplazar.

No confundir con `entry_log.note`: esa es la observación del guardia en una
carga manual. Son dos campos distintos y no se reusan.

## Reglas

1. **Una nota opcional por invitación**, de hasta **140 caracteres**. La API
   la valida con zod: `trim()`, máximo 140, y vacía se guarda como `null`.
2. **La ven la garita y los vecinos de la unidad.** El invitado no la ve en
   `/i/[token]`: la nota es para el guardia y el vecino tiene que poder escribir
   sin pensar que el invitado la lee. `findPublicByToken` no la devuelve.
3. **Se edita con la misma regla que el resto de la invitación**: solo si está
   pendiente (sin anular, sin ingresos, sin vencer). No hay ruta aparte. Por eso
   la nota que está en la base cuando alguien entra es la que quedó para
   siempre en ese ingreso, y el Excel puede leerla de la invitación.
4. **Todos los tipos la llevan**: visita, frecuente y proveedor. También el
   alta exprés de la garita: el guardia deja una nota opcional para el turno
   siguiente o para el que le toque la salida.
5. **"Volver a invitar" no copia la nota.** Copia el nombre, el DNI y la
   patente, pero "deja un paquete" es de esa visita y no de la próxima.

## Datos

Migración de Drizzle: `invitation.note text` nullable, con
`check (char_length(note) <= 140)` para que la base también cuide el límite.

## API

- `POST /invitations` y `PATCH /invitations/:id`: `note` opcional
  (`z.string().trim().max(140).nullable().optional()`). En el servicio,
  `note?.trim() || null`, igual que `guestDoc` y `plate`.
- Alta exprés (`routes/gate.ts` → `createExpressInvitation`): el mismo `note`
  opcional, con la misma validación.
- Lecturas que suman `note`: el detalle y la lista del vecino
  (`invitations.ts`), el veredicto (`checkById` / `checkByToken`), la agenda del
  día y "adentro" (`agendaForDay`, `insideNow`) y el buscador (`searchGuests`).
- Excel de ingresos (`entriesLog` + `routes/gate.ts`): `join invitation` y una
  columna **"Nota del vecino"** al lado de la "Nota" que ya existe (la de carga
  manual). En pantalla, la auditoría no cambia.
- Sin códigos de error nuevos: el largo lo rechaza zod como cualquier otro campo
  inválido. Editar una nota de una invitación usada da `ya_usada`, como hoy.

## Web

**Vecino (mobile-first).** En `formulario-invitacion.tsx`, un `Textarea` de dos
renglones después de la patente:

- Etiqueta "Nota para la guardia (opcional)".
- Contador `n/140`, con `maxLength={140}` en el campo.
- Ayuda fija abajo: "La lee la guardia. No pongas datos de salud ni otros datos
  sensibles." Esto es lo que se puede hacer hoy por la Ley 25.326: avisar. No hay
  validación automática del contenido.

En el detalle de la invitación del vecino, la nota va como un dato más, si hay.

**Garita (desktop-first).**

- **Alta exprés** (`alta-expres.tsx`): un campo "Nota (opcional)" de un renglón
  después de la patente, con `maxLength={140}` y la misma ayuda corta ("No
  pongas datos sensibles"). Como los demás campos del alta, lleva
  `useCampoLectora`: un QR o un DNI que llega con el foco en la nota se
  interpreta como lectura y no queda escrito en ella.
- **Veredicto / detalle** (`garita/invitacion/[id]`): la nota completa, en un
  bloque propio debajo de los datos del invitado, con el texto en `text-ink`
  sobre una superficie de los tokens. Es lo que el guardia mira al escanear.
- **Lista del día (las cuatro vistas) y resultados del buscador**: solo un ícono
  de nota (lucide `StickyNote`) al lado del nombre, con la nota en el `title` y
  en un `sr-only` para lectores de pantalla. No se agrega texto a las filas.
- Colores solo de `globals.css`.

No hace falta lógica pura nueva en `web/src/lib`: el contador es
`nota.length`, y el resto es mostrar un campo.

## Pruebas

- **API** (`api/tests`): crear con nota (se guarda recortada), nota de solo
  espacios → `null`, 141 caracteres → 400, editar la nota de una pendiente,
  editar la de una usada → 409 `ya_usada`, alta exprés con nota, la página pública no la devuelve, el
  veredicto y la agenda sí.
- **e2e**: el vecino crea una invitación con nota y la garita la ve en el
  veredicto. Corre con `--workers=1`.
- Antes de cerrar, capturas del formulario (celular) y del veredicto (escritorio)
  para revisarlas con el dueño.

## Fuera de alcance

- Historial de cambios de la nota: una nota editable sin ingresos no cambia
  quién entró, y las ediciones de invitaciones hoy no se auditan.
- Detectar datos sensibles en el texto.
- La nota en la auditoría en pantalla.
