# Seguro del proveedor: diseño

Estado: en revisión (21/10). Rama `seguro-y-plano`. Es el subproyecto 2 del
mail de Alamo Alto; sigue a `2026-10-21-horarios-proveedores-design.md`, que
introdujo los rubros.

## Problema

El barrio pide "un campo donde se pueda volcar el seguro de los proveedores:
compañía, número de póliza y vencimiento, con alerta". Hoy un albañil entra con
la invitación vigente aunque su póliza haya vencido hace meses.

## Decisiones

- **El seguro va en la invitación, no en una entidad proveedor.** El caso
  típico es la frecuente de proveedor, donde una sola carga dura meses, y
  "Volver a invitar" copia los datos.
  - Una entidad suma un padrón para mantener, duplicados entre vecinos y la
    privacidad de lo que carga otro.
  - Se revisa si la lista de vencimientos se llena de la misma póliza en muchos
    lotes, o si el barrio pide bloquear o seguir a una empresa. La migración es
    directa: los tres campos pasan a `provider`.
- **Datos:** los tres del mail (compañía, número de póliza y vencimiento).
  Nada más hasta que el barrio lo pida.
- **Quién lo carga:** el vecino al invitar, el proveedor desde su link o el
  guardia en la barrera. Gana el último que lo edita.

## Reglas

1. **El rubro pide seguro.** El admin marca "Pide seguro" en cada rubro. Lo
   piden solo las invitaciones a las que aplican las franjas (proveedor, o
   frecuente con `frequent_as = 'proveedor'`) con un rubro que lo pide. Un
   proveedor sin rubro no lo pide.
2. **Completo** quiere decir los tres campos cargados. Si llega un campo
   suelto, la API responde `400 seguro_incompleto`: se cargan los tres o
   ninguno. Para borrarlo se mandan los tres en null.
3. **Vigente** quiere decir `insurance_expires_on >= hoy` en Buenos Aires: la
   póliza vale hasta el día que vence, inclusive.
4. **En la barrera, si lo pide y no está completo o venció, NO PASA:**
   - "Sin seguro", o "Seguro vencido", con el detalle "Venció el 12/10 ·
     La Segunda · Póliza 4471-22".
   - El guardia corrige los tres campos en el veredicto y usa "Guardar seguro y
     registrar ingreso": se actualiza la invitación y entra, todo en la misma
     transacción.
   - También puede usar "Autorizar igual…".
5. **Por vencer.** El admin fija `insurance_warn_days` (1 a 90; vacío = no
   avisa), en *Barrio → Alertas*, junto a las de permanencia. En el veredicto
   (INGRESO) aparece la línea "Seguro vence en 5 días (26/10)" en `espera`. No
   bloquea.
6. **Lista del admin.** En el tablero, el bloque "Seguros de proveedores" tiene
   **una fila por invitación** vigente que pide seguro y lo tiene sin cargar,
   vencido o por vencer.
   - Columnas: estado, invitado, rubro, lote, compañía · póliza y vence.
   - Orden: vencidos, por vencer (el más cercano primero) y sin cargar.
   - Una póliza repetida en varios lotes **no** se agrupa: son invitaciones
     distintas.
7. Los egresos y la carga manual no se tocan, como siempre.

## canEnter

- Suma `no_insurance` e `insurance_expired` **después de `no_capacity`**: el
  seguro es lo único que se arregla en la barrera, y no tiene sentido pedirlo
  si el cupo ya se agotó.
- `InvitationLike` suma `requiresInsurance: boolean`, que resuelve quien llama
  con rubro, kind y subtipo, más `insuranceComplete: boolean` e
  `insuranceExpiresOn: string | null`.
- Sigue siendo pura.

## Datos

```
trade.requires_insurance          boolean not null default false
invitation.insurance_company      text null   check char_length <= 80
invitation.insurance_policy       text null   check char_length <= 40
invitation.insurance_expires_on   date null
neighborhood.insurance_warn_days  smallint null  check 1..90
```

