# Diseño — Garita en escritorio: lectora al frente, veredicto en dos columnas y "Autorizar igual"

Fecha: 2026-10-14
Estado: en revisión
Sigue a: `2026-10-13-lectora-2d-design.md` (la lectora ya funciona; esto es la etapa
que ese spec dejó afuera a propósito).

## 1. Problema

Las pantallas de la garita se diseñaron para el celular: una columna de 672 px,
botones para el pulgar y un botón grande "Escanear QR" como acción principal. En
la compu de la garita, con una lectora 2D:

- El botón de escanear (cámara) es lo primero que se ve, pero no hace falta
  tocar nada: la lectora ya escucha. Y cuando la lectora lee, no hay ningún lugar
  donde se vea que leyó — solo un toast si algo falló.
- El veredicto ocupa una franja angosta en el medio de una pantalla ancha. Lo que
  el guardia sentado necesita comparar (DNI leído contra el de la invitación,
  patente, quién invita) está mezclado en renglones de texto.
- Un NO PASA termina siempre en "Volver". Lo habitual después es llamar al
  vecino, que dice "dejalo pasar", y rehacer todo desde "Autorizar sin
  invitación": buscar el lote, tipear el nombre otra vez.

Cada garita está dispuesta distinto: en algunas el guardia está sentado a 60 cm
de la pantalla, en otras va y viene del auto y la lee a 2 m. Las pantallas
tienen que servir para las dos sin configuración.

## 2. Alcance

### Adentro

- `/garita` en escritorio: un recuadro "Lectora" reemplaza al botón de escanear
  como protagonista; muestra que la lectora funciona y la última lectura.
- Veredicto (`/garita/invitacion/[id]`) desde 1024 px: dos columnas — la
  decisión, grande, a la izquierda; la ficha de comparación y la acción a la
  derecha. Ingreso, egreso, NO PASA y "registrado".
- "Autorizar igual" en el NO PASA (salvo anulada): el alta exprés precargada
  con nombre, documento, patente y lote de la invitación rechazada.

### Afuera, y por qué

- **Configuración por garita** ("modo sentado"/"modo de pie"). Una jerarquía
  bien hecha sirve para los dos; una opción más es algo que alguien tiene que
  acordarse de tocar.
- **El veredicto como panel dentro de `/garita`** o como diálogo. Achica la
  palabra a un tercio de la pantalla (se pierde la lectura de lejos) y en Next
  obliga a rutas interceptadas para mantener el link y el "atrás".
- **El alta exprés como pantalla propia.** Es un formulario de cuatro campos que
  dura 15 segundos; un panel sobre el contexto alcanza.
- **"Autorizar igual" en una invitación anulada.** El vecino dijo explícitamente
  que no; que vuelva a invitar él.
- **Cambios en la API.** Todo sale de lo que ya existe.
- **Mobile.** Por debajo de los cortes indicados, las pantallas quedan como hoy.

## 3. Decisiones

### 3.1 `/garita`: la lectora al frente (≥ 768 px, columna derecha)

Hoy la columna derecha tiene, en este orden: botón "Escanear QR", link "Probar
lectora", "Últimos movimientos". Pasa a:

1. **Recuadro "Lectora"** (componente nuevo `EstadoLectora`):
   - Antes de la primera lectura de la sesión: ícono, **"Escaneá un QR o un DNI
     con la lectora"**, y abajo, chicos, "¿No tenés lectora? **Usar la
     cámara**" (→ `/garita/escanear`) y "**Probar lectora**" (→
     `/garita/lectora`).
   - Después de una lectura: **"Lectora funcionando"** con un check, y la última
     lectura con su resultado y hora. Ejemplos:
     "DNI 46.116.502 · abrió a Gianlucca Bolocco · 14:32",
     "DNI 46.116.502 · sin invitación, alta exprés · 14:32",
     "QR · no es una invitación válida · 14:33",
     "No reconocido · 14:34".
   - No se afirma "conectada" antes de leer: para el navegador una lectora es un
     teclado más, no hay forma de saber si está enchufada.
2. **"Últimos movimientos"**, sin cambios.

Con **pantalla táctil** (`@media (pointer: coarse)`: una tablet desde 768 px),
el botón grande "Escanear QR" vuelve arriba, como hoy, y el recuadro de la
lectora queda debajo. Con mouse, el botón no está: la cámara es el link del
recuadro. Se resuelve con CSS (`pointer-coarse:` de Tailwind v4), sin JS.

**La última lectura** vive en memoria, en la caché de TanStack bajo
`['lectora', 'ultima']` (fuera de `['garita']`, igual que la lectura pendiente).
La escriben el `leer` de `/garita` y el del veredicto, con el resultado ya
resuelto: `{ descripcion: string; cuando: string }`. Del DNI solo entra el
número formateado y el nombre de la invitación encontrada (spec de la lectora,
3.6). `EstadoLectora` la lee con `useQuery` sobre esa clave (sin `queryFn`,
`enabled: false`) para re-renderizar cuando cambia.

Colores y piezas: solo tokens y componentes que existen (estilo de tarjeta de la
agenda / `Nota`). El check usa el ícono de `lucide-react` y el color de texto
normal: se distingue por la palabra y el ícono, no por un verde.

### 3.2 Veredicto en dos columnas (≥ 1024 px)

