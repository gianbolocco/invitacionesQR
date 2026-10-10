# Diseño — VisitPass: un producto, un barrio por instalación

Fecha: 2026-10-10
Estado: aprobado para pasar a plan de implementación

## 1. Problema

La app es de Álamo Alto. El nombre del barrio está clavado en 8 lugares del
código, la identidad visual salió de su cartel de entrada, y no hay forma de
instalarla en otro barrio sin editar archivos.

La idea es que sea un producto —**VisitPass**— que se instala en cualquier
barrio cambiando configuración, no código.

## 2. Modelo elegido

**Un despliegue por barrio.** Gianluca lo instala; no hay registro público ni
pagos en la app. Cada barrio tiene su stack, su base y su dominio.

Esa decisión resuelve tres cosas de arranque:

- **El aislamiento entre barrios deja de hacer falta.** Era el ítem más grande
  que quedaba pendiente. Con una sola fila en `neighborhood` por base, el
  agujero —un admin que puede operar sobre cuentas de otro barrio— no tiene
  consecuencia alcanzable.
- **El alta de barrio no es una pantalla.** Es el arranque de la instalación.
- **Una caída no se lleva a todos los barrios**, y cada uno actualiza cuando
  quiere.

Costo asumido: N stacks que mantener y N backups. Con Coolify, clonar un
recurso y cambiar cuatro variables es la operación completa.

## 3. Alcance

### Adentro

- Seed del barrio y su primer admin desde variables de entorno, idempotente.
- Los 8 strings con "Álamo Alto" leen el nombre del barrio o dicen VisitPass,
  según a quién le hablen.
- Color de marca por barrio, de una paleta curada.
- Logo por barrio, opcional.
- Se borran los tests de aislamiento salteados.

### Afuera, y por qué

- **Favicon por barrio.** Mucho trabajo —generar varios tamaños, servirlos,
  invalidar caché— para poco.
- **Tipografía configurable.** La Archivo con eje de ancho es parte de la
  identidad del producto, no del barrio.
- **Textos de los mails personalizables.** Hoy son dos mails cortos; cuando
  alguien los quiera distintos, se verá.
- **Selector de color libre.** Ver 4.3: se puede abrir después sin migrar nada.
- **Multi-barrio en una instancia.** Descartado por el modelo elegido.

## 4. Decisiones

### 4.1 Separación de marcas

| Dónde | Qué dice |
|---|---|
| Todo lo que ve el vecino, el invitado y el guardia | **el nombre del barrio**, con su logo y su color |
| Login, `<title>`, footer, repo, documentación | **VisitPass** |
| Autor del archivo Excel | el barrio, no el producto |

El criterio: el vecino no le compró nada a VisitPass, le pidió el acceso a su
barrio. El producto se nombra donde habla con quien lo instala o lo evalúa.

### 4.2 El barrio se configura por entorno, no por pantalla

Al arrancar, la API corre un seed idempotente:

```
BARRIO_NOMBRE=Álamo Alto          # obligatorio para sembrar
BARRIO_DIRECCION=Ruta 8 km 62, Pilar
BARRIO_MAPA=https://maps.google.com/?q=...
ADMIN_EMAIL=gianluca@ejemplo.com  # obligatorio para sembrar
ADMIN_NOMBRE=Gianluca
```

Si ya hay un barrio, no hace nada. Si faltan `BARRIO_NOMBRE` o `ADMIN_EMAIL`
—cualquiera de las dos— tampoco siembra y la API levanta igual: es el caso de
una base que se configuró a mano. Si no hay barrio y están las dos, crea el
barrio, crea el admin en estado `invited` y le emite el token de alta —el mismo flujo real, así el admin
elige su contraseña—. Sin `RESEND_API_KEY` el link sale por el log, que es lo
que ya pasa hoy.

Se eligió el entorno por encima de un asistente de primera ejecución porque una
pantalla que se usa una vez por instalación y después queda muerta es peor que
cuatro variables en la UI de Coolify. La dirección y el mapa, además, **ya son
editables** desde *Administración → Barrio*; el entorno solo siembra el valor
inicial.

### 4.3 Paleta curada, no selector libre