Migración `0018_seguro_proveedor`.

## API

- `PATCH /admin/trades/:id` acepta `requiresInsurance`. `GET /invitations/trades`
  lo devuelve por rubro.
- `GET/PATCH /admin/neighborhood`: `insuranceWarnDays`.
- `POST /invitations`, `PATCH /invitations/:id` y `PATCH /invitations/public/:token`
  aceptan `insurance: { company, policy, expiresOn } | null`.
  - Si se carga seguro en una invitación que no lo pide, la API responde
    `400 seguro_no_aplica`.
  - El vecino puede dejarlo vacío.
- **Ingreso.** El endpoint de registrar ingreso acepta `insurance` opcional. Si
  viene, se guarda dentro de la transacción, después del `FOR UPDATE` y antes
  de `canEnter`, y se audita como `invitation.insurance_updated` a nombre del
  guardia.
- **Lecturas.** El check de la garita, la página pública y las filas del vecino
  devuelven `requiresInsurance`, `insurance` e `insuranceWarnDays` (este último
  solo en el check).
- `GET /admin/insurance`: las filas de la regla 6.
- **Auditoría y Excel:** columna **Seguro** (`La Segunda · 4471-22 · vence 12/04/2027`).

## Pantallas

- **Admin → Barrio → Rubros:** cada chip lleva el tilde "Pide seguro".
  **Alertas:** "Seguro por vencer: avisar N días antes".
- **Admin → Tablero:** bloque "Seguros de proveedores" (mockup 4, sin agrupar).
- **Vecino:** si el rubro elegido pide seguro, aparece el bloque opcional
  "Seguro" con los tres campos, y la nota "Los albañiles necesitan seguro para
  entrar. Si no lo tenés, lo puede cargar él desde su link." Si se llena un
  campo, se piden los tres. "Volver a invitar" los copia.
- **Link del proveedor:** el bloque "Tu seguro", con la nota "Sin un seguro
  vigente la guardia no te deja pasar.", junto al documento y la patente.
- **Garita:**
  - NO PASA por seguro: los tres campos editables, con "Guardar seguro y
    registrar ingreso" como acción principal, "Volver (Esc)" y "Autorizar
    igual…" (mockup 3).
  - INGRESO: fila "Seguro" en la ficha, más la línea de por vencer si
    corresponde.

Mockups: `.superpowers/brainstorm/4655-1792626562/content/seguro-plano-v1.html`
(los mockups 3, 4 y 5; el 4 sin la agrupación por póliza).

## Lógica pura (web)

`web/src/lib/seguro.ts` y `seguro.check.ts`:
- `estadoSeguro(inv, hoy, warnDays)` → `'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'`;
- `textoVence(expiresOn, hoy)` → "vence en 5 días (26/10)", "vence hoy" o
  "venció el 12/10".

## Demo

En `demo.sql`, Albañil, Gasista, Electricista y Techista piden seguro. Se suman
un albañil con la póliza vencida, un gasista que vence en 5 días, un
electricista sin cargar, y `insurance_warn_days = 15`.

## Pruebas

- **API:**
  - orden de `canEnter`: `no_capacity` gana sobre `no_insurance`; vence hoy,
    pasa; vencido ayer, no;
  - `seguro_incompleto` y `seguro_no_aplica`;
  - ingreso con `insurance` que destraba el NO PASA y queda auditado;
  - `/admin/insurance`: filtra y ordena.
- **Web check:** `estadoSeguro` y `textoVence`.
- **E2E:** la garita frena a un albañil sin seguro, carga los datos y registra
  el ingreso.

## Fuera de alcance

- Entidad o padrón de proveedores.
- Mails automáticos (no hay jobs).
- Tipo de cobertura, ART, CUIT.
- Foto de la póliza.
- Aviso de vencimiento en las tarjetas de la agenda: solo va en el veredicto.
