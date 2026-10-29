# Specs y planes

Cada feature tiene su diseño en `specs/` y su plan en `plans/`, con la fecha en
el nombre. Están todos implementados y en `dev`. Lo que el código hace hoy lo
manda el [README](../../README.md): si una spec lo contradice, ganó un cambio
posterior.

| Spec | Qué decidió | Vigencia |
|---|---|---|
| [invitaciones-qr](specs/2026-09-14-invitaciones-qr-design.md) | El modelo base: invitación por UF, tipos, cupo, garita | Vigente |
| [egresos](specs/2026-09-18-egresos-design.md) | Ingreso o egreso según haya fila abierta | Vigente |
| [visitpass-multibarrio](specs/2026-10-10-visitpass-multibarrio-design.md) | Un despliegue es un barrio; nombre, color y logo como datos | Vigente (el nombre ahora es Pazzit) |
| [rediseno-ui](specs/2026-10-11-rediseno-ui-design.md) y fases 3 a 5 | Rediseño del front | Implementado; la identidad visual la cambió después [docs/rediseno/](../rediseno/) (Pazzit) |
| [garita-alta-expres](specs/2026-10-12-garita-alta-expres-design.md) | Autorizar sin invitación; DNI obligatorio al ingreso | Vigente |
| [lectora-2d](specs/2026-10-13-lectora-2d-design.md) | Lectora HID: QR y DNI sin campo enfocado | Vigente |
| [garita-escritorio](specs/2026-10-14-garita-escritorio-design.md) | Veredicto en columnas y "Autorizar igual" | Vigente |
| [carga-manual](specs/2026-10-16-carga-manual-design.md) | Carga manual de movimientos | Reemplazada por planilla-post-corte |
| [garita-auditoria-vistas](specs/2026-10-16-garita-auditoria-vistas-design.md) | Vistas de garita, tablero y búsqueda | Vigente |
| [alerta-permanencia](specs/2026-10-19-alerta-permanencia-design.md) | Tiempo excedido, calculado en la garita | Vigente |
| [planilla-post-corte](specs/2026-10-19-planilla-post-corte-design.md) | Cargar a mano los movimientos de un corte | Vigente |
| [nota-invitacion](specs/2026-10-20-nota-invitacion-design.md) | Nota del vecino para la garita | Vigente |
| [horarios-proveedores](specs/2026-10-21-horarios-proveedores-design.md) | Rubros y franjas con temporada | Vigente |
| [plano-barrio](specs/2026-10-21-plano-barrio-design.md) | Plano con el lote resaltado | Vigente |
| [seguro-proveedor](specs/2026-10-21-seguro-proveedor-design.md) | Rubros que piden seguro, NO PASA · Sin seguro | En parte: el seguro ya no vive en la invitación ni lo carga el vecino (ver padrón) |
| [padron-seguros-contactos](specs/2026-10-24-padron-seguros-contactos-design.md) | Padrón por DNI y patente, seguro del auto, contactos | Vigente |

Después de la última spec hubo cambios chicos sin spec propia, que están en el
README y en `git log`: el DNI del contacto lo completa la garita (no el link),
el egreso muestra la patente con la que entró y un rubro se crea con "Pide seguro".