El color de marca se usa como fondo con texto claro encima (`bg-marca` +
`text-surface`). Con un selector libre, un barrio que elija amarillo o celeste
deja ese texto ilegible, y sería un diseño que nunca probé.

Ocho colores verificados en los dos temas. De cada uno se derivan las variantes
con `color-mix()` en oklab: lo hace el navegador, sin librería ni matemática
propia.

**En la base se guarda un hex igual**, así que abrir el selector libre más
adelante es sacar una validación, no migrar datos.

El veredicto de la garita no se ve afectado: usa `pass-field` y `deny-field`,
que son propios y deliberadamente **no** dependen de la marca. La parte crítica
para la seguridad queda intacta.

### 4.4 El logo: solo PNG y JPG

Es la primera vez que la app acepta un binario de un usuario.

**Un SVG puede contener JavaScript.** Servido desde el mismo origen que la app
—y acá todo vive detrás de un solo origen a propósito— eso es un XSS que se
lleva la sesión del admin. Se puede mitigar con CSP o sirviéndolo desde otro
dominio; la forma barata y segura es no aceptarlo.

El logo es **opcional**: sin él queda el wordmark en itálica con el nombre del
barrio, que es lo que hay hoy.

### 4.5 El color se lee en el servidor, no en el cliente

El layout raíz de Next es un componente de servidor: lee la marca de la API e
inyecta la variable CSS en el HTML. Sin parpadeo y sin fetch en el cliente.

Si la API no responde, cae al verde por defecto y la página igual se dibuja. El
color es decoración: no puede voltear la app.

La alternativa era hornearlo como `NEXT_PUBLIC_*` en el build, que es más
simple pero obliga a rebuildear para cambiar un color. Se descartó porque el
color vive en la misma pantalla de admin que el logo.

## 5. Modelo de datos

```sql
ALTER TABLE neighborhood ADD COLUMN brand_color text;
ALTER TABLE neighborhood ADD COLUMN logo_mime text;
```

- `brand_color`: hex `#rrggbb`. NULL es el verde por defecto del producto.
- `logo_mime`: `image/png` o `image/jpeg`. NULL significa que no hay logo.

El archivo vive en un volumen, con el **id del barrio como nombre** y sin
extensión. Que el nombre sea el uuid y no venga del cliente es lo que cierra
cualquier intento de escribir fuera del directorio.

```
LOGO_DIR=/data/branding     # volumen montado en el contenedor de la API
```

## 6. API

### `GET /branding` — público, sin sesión

Lo consume el layout de Next antes de que haya sesión, y la página del invitado.

**Desde el servidor la URL no es la misma que desde el navegador.** El front
llama a `/api` relativo, que solo resuelve en el browser; el layout corre dentro
del contenedor y tiene que pegarle a la API por la red de Docker. Hace falta una
variable nueva, de runtime y no de build:

```
API_INTERNAL_URL=http://api:8080
```

```ts
{ nombre: string, color: string, tieneLogo: boolean }
```

`color` siempre viene resuelto: el del barrio o el default. Quien lo consume no
tiene que saber el default.

### `GET /branding/logo` — público

Devuelve el archivo con su `Content-Type` guardado, o `404` si no hay. Cachea
con `ETag` sobre el mtime: el logo cambia una vez por año.

### `PUT /admin/branding/logo` — admin

`multipart/form-data`, un campo `logo`. Valida, en este orden:

1. Tamaño máximo **500 KB**, cortado en el stream y no después de leerlo entero.
2. **Los bytes mágicos del archivo**, no la extensión ni el `Content-Type` que
   mandó el cliente: PNG arranca con `89 50 4E 47`, JPEG con `FF D8 FF`.

Cualquier otra cosa: `400 formato_no_soportado`.

### `DELETE /admin/branding/logo` — admin

Vuelve al wordmark de texto.

### `PATCH /admin/neighborhood` — gana un campo

`brandColor`, validado contra la paleta. Fuera de ella: `400 color_invalido`.

## 7. Front

### Tokens

`--alamo` → `--marca`, `--alamo-deep` → `--marca-deep`, `--alamo-line` →
`--marca-line`. Es un renombre mecánico; el token nunca debió llevar el nombre
del barrio.

