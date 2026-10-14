# Diseño — Lectora 2D en la garita (QR de invitación y DNI)

Fecha: 2026-10-13
Estado: en revisión

## 1. Problema

Hoy la garita lee solo el QR de la invitación, y solo con la cámara
(`html5-qrcode` en `/garita/escanear`). Eso sirve en el celular, pero en la
compu de la garita el guardia trabaja con una **lectora 2D** (USB, dongle o
Bluetooth) y con ella no pasa nada: el texto se tipea en donde esté el foco, o
en ningún lado.

Además, el DNI argentino trae un PDF417 con número, apellido y nombre. Leerlo
ahorra tipear el documento —que es obligatorio al ingreso— y permite encontrar
la invitación de quien llega sin QR.

Se quiere: leer **QR y DNI**, con **cámara en el celular** y **lectora en la
compu**, conviviendo, y que ande con **cualquier modelo** de lectora razonable.

## 2. Alcance

### Adentro

- Un parser único `interpretarLectura(texto)` para QR y DNI (formato nuevo y
  viejo), que repara el texto que llega deformado por la distribución de
  teclado.
- Un hook `useLectora` que reconoce la ráfaga de una lectora-teclado en
  `/garita` y en el veredicto, sin campo enfocado.
- Campos de texto que reconocen una lectura completa (buscador, Documento del
  veredicto, Documento del alta exprés).
- El escáner de cámara lee también PDF417.
- Resolución de un DNI leído: una invitación → veredicto; varias → lista;
  ninguna → por apellido → alta exprés precargada.
- Aviso en el veredicto si el DNI leído no coincide con el de la invitación.
- Búsqueda por documento comparando solo dígitos (`46116502` encuentra
  `46.116.502`).
- Pantalla "Probar lectora" para instalar y calibrar un modelo nuevo.

### Afuera, y por qué

- **Registrar el ingreso solo con leer el DNI.** La lectura completa los datos
  y deja el foco en "Registrar ingreso": confirma el guardia con Enter. El
  veredicto existe para que alguien lo lea antes de abrir la barrera; una
  lectura prueba que hay un DNI cerca de la lectora, no que esa persona esté
  ahí; y el "¿quién lo dejó pasar?" de la auditoría se sostiene en una
  decisión de un guardia. Un Enter cuesta un toque.
- **Rediseño de las pantallas post-lectura para escritorio** (veredicto de
  ingreso/egreso/rechazo y alta exprés). Queda para una etapa siguiente, con la
  lectora ya usada en una garita real: rediseñar antes es adivinar qué estorba.
- **Lectoras en modo HID-POS o "Alt+numpad".** El navegador no recibe texto
  utilizable. Se configuran en modo teclado (todas las del mercado lo traen).
- **Distribuciones AZERTY/QWERTZ.** Intercambian letras del token; en Argentina
  no se usan.
- **WebHID / WebSerial.** Requieren permisos por dispositivo y solo andan en
  Chrome de escritorio; el modo teclado anda en todos lados sin instalar nada.
- **Guardar los datos extra del DNI** (trámite, sexo, nacimiento, emisión).
  Ver 3.6.

## 3. Decisiones

### 3.1 Un parser puro, con su check

`web/src/lib/lectora.ts`, con `lectora.check.ts` al lado (corre en
`npm run check`, como el resto de `lib/`).

```ts
type Lectura =
  | { tipo: 'qr'; token: string }
  | { tipo: 'dni'; documento: string; apellido: string; nombre: string }

function interpretarLectura(texto: string): Lectura | null
```

`tokenDelQr` se mueve del escáner a este archivo; el escáner lo importa.

### 3.2 El texto deformado se repara, no se le pide al guardia que configure nada

Una lectora-teclado manda códigos de tecla **US**. Con Windows en español
(España o Latinoamérica, que deforman igual) llegan cambiados:

| Mandó | Llega |
|---|---|
| `@` | `"` |
| `:` | `Ñ` |
| `/` | `-` |
| `-` | `'` |
| `_` | `?` |

Ejemplos reales de una lectora en esta instalación:

```
00705994066"BOLOCCO VERONELLI"GIANLUCCA VALENTINO"M"46116502"B"12-09-2004"06-06-2023"209
httpsÑ--qa.visitpass.quest-i-mcNlErk30BgByd7asEPm7Q
```

La tabla inversa se aplica **solo si el texto delata la deformación**: un QR
que empieza con `httpsÑ`/`httpÑ`, o un DNI que trae `"` y ningún `@`. Un texto
limpio (cámara, lectora bien configurada) no se toca; aplicar la tabla a
ciegas rompería los `-` legítimos de un token.

**Bloq Mayús**: invierte mayúsculas y el token es sensible a ellas. Se detecta
por `HTTPS` en mayúsculas al principio y se invierte la caja de todo el texto.
En un DNI no importa: apellido y nombre se normalizan igual.

**Prefijo/sufijo** que algunas lectoras agregan (`]Q1`, `]L2`, un espacio): el
parser busca el patrón dentro del texto (`/i/<token>`, o los campos separados
por `@`), no exige que esté al principio ni al final.

### 3.3 Los dos formatos del DNI

- **Nuevo** (PDF417 al frente): `trámite@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@NAC@EMISIÓN@…`.
  Al menos 8 campos; el primero es numérico. Documento en el campo 4.
- **Viejo** (PDF417 al dorso): empieza con `@`:
  `@DNI@EJEMPLAR@…@APELLIDO@NOMBRE@…`. Documento en el campo 1, apellido y
  nombre en el 4 y 5.

El documento se valida como 7 u 8 dígitos (el viejo puede traer espacios o una
letra de sufijo: se queda con los dígitos). Si no valida, `null`: mejor "no
reconocido" que abrir la invitación equivocada. Apellido y nombre salen en
caja de título ("Bolocco Veronelli", "Gianlucca Valentino").

### 3.4 Cómo se reconoce una lectora: por ritmo, no por dispositivo

El navegador no distingue una lectora de un teclado. Lo que las separa es el
ritmo: una lectora tipea 30–90 caracteres en una ráfaga; una persona promedia
más de 80 ms por tecla.

`web/src/lib/use-lectora.ts`: `useLectora(onLectura, { activo })`.

- Escucha `keydown` en `window`, en fase de **captura** (antes que el botón
  enfocado).
- Junta las teclas de un carácter (`e.key.length === 1`); ignora modificadores
  y teclas muertas (`Dead`), y `Unidentified` (teclados virtuales de Android).
- Es lectura si: **≥ 8 caracteres**, **promedio < 35 ms por carácter**, y
  **ningún hueco > 200 ms**. El promedio, y no el hueco entre cada tecla,
  porque Bluetooth entrega en paquetes: varias teclas juntas y una pausa de
  80–150 ms.
- Termina con **Enter**, **Tab**, o **250 ms sin teclas** (lectoras sin
  terminador). Si terminó con Enter o Tab y fue lectura, se anulan
  (`preventDefault` + `stopPropagation`): sin eso, el Enter de la lectora
  dispara "Registrar ingreso" del invitado anterior, que es donde está el foco.
- **Tandas** (modo inventario de las inalámbricas: al reconectar descargan todo
  lo guardado): si llegan varias lecturas seguidas sin pausa entre ellas, vale
  la **última**. Configurar la lectora en "envío inmediato" va en la guía de
  instalación.
- Con el foco en un `input`/`textarea`/`contenteditable` **no actúa**: ver 3.5.

Los umbrales (8, 35, 200, 250) son constantes exportadas con nombre, juntas al
principio del archivo: son la perilla de calibración. "Probar lectora" (3.9)
muestra los valores de cada ráfaga para ajustarlas con datos.

