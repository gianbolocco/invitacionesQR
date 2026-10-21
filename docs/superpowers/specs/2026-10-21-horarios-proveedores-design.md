# Horarios de ingreso de proveedores: diseño

Estado: en revisión (21/10). Rama `horarios-proveedores`.

## Problema

Alamo Alto mandó sus reglas por mail: los proveedores (jardineros, pileteros,
electricistas, plomeros, carpinteros, albañiles, corralones, gasistas,
techistas, agua, fletes) entran de lunes a viernes de 8 a 17, o de 8 a 18 de
noviembre a marzo. Los sábados, de 8 a 13, solo pileteros y repartidores de agua.
Fuera de eso entran solo los pedidos (PedidosYa, Coto, Jumbo).

Hoy Pazzit no sabe de rubros ni de horarios: un proveedor con invitación vigente
entra a cualquier hora.

**Regla de oro: nada hardcodeado.** Rubros, días, horarios y temporadas los
carga el admin. Los valores del mail son datos de Alamo Alto, no constantes.

## Subproyectos

Este es el primero de tres:

1. **Horarios de proveedores** (este spec).
2. **Seguro del proveedor**: compañía, póliza y vencimiento, con alerta. Se
   decide después, probablemente con el rubro, porque no a todos se les pide.
3. **Plano del barrio**: rehecho en SVG. Para qué se usa se decide aparte.

## Reglas

1. **Rubros.** Una lista que edita el admin: alta, renombrar y archivar. Un
   rubro archivado sale de la lista del vecino, pero las invitaciones y franjas
   que lo usan siguen andando. No se borran.
2. **Franjas.** Cada franja es una regla:
   - **Días**: lun a dom.
   - **Horario**: desde/hasta en `HH:MM`. El hasta no está incluido, `24:00`
     vale y no cruza la medianoche (desde < hasta).
   - **Temporada** opcional: `dd/mm` a `dd/mm`, que puede cruzar el año
     (1/11 al 31/3).
   - **Rubros**: una lista, o "todos".
3. **A quién aplica.** A `proveedor` y a `frecuente` con
   `frequent_as = 'proveedor'`. Las visitas, y las frecuentes de visita, no
   cambian.
4. **Cuándo pasa.** Un proveedor pasa si **alguna** franja reúne las cuatro
   condiciones:
   - rige hoy por temporada (o no tiene temporada);
   - incluye su rubro, o es de "todos";
   - incluye el día de hoy;
   - contiene la hora actual, en hora de Buenos Aires.
5. **Sin franjas cargadas, no hay restricción.** Una instalación nueva arranca
   así y los proveedores entran como hoy.
6. **Proveedor sin rubro** (los que ya existen, o un insert crudo): solo lo
   habilitan las franjas de "todos".
7. **Feriados**: no existen. Un feriado cuenta como el día de semana que es.
   **Domingos**: si ninguna franja lo incluye, están cerrados.
8. **Delivery**: no se toca. Llega por alta exprés de la garita, que es de
   visita, y no le aplica ninguna franja. Si un vecino lo invita como
   proveedor, el admin puede crear el rubro "Delivery" con una franja de todos
   los días, 0 a 24.
9. **Egresos**: nunca se rechazan, como siempre.
10. **Carga manual** (planilla post corte): no valida franjas. La hora es la
    declarada y el guardia ya decidió en el momento.

## En la garita