Hoy los tres están escritos a mano por tema. Pasan a derivarse:

El hex inyectado va en un token **aparte**, `--marca-base`, que no cambia con
el tema. Es necesario: dentro del bloque oscuro no se puede escribir
`--marca: color-mix(… var(--marca) …)`, porque un token no puede derivarse de
sí mismo. Con una base fija los dos temas derivan de lo mismo y el valor
inyectado aparece una sola vez en el HTML.

```css
:root {
  --marca-base: #1e6b47;        /* lo único que inyecta el servidor */

  --marca: var(--marca-base);
  --marca-deep: color-mix(in oklab, var(--marca-base) 65%, black);
  --marca-line: color-mix(in oklab, var(--marca-base) 8%, white);
}
:root[data-theme='dark'] {
  /* En oscuro la marca sube un paso de la escala: el verde #1e6b47 sobre
     fondo oscuro no llega a contraste de texto. */
  --marca: color-mix(in oklab, var(--marca-base) 55%, white);
  --marca-deep: color-mix(in oklab, var(--marca-base) 75%, white);
  --marca-line: color-mix(in oklab, var(--marca-base) 6%, white);
}
```

Los porcentajes son el punto de partida y **se ajustan contra el verde actual**:
el criterio de aceptación es que `#1e6b47` produzca valores cercanos a los de
hoy (`#0d3d28` / `#5cb98a` / `#8fd4ae`), porque esa combinación ya está
validada. Después se revisan los ocho colores.

### La paleta

Ocho, todos lo bastante oscuros como para llevar texto claro encima en el tema
claro, que es la restricción que los define:

| Nombre | Hex |
|---|---|
| Verde (default) | `#1e6b47` |
| Petróleo | `#14565c` |
| Azul | `#1d4e89` |
| Índigo | `#3b3b7a` |
| Violeta | `#5b3a75` |
| Bordó | `#7a1f3d` |
| Terracota | `#8a3c1e` |
| Pizarra | `#36454f` |

### Dónde aparece el logo

Encabezado (`Shell`) y página del invitado (`Cabecera`), en los dos a través de
`Wordmark`, que es el único componente que conoce la marca. Si hay logo lo
muestra; si no, el nombre del barrio en itálica.

### Los 8 strings

| Archivo | Pasa a |
|---|---|
| `layout.tsx` × 2 (title, description) | VisitPass |
| `login/page.tsx` (`not_in_padron`) | el nombre del barrio |
| `qr-share.tsx` × 2 (texto de WhatsApp) | el nombre del barrio |
| `ui.tsx` (Wordmark) | el nombre del barrio, o el logo |
| `admin/guardias/page.tsx` (placeholder) | genérico, sin dominio |
| `api/src/lib/excel.ts` (autor) | el nombre del barrio |

### Pantalla de administración

*Administración → Barrio* ya edita nombre, dirección y mapa. Se le agregan la
paleta de ocho y la subida del logo. No hay pantalla nueva.

## 8. Errores

| Situación | Respuesta |
|---|---|
| Logo de más de 500 KB | `400 archivo_muy_grande` |
| Logo que no es PNG ni JPEG | `400 formato_no_soportado` |
| Color fuera de la paleta | `400 color_invalido` |
| `GET /branding/logo` sin logo | `404` |
| La API no responde al pintar el layout | verde por defecto, la página se dibuja |

## 9. Tests

- El seed es idempotente: dos arranques seguidos dejan un barrio y un admin.
- El seed sin `BARRIO_NOMBRE` no revienta: no siembra y la API levanta igual.
- El seed crea el admin en `invited` con su token de alta.
- `GET /branding` devuelve el color por defecto cuando `brand_color` es NULL.
- Un PNG sube y se sirve con `image/png`.
- **Un SVG se rechaza aunque venga con `Content-Type: image/png`.** Es el test
  que importa: prueba que se miran los bytes y no lo que dijo el cliente.
- Un archivo de 600 KB se rechaza.
- Un color fuera de la paleta se rechaza; uno de la paleta se guarda.
- `DELETE` del logo deja `logo_mime` en NULL y el `GET` en 404.
- Un vecino no puede subir ni borrar el logo.
- Los 204 tests actuales siguen pasando.