La detección de ráfaga es pura (una función que recibe `{ key, t }[]` y
devuelve las lecturas) y va en el `lectora.check.ts`; el hook es solo el
cableado con `window` y los timers.

### 3.5 Campos de texto que reciben una lectura

Si el foco está en un campo, la lectura cae ahí como texto. Tres campos la
reconocen:

| Campo | Qué hace con una lectura |
|---|---|
| Buscador de `/garita` | QR → veredicto. DNI → resolución de 3.7. Se vacía. |
| Documento del veredicto | DNI → queda solo el número. |
| Documento del alta exprés | DNI → número; si el nombre está vacío, lo completa. |

Se reconoce en dos momentos: al **Enter/Tab** en el campo (se anula, así el
Enter de la lectora no envía el formulario del alta exprés con el texto
crudo), y al **quedar quieto** el valor (`useDemora`), para las lectoras sin
terminador. En los dos casos se pasa el valor entero por `interpretarLectura`:
un valor tipeado a mano nunca parsea como lectura (un DNI pide ≥ 8 campos, un
QR pide `/i/`).

Un helper `useCampoLectora(valor, alLeer)` lo resuelve igual para los tres.

### 3.6 Del DNI se usan tres datos y el resto no sale del parser

El PDF417 trae número de trámite, sexo, fecha de nacimiento y de emisión. El
parser devuelve solo documento, apellido y nombre: lo demás no llega a ningún
estado, ni a la API, ni a la URL (Ley 25.326, ver "Pendiente" del README).

La lectura pendiente entre pantallas viaja en **memoria** (caché de TanStack
bajo una clave fuera de `['garita']`, mismo patrón que `usePrecargarVeredicto`),
no en la query string: así el DNI y el nombre no quedan en el historial del
navegador de la compu de la garita.

### 3.7 Qué hace cada lectura, según dónde

| Dónde | QR | DNI |
|---|---|---|
| `/garita` | Veredicto (`porToken` + precarga, como la cámara) | Resolución (abajo) |
| Veredicto, ingreso pendiente | `router.replace` al veredicto de ese QR | Completa Documento y enfoca "Registrar ingreso" |
| Veredicto: ya registrado, egreso o NO PASA | `router.replace` al veredicto de ese QR | Resolución |
| Escáner de cámara | Igual que hoy | Resolución |
| `/garita` con el alta exprés abierta | Cierra el alta, abre ese veredicto | Completa documento (y nombre si está vacío) |

`router.replace` entre veredictos: el "Volver" sigue llevando a donde estaba el
guardia antes de la primera lectura, no al veredicto anterior.

**Resolución de un DNI** (vive en `/garita`; el escáner y el veredicto dejan la
lectura pendiente y navegan ahí):

1. `GET /gate/search?q=<documento>`.
2. **Un resultado** → veredicto, con el documento leído precargado.
3. **Varios** → el buscador muestra el documento y la lista; elige el guardia.
4. **Ninguno** → `GET /gate/search?q=<primer apellido>`. Si hay resultados, se
   muestran en la lista **sin abrir ninguno**: coincidir por apellido no
   alcanza para abrir el veredicto de alguien.
