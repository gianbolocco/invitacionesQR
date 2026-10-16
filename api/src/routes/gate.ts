import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  checkByToken, checkById, registerEntry, registerExit, undoMovement, searchGuests, agendaForDay,
  insideNow, auditInvitations, auditAll, registerManual, MAX_CARGA_MANUAL,
} from '../services/entries.js'
import { searchUnits, listUnits } from '../services/units.js'
import { createExpressInvitation, revokeByGuard } from '../services/invitations.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { slug } from '../lib/slug.js'
import { buildWorkbook, diaExcel, fechaExcel, XLSX_MIME } from '../lib/excel.js'
import { COLOR_DEFAULT } from '../lib/marca.js'
import { entriesLog } from '../services/reports.js'
import { getNeighborhood } from '../services/neighborhoods.js'
import { escucharAvisos } from '../lib/avisos.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))
validarUuid(gateRoutes)

gateRoutes.get('/check/:token', async (req, res) => {
  res.json(await checkByToken(req.params.token))
})

gateRoutes.get('/invitation/:id', async (req, res) => {
  res.json(await checkById(req.params.id))
})

gateRoutes.get('/search', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchGuests(req.person!.neighborhoodId, q))
})

/** Unidades del barrio por lote o apellido, para el alta exprés. */
gateRoutes.get('/units', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchUnits(req.person!.neighborhoodId, q))
})

/** El alta exprés: nombre + lote, el resto fijo. Ver createExpressInvitation. */
gateRoutes.post('/invitations', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid(),
    guestName: z.string().min(1),
    guestDoc: z.string().optional(),
    plate: z.string().optional(),
  }).parse(req.body)

  res.status(201).json(await createExpressInvitation({
    ...body, createdBy: req.person!.id, neighborhoodId: req.person!.neighborhoodId,
  }))
})

/** La portería anula una invitación. El motivo es obligatorio: ver revokeByGuard. */
gateRoutes.post('/invitations/:id/revoke', async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(200) }).parse(req.body)
  await revokeByGuard(req.params.id, req.person!.id, req.person!.neighborhoodId, reason)
  res.json({ ok: true })
})

gateRoutes.post('/entries', async (req, res) => {
  const body = z.object({
    invitationId: z.string().uuid(),
    guestName: z.string().min(1),
    guestDoc: z.string().trim().min(1),
    plate: z.string().optional(),
    note: z.string().optional(),
  }).parse(req.body)

  // El guardia sale de la sesión, no del body: un dato de auditoría no puede
  // depender de lo que mande el cliente ni de que alguien elija bien.
  res.status(201).json(await registerEntry(body.invitationId, req.person!.id, body))
})

/** La salida. El guardia sale de la sesión, igual que en el ingreso. */
gateRoutes.post('/exits', async (req, res) => {
  const body = z.object({ invitationId: z.string().uuid() }).parse(req.body)
  res.status(201).json(await registerExit(body.invitationId, req.person!.id))
})

/**
 * Carga a mano de movimientos que ya pasaron (un corte de luz). Las horas
 * llegan con offset: la pantalla manda la de Buenos Aires. Ver registerManual.
 */
gateRoutes.post('/manual', async (req, res) => {
  const { items } = z.object({
    items: z.array(z.object({
      invitationId: z.string().uuid(),
      enteredAt: z.string().datetime({ offset: true }),
      exitedAt: z.string().datetime({ offset: true }).nullish(),
      note: z.string().trim().max(200).optional(),
    })).min(1).max(MAX_CARGA_MANUAL),
  }).parse(req.body)

  const filas = await registerManual(req.person!.neighborhoodId, req.person!.id, items.map((i) => ({
    invitationId: i.invitationId,
    enteredAt: new Date(i.enteredAt),
    exitedAt: i.exitedAt ? new Date(i.exitedAt) : null,
    note: i.note,
  })))
  res.status(201).json({ cargados: filas.length })
})

/** Deshacer el último movimiento, para el escaneo doble. */
gateRoutes.post('/entries/:id/undo', async (req, res) => {
  res.json(await undoMovement(req.params.id, req.person!.id, req.person!.neighborhoodId))
})

/** La agenda del día: quién está habilitado a entrar. */
gateRoutes.get('/agenda', async (req, res) => {
  const { date } = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(req.query)

  res.json(await agendaForDay(req.person!.neighborhoodId, date ?? todayInBuenosAires()))
})

/** Avisos en vivo para la garita: "algo cambió, volvé a pedir". */
gateRoutes.get('/eventos', escucharAvisos)

/** Quiénes están adentro ahora, de cualquier día. */
gateRoutes.get('/adentro', async (req, res) => {
  res.json(await insideNow(req.person!.neighborhoodId))
})

const auditFilters = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitId: z.string().uuid().optional(),
  status: z.enum(['adentro', 'concluida', 'esperando', 'vencida', 'anulada']).optional(),
  kind: z.enum(['visita', 'frecuente', 'proveedor']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
})

/** Auditoría: una fila por invitación, entró o no entró. Paginada. */
gateRoutes.get('/audit', async (req, res) => {
  res.json(await auditInvitations(req.person!.neighborhoodId, auditFilters.parse(req.query)))
})

const ESTADO_EXCEL: Record<string, string> = {
  adentro: 'Adentro',
  concluida: 'Concluida',
  esperando: 'Pendiente',
  vencida: 'Vencida',
  anulada: 'Anulada',
}

const KIND_EXCEL: Record<string, string> = {
  visita: 'Visita',
  frecuente: 'Frecuente',
  proveedor: 'Proveedor',
}

const dd = (iso: string) => iso.split('-').reverse().join('/')