- **Rechazo.** Fuera de franja da NO PASA con el motivo "Fuera de horario".
  El detalle muestra el horario de hoy para su rubro ("Plomero: lunes a viernes
  de 8 a 17") y la hora ("Son las 17:40"). Si hoy el rubro no tiene ninguna
  franja: "Su rubro no entra los sábados".
- **"Autorizar igual" pasa a ser discreto**, en el NO PASA de **todos** los
  motivos:
  - es un link subrayado debajo de "Volver", como "Anular esta invitación…";
  - "Volver (Esc)" queda como la acción principal;
  - sigue sin aparecer en una anulada;
  - sigue abriendo el alta exprés precargada (visita, a nombre del guardia,
    auditada).
- **Marcas.** Tarjetas, buscador y veredicto muestran el rubro junto a
  "Proveedor" ("Frecuente · Proveedor · Jardinero").
- **Agenda del día.** No cambia: un proveedor fuera de horario aparece igual en
  la lista del día, porque la franja se evalúa en la barrera.

## Vecino e invitado

- **Formulario.** Con tipo Proveedor, o Frecuente → "A trabajar", aparece el
  **Rubro**. Es obligatorio si el barrio tiene rubros cargados. Debajo, la caja
  "Puede entrar" con las franjas de ese rubro: primero la de la temporada
  vigente y después las otras ("Desde el 1/11 · 8 a 18").
- **Aviso, sin bloqueo.** Si un día elegido no tiene franja para el rubro, sale
  en amarillo "Los sábados no entran plomeros…". En la frecuente, ese día se
  marca en el selector de días. El vecino puede crearla igual.
- **Lista de frecuentes.** Una frecuente de proveedor con días que chocan con
  los horarios actuales lleva una línea en `espera`: "Los sábados no puede
  entrar". Así se entera el vecino si el admin cambia los horarios después.
- **Link del invitado** (`/i/[token]`). Muestra "Horario de ingreso para
  plomeros" con las mismas líneas, y "Fuera de ese horario la guardia no te deja
  pasar".

## Admin

*Administración → Barrio*, sección **Proveedores** (mockup A):

- **Horarios de ingreso.** Una tabla con columnas Días (L M M J V S D),
  Horario, Temporada, Rubros (chips, o "Todos") y Editar.
  - La franja vigente hoy lleva la marca "Hoy".
  - "+ Agregar franja" y un "Guardar horarios" que guarda la lista entera.
- **Rubros.** Chips con renombrar y archivar, y un campo "Nuevo rubro".
- **Recuadro "Hoy"** al costado: cómo ve la garita a los proveedores ahora
  (quién entra hoy, el próximo sábado, el domingo) y el próximo cambio de
  temporada. Sale de la misma función pura que usa la API.

## Datos

```
trade                            (rubro)
  id            uuid pk
  neighborhood_id uuid fk
  name          text not null    unique (neighborhood_id, lower(name))
  archived_at   timestamptz null

invitation.trade_id              uuid null fk trade
  check: solo en proveedor o frecuente con frequent_as = 'proveedor'

neighborhood.provider_windows    jsonb not null default '[]'
  [{ days: number[]            // 0 = domingo, como weekdays
     from: 'HH:MM', to: 'HH:MM'
     season: { from: 'MM-DD', to: 'MM-DD' } | null
     trades: string[] | null   // ids de trade; null = todos
  }]
```

Las franjas van en JSON porque el admin siempre guarda la lista entera, son
pocas, y `canEnter` las recibe junto con el barrio sin joins. Los rubros son
tabla porque la invitación apunta a ellos con FK.

Migración `0017_horarios_proveedores`. Arranca sin rubros y con `[]`.

## Lógica pura

- **`api/src/lib/franjas.ts`**:
  - `dentroDeFranja(franjas, tradeId, now)`: si pasa o no, siempre en hora de
    Buenos Aires con `dates.ts`.
  - `temporadaRige(season, dia)`: cubre el cruce de año.
- **`web/src/lib/franjas.ts`** + `franjas.check.ts`:
  - `franjasDelRubro`
  - `textoHorario` ("Lunes a viernes, 8 a 17")
  - `diasSinFranja` (para el aviso al vecino)
  - `resumenHoy` (para el recuadro del admin)

  Son las mismas reglas, duplicadas a propósito: la API y el front no comparten
  código hoy.
- **`canEnter(inv, now, usedCount, franjas)`**:
  - `InvitationLike` suma `kind`, `frequentAs` y `tradeId`;
  - suma el rechazo `outside_hours` **entre `wrong_weekday` y `no_capacity`**;
  - sigue siendo pura.

## API

- `GET/POST/PATCH /admin/trades`: listar (con archivados), crear y
  renombrar/archivar (`archived: boolean`).
- `GET/PATCH /admin/neighborhood`: suma `providerWindows`, validado con zod.
- `GET /trades` (vecino): rubros activos más `providerWindows`, para el
  formulario.
- `POST /invitations` y `PATCH /invitations/:id`: aceptan `tradeId`.
- `/gate/check`, `/gate/invitation/:id`, `/gate/search`, `/gate/adentro`, la
  agenda y la página pública suman `tradeName`. El check también suma las
  franjas del rubro para el detalle.
- `registerEntry` y `buildCheck` cargan `provider_windows` del barrio y se las
  pasan a `canEnter`. El `FOR UPDATE` no cambia.
- Auditoría y Excel suman la columna **Rubro**.

**Errores:**

| Código | Cuándo |
|---|---|
| `400 rubro_requerido` | proveedor sin rubro, con rubros cargados en el barrio |
| `400 rubro_invalido` | archivado, de otro barrio, o en una invitación que no es de proveedor |
| `400 franja_invalida` | sin días, desde ≥ hasta, hora o temporada mal formada, rubro inexistente |
| `400 rubro_duplicado` | nombre repetido, sin distinguir mayúsculas |
| `409 outside_hours` | al registrar el ingreso |

## Demo

`api/scripts/demo.sql` suma:
- los once rubros del mail y las tres franjas de Alamo Alto;
- dos proveedores con rubro;
- una frecuente de jardinero que va los sábados, que muestra el aviso.

## Pruebas

- **API (vitest):**
  - `canEnter`: orden de `outside_hours` (después de `wrong_weekday`, antes de
    `no_capacity`).
  - Franja de "todos"; rubro listado y no listado.
  - Temporada que cruza el año; borde del hasta (17:00 no entra).
  - Sin franjas, pasa; visita, nunca se evalúa; proveedor sin rubro.
  - Errores de rubro y franja; archivar un rubro en uso.
- **Web (`npm run check`):** `textoHorario`, `diasSinFranja` y `resumenHoy`,
  con temporada vigente y por venir.
- **E2E (`--workers=1`):**
  - el admin carga una franja;
  - el vecino crea un proveedor con rubro y ve el horario;
  - la garita da NO PASA por fuera de horario y el link "Autorizar igual" abre
    el alta exprés.
- Se mira a 1280 px y 390 px, en claro y oscuro.

## Fuera de alcance

- Feriados.
- Rubro en el alta exprés de la garita.
- Franjas que cruzan la medianoche.
- Horarios distintos por lote o por proveedor.
- Avisarle al vecino cuando su proveedor rebota.
- Seguro y plano (subproyectos 2 y 3).