5. **Tampoco** → alta exprés abierta con nombre ("Gianlucca Valentino Bolocco
   Veronelli") y documento cargados. Falta elegir el lote.

En la lista (pasos 3 y 4), abrir un resultado precarga el documento leído en
ese veredicto.

### 3.8 DNI que no coincide

En el veredicto, si la invitación tiene `guestDoc` y el Documento del campo
(leído o tipeado) tiene otros dígitos, aparece un aviso sobre el campo: **"El
DNI no coincide con el de la invitación (30.123.456)."** No bloquea: decide el
guardia, que es quien tiene a la persona adelante. Comparación por dígitos,
para que `30.123.456` y `30123456` no disparen el aviso.

`registerEntry` ya no pisa un `guestDoc` existente; eso no cambia.

### 3.9 Probar lectora

`/garita/lectora`, enlazada desde la columna derecha de `/garita` en
escritorio, debajo de "Escanear QR". Dentro del `ChromeGarita`.

Muestra las últimas lecturas de la sesión, en memoria (no se mandan a ningún
lado): texto crudo, texto reparado, cantidad de caracteres, promedio y hueco
máximo en ms, terminador (Enter/Tab/pausa), y la interpretación (QR con token,
DNI con número y nombre, o "No reconocido"). Avisa si detectó una tanda (3.4).
Si una ráfaga no pasó como lectura por los umbrales, también aparece, marcada:
es justamente el caso que hay que poder ver.

No navega ni registra nada: es para instalar, no para operar.

### 3.10 El escáner de cámara lee PDF417

`formatsToSupport: [QR_CODE, PDF_417]` y
`useBarCodeDetectorIfSupported: true` (el `BarcodeDetector` nativo de Chrome
en Android lee PDF417 bastante mejor que la implementación en JS). El texto de
la cámara llega limpio y pasa por el mismo `interpretarLectura`.

Expectativa honesta: con la cámara del celular el DNI cuesta (código chico,
denso y con reflejo). Es un extra; el camino del celular sigue siendo el QR.
El texto del pie pasa a "Centrá el QR o el código del DNI en el marco."

## 4. API

### `searchGuests` — documento por dígitos

Se agrega, al `or(...)` existente, la comparación de solo dígitos cuando la
búsqueda tiene al menos 3:

```sql
regexp_replace(guest_doc, '\D', '', 'g') like '%46116502%'
```

Arregla también la búsqueda a mano sin puntos. Sin endpoints nuevos ni cambios
de esquema.

## 5. Errores

| Situación | Qué ve el guardia |
|---|---|
| Ráfaga que no es QR ni DNI | Toast: "No se reconoció el código. Probá de nuevo o buscá por nombre." |
| QR de un token inexistente | Lo de hoy: "Ese QR no es de una invitación válida." |
| Sin red al resolver | Toast de error, la lectura no se pierde de la pantalla: se puede reintentar leyendo de nuevo |
| DNI distinto al de la invitación | Aviso de 3.8, sin bloquear |

## 6. Pruebas

- `lectora.check.ts`:
  - los dos ejemplos reales de 3.2 → DNI `46116502` / QR `mcNlErk30BgByd7asEPm7Q`;
  - los mismos, limpios (con `@` y `https://`);
  - DNI formato viejo;
  - QR con Bloq Mayús; QR con prefijo `]Q1` y sufijo;
  - token con `-` y `_` deformados (`'` y `?`);
  - basura, texto humano y DNI con documento inválido → `null`;
  - detección de ráfaga: lectora rápida, lectora Bluetooth con pausas en
    paquetes, persona tipeando rápido (no es lectura), tanda de dos lecturas
    (vale la última), sin terminador.
- API (vitest): `searchGuests('46116502')` encuentra una invitación con
  `guestDoc = '46.116.502'`.
- E2E (Playwright): en `/garita`, `keyboard.type` con 5 ms de demora y Enter
  del QR deformado → veredicto; en el veredicto, ráfaga del DNI → Documento
  completo y foco en "Registrar ingreso"; DNI sin invitación → alta exprés
  precargada.
- A mano, antes de cerrar: lectora USB real, una Bluetooth si hay, y la cámara
  de un Android con un DNI.

## 7. Guía de instalación (va al README)

- Lectora en **modo teclado (HID keyboard)**, terminador Enter (Tab o ninguno
  también andan), **envío inmediato** (no inventario/batch).
- La distribución de teclado de la lectora puede quedar en US aunque Windows
  esté en español: se repara sola.
- Probarla en *Garita → Probar lectora* con un QR de invitación y un DNI.