/**
 * El Excel trae una portada y DOS hojas: las invitaciones y los ingresos del
 * mismo rango. En pantalla los ingresos se ven desplegando una fila; en un
 * archivo que alguien va a filtrar y sumar, conviene tenerlos planos y aparte.
 *
 * Exporta TODO lo que matchea el filtro, no la página que se está viendo: nadie
 * espera que un export respete el scroll.
 */
gateRoutes.get('/audit.xlsx', async (req, res) => {
  const f = auditFilters.parse(req.query)
  const nid = req.person!.neighborhoodId

  const [auditoria, ingresos, barrio, unidades] = await Promise.all([
    auditAll(nid, f),
    entriesLog(nid, { from: f.from, to: f.to, unitId: f.unitId }),
    getNeighborhood(nid),
    listUnits(nid),
  ])

  const porEstado = (s: string) => auditoria.filter((r) => r.status === s).length
  const ahora = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())

  const buffer = await buildWorkbook({
    autor: barrio.name,
    color: barrio.brandColor ?? COLOR_DEFAULT,
    resumen: {
      titulo: 'Auditoría de accesos',
      subtitulo: barrio.name,
      bloques: [
        {
          titulo: 'Filtros aplicados',
          filas: [
            ['Período', f.from || f.to ? `${f.from ? dd(f.from) : 'el inicio'} al ${f.to ? dd(f.to) : 'hoy'}` : 'Todo'],
            ['Estado', f.status ? ESTADO_EXCEL[f.status] : 'Todos'],
            ['Unidad', f.unitId ? (unidades.find((u) => u.id === f.unitId)?.label ?? '—') : 'Todas'],
          ],
        },
        {
          titulo: 'Generado',
          filas: [['Fecha', ahora], ['Por', req.person!.name]],
        },
        {
          titulo: 'Totales',
          filas: [
            ['Invitaciones', auditoria.length],
            ['Adentro', porEstado('adentro')],
            ['Concluidas', porEstado('concluida')],
            ['Pendientes', porEstado('esperando')],
            ['Vencidas', porEstado('vencida')],
            ['Anuladas', porEstado('anulada')],
            ['Ingresos registrados', ingresos.length],
          ],
        },
      ],
      notas: [
        'Invitaciones: las vigentes algún día del período. Ingresos: los registrados en el período. El filtro de estado aplica solo a Invitaciones.',
        'Ingreso y salida de Invitaciones son los del último ingreso; todos los movimientos están en la hoja Ingresos. Horas de Buenos Aires.',
      ],
    },
    hojas: [
      {
        nombre: 'Invitaciones',
        columnas: [
          { header: 'Invitado', key: 'invitado', width: 26 },
          { header: 'DNI', key: 'dni' },
          { header: 'Patente', key: 'patente' },
          { header: 'Tipo', key: 'tipo' },
          { header: 'Unidad', key: 'unidad' },
          { header: 'Invitó', key: 'invito', width: 24 },
          { header: 'Desde', key: 'desde', formato: 'fecha' },
          { header: 'Hasta', key: 'hasta', formato: 'fecha' },
          { header: 'Estado', key: 'estado' },
          { header: 'Ingreso', key: 'ingreso', width: 18, formato: 'fechaHora' },
          { header: 'Guardia ingreso', key: 'guardiaIngreso', width: 20 },
          { header: 'Salida', key: 'salida', width: 18, formato: 'fechaHora' },
          { header: 'Guardia salida', key: 'guardiaSalida', width: 20 },
        ],
        filas: auditoria.map((r) => ({
          invitado: r.guestName,
          dni: r.guestDoc ?? '',
          patente: r.plate ?? '',
          tipo: KIND_EXCEL[r.kind] ?? r.kind,
          unidad: r.unitLabel,
          invito: r.inviterName,
          desde: diaExcel(r.validFrom),
          hasta: diaExcel(r.validTo),
          estado: ESTADO_EXCEL[r.status] ?? r.status,
          ingreso: r.enteredAt ? fechaExcel(r.enteredAt) : '',
          guardiaIngreso: r.guardName ?? '',
          salida: r.exitedAt ? fechaExcel(r.exitedAt) : '',
          guardiaSalida: r.exitGuardName ?? '',
        })),
      },
      {
        nombre: 'Ingresos',
        columnas: [
          { header: 'Ingreso', key: 'ingreso', width: 18, formato: 'fechaHora' },
          { header: 'Guardia ingreso', key: 'guardiaIngreso', width: 20 },
          { header: 'Salida', key: 'salida', width: 18, formato: 'fechaHora' },
          { header: 'Guardia salida', key: 'guardiaSalida', width: 20 },
          { header: 'Invitado', key: 'invitado', width: 26 },
          { header: 'DNI', key: 'dni' },
          { header: 'Patente', key: 'patente' },
          { header: 'Unidad', key: 'unidad' },
        ],
        filas: ingresos.map((e) => ({
          ingreso: fechaExcel(e.enteredAt),
          guardiaIngreso: e.guardName ?? '',
          salida: e.exitedAt ? fechaExcel(e.exitedAt) : '',
          guardiaSalida: e.exitGuardName ?? '',
          invitado: e.guestName,
          dni: e.guestDoc ?? '',
          patente: e.plate ?? '',
          unidad: e.unitLabel,
        })),
      },
    ],
  })

  res.type(XLSX_MIME).attachment(`${slug(barrio.name) || 'barrio'}-auditoria.xlsx`).send(buffer)
})

/**
 * Los ingresos de UNA invitación: es lo que se despliega al tocar una fila de
 * la auditoría. La auditoría dice "×3"; acá están los tres, con hora y guardia.
 */
gateRoutes.get('/audit/:id/entries', async (req, res) => {
  res.json(await entriesLog(req.person!.neighborhoodId, { invitationId: req.params.id }))
})