La pantalla sigue entera y con el campo de hoy (`pass-field`/`deny-field`): ese
color de fondo es lo que se lee a 2 m. A partir de `lg` se divide en una grilla
de dos columnas (≈ 3/5 y 2/5), centrada con un ancho máximo amplio (≈ 80rem).

**Columna izquierda — lo que decide, para leer de lejos:**

- La palabra (INGRESO / EGRESO / NO PASA), más grande que hoy (hay lugar).
- En NO PASA, el motivo y su detalle ("Venció · Era válida hasta el 12/10").
- El nombre del invitado, grande.
- No cambia al registrar: es lo que se mira desde el auto.

**Columna derecha — la ficha, para quien está sentado:**

- Filas etiqueta/valor (una `<dl>`): Documento, Patente, Tipo, Lote, Invita,
  Vigencia, Cupo ("1 de 3 entraron", solo si `capacity > 1` y no es
  frecuente), Entró / Salió.
- **Documento y Patente son los campos editables de hoy**, dentro de la ficha
  (en ingreso). Si el documento vino de la lectora (precarga de
  `useDocumentoLeido` o lectura en el veredicto), una etiqueta chica al lado:
  **"leído del DNI"**. Se apaga si el guardia lo edita.
- **No coincide**: en vez de la frase, los dos números lado a lado, en la fila
  del documento: **"Invitación 30.123.456 · Leído 46.116.502"**. Mismas reglas
  que hoy (por dígitos, desde 7, sin bloquear).
- **La acción**, al pie de la columna:
  - Ingreso / egreso: el botón grande de siempre y debajo los atajos:
    `Enter` registra · `Esc` vuelve (con `<kbd>`).
  - Registrado: "Siguiente (8)" con su barra, "Deshacer", y "o escaneá el
    siguiente" (la lectora ya funciona en esa pantalla).
  - NO PASA: **"Autorizar igual"** (3.3) salvo anulada, y "Volver (Esc)".
- El egreso no tiene campos: muestra cuándo entró y hace cuánto está adentro,
  como hoy.

**Por debajo de 1024 px no cambia nada**: la columna única de hoy. Es **el
mismo componente**; las piezas se reacomodan con la grilla (`lg:`), no hay dos
árboles de JSX. El orden en el DOM sigue siendo palabra → nombre → ficha →
acción, que es también el orden de lectura de un lector de pantalla.

Atajos, foco y lectora no cambian: el foco cae en la acción al cargar, `Esc`
sale, `Enter` registra, y una lectura en el veredicto se comporta como define el
spec de la lectora (3.7).

### 3.3 "Autorizar igual"

En el NO PASA de cualquier motivo **salvo `revoked`**, un botón **"Autorizar
igual"** abre el mismo `AltaExpres`, montado también en el veredicto, con todo
precargado:

- Nombre, documento (el del campo si hay, si no el de la invitación) y patente.
- **El lote ya elegido**, con el `unitId` de la invitación (la API ya lo
  devuelve en el veredicto; el tipo `Resultado` del cliente lo suma) y la línea
  "Lote 142 · invita Martín" (`unitLabel` + `inviterName`). El guardia puede
  "Cambiar" como siempre.

`AltaExpres` gana una prop **`inicial`** (`{ guestName, guestDoc, plate,
unidad }`) que se aplica al abrir, con el mismo patrón de ajuste durante el
render que ya usa para `lectura`. Lo demás del componente no cambia.

Al crear: `router.replace` al veredicto de la invitación nueva (dice INGRESO),
así "Volver" lleva a donde estaba el guardia antes del rechazo, no al rechazo.

La invitación rechazada **no se toca** (sigue vencida, sin cupo, etc.). La nueva
es una alta exprés como cualquier otra: visita, hoy, cupo 1, "Autorizado por
portería". En la auditoría están las dos, que es lo que pasó.

## 4. Errores

| Situación | Qué ve el guardia |
|---|---|
| Falla el alta desde "Autorizar igual" | El toast de hoy ("No se pudo crear la invitación…"); el sheet queda abierto con los datos |
| NO PASA por anulada | No aparece "Autorizar igual"; solo "Volver" |
| Lectura no reconocida en `/garita` | El toast de hoy y, además, "No reconocido · hora" en el recuadro |

## 5. Pruebas

- **E2E (Playwright, los dos proyectos salvo donde se indica):**
  - El vecino crea una visita; el guardia registra ingreso y egreso; la vuelve a
    abrir → "NO PASA · Cupo agotado" → "Autorizar igual" → el alta trae nombre
    y "Lote …" elegido → confirmar → veredicto nuevo con INGRESO.
  - Una invitación anulada: su NO PASA no ofrece "Autorizar igual".
  - Solo `escritorio`: en `/garita`, el recuadro dice "Escaneá un QR o un DNI";
    después de una lectura con la lectora (helper `leerConLectora` existente)
    dice "Lectora funcionando" y la última lectura.
  - Los e2e existentes del veredicto siguen pasando (los selectores por rol y
    label no dependen del layout).
- **Revisión visual** a 390, 768 (y 768 táctil) y 1280 px, claro y oscuro:
  veredicto de ingreso (con y sin "leído del DNI", con y sin no-coincide),
  egreso, NO PASA (con y sin "Autorizar igual"), registrado; `/garita` con el
  recuadro antes y después de leer; el alta sobre el veredicto.
