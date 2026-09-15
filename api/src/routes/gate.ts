import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import {
  checkByToken, checkById, registerEntry, searchGuests, listGuards, agendaForDay,
  auditInvitations,
} from '../services/entries.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { toExcelCsv } from '../lib/csv.js'

export const gateRoutes = Router()
gateRoutes.use(requireAuth, requireRole('guard', 'admin'))

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

gateRoutes.get('/guards', async (req, res) => {
  res.json(await listGuards(req.person!.neighborhoodId))
})

gateRoutes.post('/entries', async (req, res) => {
  const body = z.object({
    invitationId: z.string().uuid(),
    guardId: z.string().uuid().nullable().optional(),
    guestName: z.string().min(1),
    guestDoc: z.string().optional(),
    plate: z.string().optional(),
    note: z.string().optional(),
  }).parse(req.body)

  res.status(201).json(await registerEntry(body.invitationId, body.guardId ?? null, body))
})

/** La agenda del día: quién está habilitado a entrar. */
gateRoutes.get('/agenda', async (req, res) => {
  const { date } = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(req.query)

  res.json(await agendaForDay(req.person!.neighborhoodId, date ?? todayInBuenosAires()))
})

const auditFilters = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitId: z.string().uuid().optional(),
})

/** Auditoría: una fila por invitación, entró o no entró. */
gateRoutes.get('/audit', async (req, res) => {
  res.json(await auditInvitations(req.person!.neighborhoodId, auditFilters.parse(req.query)))
})

const ESTADO_CSV: Record<string, string> = {
  entro: 'Entró',
  esperando: 'Esperando',
  vencida: 'No entró (vencida)',
  anulada: 'Anulada',
}

gateRoutes.get('/audit.csv', async (req, res) => {
  const rows = await auditInvitations(req.person!.neighborhoodId, auditFilters.parse(req.query))
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const csv = toExcelCsv(
    ['Invitado', 'Documento', 'Patente', 'Tipo', 'Evento', 'Unidad', 'Invitó',
      'Desde', 'Hasta', 'Estado', 'Ingresó', 'Ingresos', 'Guardia'],
    rows.map((r) => [
      r.guestName, r.guestDoc, r.plate, r.kind, r.eventName, r.unitLabel, r.inviterName,
      r.validFrom, r.validTo, ESTADO_CSV[r.status] ?? r.status,
      r.enteredAt ? fmt.format(new Date(r.enteredAt)) : '',
      r.enteredCount, r.guardName,
    ]),
  )

  res.type('text/csv; charset=utf-8').attachment('invitaciones.csv').send(csv)
})
