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
import { APPS } from '../lib/delivery.js'
import { slug } from '../lib/slug.js'
import { estadoSeguro, etiquetaClave } from '../lib/seguro.js'
import { buildWorkbook, diaExcel, fechaExcel, XLSX_MIME } from '../lib/excel.js'
import { COLOR_DEFAULT } from '../lib/marca.js'
import { entriesLog } from '../services/reports.js'
import { getNeighborhood } from '../services/neighborhoods.js'
import { escucharAvisos } from '../lib/avisos.js'
import { normalizarPatente } from '../lib/padron.js'
import { guardarProveedor, guardarVehiculo } from '../services/padron.js'
import { db } from '../db/index.js'
import { zSeguro } from './invitations.js'
import { AppError } from '../lib/errors.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))
validarUuid(gateRoutes)

gateRoutes.get('/check/:token', async (req, res) => {
  res.json(await checkByToken(req.params.token))
})

gateRoutes.get('/invitation/:id', async (req, res) => {
  res.json(await checkById(req.params.id))
})

/**
 * El veredicto con lo que el guardia tiene tipeado (documento y patente). POST
 * y no GET por lo mismo que /search: el DNI en la query queda en los logs de
 * cada proxy. Es una lectura: no avisa a las otras garitas.
 */
gateRoutes.post('/invitation/:id/verdict', async (req, res) => {
  res.locals.soloLectura = true
  const datos = z.object({ doc: z.string().max(40).optional(), plate: z.string().max(20).optional() }).parse(req.body)
  res.json(await checkById(req.params.id, datos))
})

// POST y no GET: el DNI en la query queda en los logs de acceso de cada proxy.
gateRoutes.post('/search', async (req, res) => {
  res.locals.soloLectura = true
  const { q } = z.object({ q: z.string().min(1) }).parse(req.body)
  res.json(await searchGuests(req.person!.neighborhoodId, q))
})

/** Unidades del barrio por lote o apellido, para el alta exprés. */
gateRoutes.get('/units', async (req, res) => {
  const { q } = z.object({ q: z.string().min(1) }).parse(req.query)
  res.json(await searchUnits(req.person!.neighborhoodId, q))
})

/** El alta exprés: nombre (o app, si es delivery), documento y lote; el resto fijo. Ver createExpressInvitation. */
gateRoutes.post('/invitations', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid(),
    guestName: z.string().optional(),
    guestDoc: z.string().trim().min(1),
    plate: z.string().optional(),
    note: z.string().trim().max(140).optional(),
    kind: z.enum(['visita', 'proveedor', 'delivery']).optional(),
    app: z.enum(APPS).optional(),
    otro: z.string().trim().max(40).optional(),
    tradeId: z.string().uuid().nullable().optional(),
  }).refine((v) => v.kind === 'delivery' ? !!v.app : !!v.guestName?.trim(), { path: ['guestName'] }).parse(req.body)

  res.status(201).json(await createExpressInvitation({
    ...body, createdBy: req.person!.id, neighborhoodId: req.person!.neighborhoodId,
  }))
})

/** La portería anula una invitación. El motivo es opcional: ver revokeByGuard. */
gateRoutes.post('/invitations/:id/revoke', async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(200).optional() }).parse(req.body)
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
    // Sin null: la barrera carga o renueva un seguro, no lo borra.
    insurance: zSeguro.unwrap().optional(),
    vehicleInsurance: zSeguro.unwrap().optional(),
  }).refine((b) => !b.vehicleInsurance || normalizarPatente(b.plate ?? '') !== '', {
    message: 'El seguro del auto va con su patente', path: ['plate'],
  }).parse(req.body)
  // Como en los PUT de corrección: el admin registra ingresos pero no carga seguros.
  if ((body.insurance || body.vehicleInsurance) && req.person!.role !== 'guard') throw new AppError(403, 'forbidden')

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
 * Corregir un seguro sin registrar el ingreso: el guardia corrige y aprieta
 * Volver, y el dato bueno no se pierde. Lo usan también el veredicto y la
 * pantalla Seguros. El DNI y la patente van en el body, nunca en la URL.
 * El admin mira los seguros, no los carga: el que ve el certificado es el guardia.
 */
