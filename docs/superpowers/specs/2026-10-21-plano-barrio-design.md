# Plano del barrio: diseño

Estado: implementado (21/10). Rama `seguro-y-plano`. Es el subproyecto 3 del
mail de Alamo Alto.

## Problema

El invitado llega al barrio y no sabe dónde queda el lote 87. Alamo Alto mandó
el plano (153 lotes, una sola entrada) como un PDF escaneado.

## Decisiones

- **El admin sube el plano**, igual que el logo. No va en el código: el código
  es el mismo para todos los barrios.
- **El plano de Alamo Alto lo dibujamos nosotros**, como un SVG esquemático
  tipo mapa de subte: los 153 lotes en su lugar relativo, la entrada, el arroyo
  y la leyenda de velocidad. Se entrega como archivo para subir
  (`docs/barrios/alamo-alto-plano.svg`), no como código.
- **Se resalta el lote del invitado.** Si el SVG trae cada lote como
  `<g id="lote-N">` (el de Alamo Alto los trae), se pinta el lote de destino con
  el color del barrio. Con un PNG o un JPG, o con un SVG sin esos ids, se ve el
  plano sin resaltar.
- **A futuro, no ahora:** la ruta dinámica desde la entrada hasta el lote. Los
  ids de los lotes y el `id="entrada"` del SVG dejan ese camino armado.

## Reglas

1. **Formatos:** SVG, PNG o JPG, de 1 MB como máximo. El tipo se detecta por el
   contenido: PNG y JPG por sus bytes mágicos; SVG si es texto con un elemento
   `<svg`. Cualquier otro formato da `400 formato_no_soportado`.
2. **Dónde se ve:** en `/i/[token]`, en la tarjeta "Plano del barrio · Tu
   destino: Lote 87", debajo de "Cómo llegar". Al tocarla se abre a pantalla
   completa (sobre oscuro, se cierra con ✕ o Esc), con zoom nativo con los
   dedos.
3. **Número de lote:** son los dígitos del `unit.label` ("Lote 87" → 87). Si no
   hay dígitos, no se resalta nada.
4. **Seguridad del SVG.** El SVG lo sube un admin y se muestra **siempre con
   `<img>`**, nunca inline: dentro de un `<img>` los scripts no corren. Además,
   el endpoint que lo sirve manda
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`
   y `X-Content-Type-Options: nosniff`, por si alguien abre la URL directo.
5. **Cómo se resalta.** El servidor agrega antes de `</svg>` una regla
   `<style>#lote-87 rect{fill:COLOR}#lote-87 text{fill:#fff;font-weight:700}</style>`.
   `COLOR` es el color del barrio, o el default de `lib/marca.ts`. El parámetro
   `lote` solo acepta dígitos.

## Datos

```
neighborhood.map_image             bytea null
neighborhood.map_image_mime        text null    'image/svg+xml' | 'image/png' | 'image/jpeg'
neighborhood.map_image_updated_at  timestamptz null
```

Migración `0019_plano_barrio`: van en el barrio, así el backup de la base lo
cubre, igual que el logo.

## API

- `PUT /admin/branding/plano` y `DELETE /admin/branding/plano`: igual que el
  logo, con auditoría `branding.plano_updated` y `branding.plano_removed`.
- `GET /branding/plano?lote=87&v=<versión>`:
  - devuelve los bytes, con el resaltado si es SVG y viene `lote`;
  - se cachea una hora (la versión va en la URL, como el logo);
  - sin plano, `404`.
- `GET /branding` (o lo que hoy expone `tieneLogo` y `logoVersion`): suma
  `tienePlano` y `planoVersion`.

## Pantallas

- **Admin → Barrio:** una tarjeta "Plano del barrio" igual a la del logo, con
  zona para soltar el archivo, vista previa, "Quitar el plano" y la ayuda "SVG,
  PNG o JPG, hasta 1 MB. Si es un SVG con los lotes como `lote-N`, el invitado
  ve su lote resaltado."
- **Invitado:** la tarjeta y la vista a pantalla completa (mockup 2, la
  variante con el lote resaltado).

Mockups: `.superpowers/brainstorm/4655-1792626562/content/seguro-plano-v1.html`
(los mockups 1 y 2).

## Pruebas

- **API:**
  - sube un SVG, un PNG y un `.txt` (que se rechaza);
  - el resaltado aparece solo con `lote` y solo en SVG;
  - `lote=abc` se ignora o da 400;
  - se mandan los headers de seguridad;
  - solo el admin puede subirlo.
- **Web check:** los dígitos del lote salen del label ("Lote 87" → "87",
  "Casa A" → null).
- **E2E:** el invitado ve el plano cuando hay uno cargado.
- El SVG de Alamo Alto tiene los 153 `lote-N` y la `entrada`. Lo chequea el
  script que lo generó.

## Fuera de alcance

- La ruta desde la entrada hasta el lote.
- Mostrarle el plano al vecino o a la garita.
- Editar el plano desde la app.
- Sanitizar el SVG: no hace falta, porque nunca se renderiza inline.