gateRoutes.put('/providers/insurance', requireRole('guard'), async (req, res) => {
  const body = z.object({
    doc: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(120),
    insurance: zSeguro.unwrap(),
  }).parse(req.body)
  await db.transaction((tx) => guardarProveedor(tx, {
    neighborhoodId: req.person!.neighborhoodId, doc: body.doc, name: body.name,
    insurance: body.insurance, source: 'garita', actorId: req.person!.id,
  }))
  res.json({ ok: true })
})

gateRoutes.put('/vehicles/insurance', requireRole('guard'), async (req, res) => {
  const body = z.object({
    plate: z.string().trim().max(20).refine((p) => normalizarPatente(p) !== ''),
    insurance: zSeguro.unwrap(),
  }).parse(req.body)
  await db.transaction((tx) => guardarVehiculo(tx, {
    neighborhoodId: req.person!.neighborhoodId, plate: body.plate, insurance: body.insurance, actorId: req.person!.id,
  }))
  res.json({ ok: true })
})

/**
 * Carga a mano de movimientos que ya pasaron (un corte de luz). Las horas
 * llegan con offset: la pantalla manda la de Buenos Aires. Ver registerManual.
 */
gateRoutes.post('/manual', async (req, res) => {
  const { items } = z.object({
    items: z.array(z.object({
      invitationId: z.string().uuid().optional(),
      guest: z.object({ name: z.string().trim().min(1).max(120), unitId: z.string().uuid() }).optional(),
      guestDoc: z.string().trim().min(1).max(20),
      plate: z.string().trim().max(10).optional(),
      enteredAt: z.string().datetime({ offset: true }),
      exitedAt: z.string().datetime({ offset: true }).nullish(),
      note: z.string().trim().max(200).optional(),
    }).refine((i) => Boolean(i.invitationId) !== Boolean(i.guest))).min(1).max(MAX_CARGA_MANUAL),
  }).parse(req.body)

  const filas = await registerManual(req.person!.neighborhoodId, req.person!.id, items.map((i) => ({
    invitationId: i.invitationId,
    guest: i.guest,
    guestDoc: i.guestDoc,
    plate: i.plate,
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
  kind: z.enum(['visita', 'frecuente', 'proveedor', 'delivery']).optional(),
  q: z.string().trim().max(80).optional(),
  // Llega como string desde la query: z.coerce.boolean() daría true con 'false'.
  sinSeguro: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
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

const guardia = (nombre: string | null, manual: boolean) =>
  nombre && manual ? `Carga manual · ${nombre}` : nombre ?? ''

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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

  const [auditoria, todosLosIngresos, barrio, unidades] = await Promise.all([
    auditAll(nid, f),
    entriesLog(nid, { from: f.from, to: f.to, unitId: f.unitId }),
    getNeighborhood(nid),
    listUnits(nid),
  ])
  // Con "solo autorizados sin seguro", la hoja de ingresos trae solo esos: la portada lo dice.
  const ingresos = f.sinSeguro ? todosLosIngresos.filter((e) => e.autorizadoSinSeguro) : todosLosIngresos

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
            ['Autorizados sin seguro', f.sinSeguro ? 'Solo esos' : 'Todos'],
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
          { header: 'Rubro', key: 'rubro' },
          { header: 'Frecuente como', key: 'frecuenteComo', width: 16 },
          { header: 'Días', key: 'dias', width: 22 },
          { header: 'Compañía', key: 'compania', width: 22 },
          { header: 'Póliza', key: 'poliza', width: 16 },
          { header: 'Vence seguro', key: 'venceSeguro', formato: 'fecha' },
          { header: 'Estado seguro', key: 'estadoSeguro', width: 16 },
          { header: 'Seguro auto', key: 'seguroAuto', width: 24 },
          { header: 'Vence seguro auto', key: 'venceAuto', formato: 'fecha' },
          { header: 'Unidad', key: 'unidad' },
          { header: 'Invitó', key: 'invito', width: 24 },
          { header: 'Desde', key: 'desde', formato: 'fecha' },
          { header: 'Hasta', key: 'hasta', formato: 'fecha' },
          { header: 'Estado', key: 'estado' },
          { header: 'Ingreso', key: 'ingreso', width: 18, formato: 'fechaHora' },
          { header: 'Guardia ingreso', key: 'guardiaIngreso', width: 20 },
          { header: 'Salida', key: 'salida', width: 18, formato: 'fechaHora' },
          { header: 'Guardia salida', key: 'guardiaSalida', width: 20 },
          { header: 'Carga manual', key: 'manual' },
          { header: 'Nota del vecino', key: 'notaVecino', width: 30 },
          { header: 'Autorizó sin seguro', key: 'sinSeguro', width: 18 },
          { header: 'Autorizó portería', key: 'porteria', width: 18 },
        ],
        filas: auditoria.map((r) => ({
          invitado: r.guestName,
          dni: r.guestDoc ?? '',
          patente: r.plate ?? '',
          tipo: KIND_EXCEL[r.kind] ?? r.kind,
          rubro: r.tradeName ?? '',
          frecuenteComo: r.kind === 'frecuente' ? (r.frequentAs === 'proveedor' ? 'A trabajar' : 'Visita') : '',
          dias: r.weekdays?.map((d) => DIAS_CORTOS[d]).join(', ') ?? '',
          compania: r.insuranceCompany ?? '',
          poliza: r.insurancePolicy ?? '',
          venceSeguro: r.insuranceExpiresOn ? diaExcel(r.insuranceExpiresOn) : '',
          estadoSeguro: estadoSeguro(
            { requiresInsurance: r.requiresInsurance, company: r.insuranceCompany, policy: r.insurancePolicy, expiresOn: r.insuranceExpiresOn },
            barrio.insuranceWarnDays,
          ),
          seguroAuto: r.vehicleCompany ? `${r.vehicleCompany} · ${r.vehiclePolicy}` : '',
          venceAuto: r.vehicleExpiresOn ? diaExcel(r.vehicleExpiresOn) : '',
          unidad: r.unitLabel,
          invito: r.inviterName,
          desde: diaExcel(r.validFrom),
          hasta: diaExcel(r.validTo),
          estado: ESTADO_EXCEL[r.status] ?? r.status,
          ingreso: r.enteredAt ? fechaExcel(r.enteredAt) : '',
          guardiaIngreso: guardia(r.guardName, r.manual),
          salida: r.exitedAt ? fechaExcel(r.exitedAt) : '',
          guardiaSalida: guardia(r.exitGuardName, r.manual),
          manual: r.manual ? 'Sí' : 'No',
          notaVecino: r.note ?? '',
          sinSeguro: r.autorizadoSinSeguro ? 'Sí' : '',
          porteria: r.porteria ? 'Sí' : '',
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
          { header: 'Seguro proveedor (al ingresar)', key: 'fotoProv', width: 18 },
          { header: 'Seguro auto (al ingresar)', key: 'fotoAuto', width: 18 },
          { header: 'Autorizó sin seguro', key: 'sinSeguro', width: 20 },
          { header: 'Rubro', key: 'rubro' },
          { header: 'Unidad', key: 'unidad' },
          { header: 'Origen', key: 'origen' },
          { header: 'Cargado el', key: 'cargado', width: 18, formato: 'fechaHora' },
          { header: 'Nota del vecino', key: 'notaVecino', width: 30 },
          { header: 'Nota', key: 'nota', width: 30 },
        ],
        filas: ingresos.map((e) => ({
          ingreso: fechaExcel(e.enteredAt),
          guardiaIngreso: guardia(e.guardName, e.manual),
          salida: e.exitedAt ? fechaExcel(e.exitedAt) : '',
          guardiaSalida: guardia(e.exitGuardName, e.manual),
          invitado: e.guestName,
          dni: e.guestDoc ?? '',
          patente: e.plate ?? '',
          fotoProv: etiquetaClave(e.providerInsurance),
          fotoAuto: etiquetaClave(e.vehicleInsurance),
          // Quién: el guardia del ingreso.
          sinSeguro: e.autorizadoSinSeguro ? (e.guardName ?? 'Sí') : '',
          rubro: e.tradeName ?? '',
          unidad: e.unitLabel,
          origen: e.manual ? 'Carga manual' : 'Escaneo',
          cargado: e.loadedAt ? fechaExcel(e.loadedAt) : '',
          notaVecino: e.invitationNote ?? '',
          nota: e.note ?? '',
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
