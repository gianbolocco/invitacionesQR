import express, { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { requireRole } from '../middleware/requireRole.js'
import { createUnit, listUnits, labelForLot, setPersonLot } from '../services/units.js'
import {
  createPerson, createGuard, listPeople, disablePerson, enablePerson, resendInvite, inviteLink, setGuardPassword,
} from '../services/people.js'
import { importPeopleRows, previewPeopleCsv } from '../services/people-import.js'
import { getNeighborhood, updateNeighborhood } from '../services/neighborhoods.js'
import { listTrades, createTrade, updateTrade } from '../services/trades.js'
import { guardarLogo, borrarLogo, guardarPlano, borrarPlano } from '../services/branding.js'
import { AppError } from '../lib/errors.js'
import { contrasena } from '../lib/contrasena.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const adminRoutes = Router()
adminRoutes.use(requireAuth, requireRole('admin'))
validarUuid(adminRoutes)

adminRoutes.get('/units', async (req, res) => {
  res.json(await listUnits(req.person!.neighborhoodId))
})

adminRoutes.post('/units', async (req, res) => {
  // Numérico, igual que cuando lo carga el vecino: una sola forma de escribirlo.
  const { lot } = z.object({ lot: z.coerce.number().int().min(1).max(99999) }).parse(req.body)
  res.status(201).json(await createUnit(req.person!.neighborhoodId, labelForLot(lot), req.person!.id))
})

adminRoutes.get('/people', async (req, res) => {
  res.json(await listPeople(req.person!.neighborhoodId))
})

adminRoutes.post('/guards', async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(160),
    username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/),
    password: contrasena,
  }).parse(req.body)

  const guard = await createGuard({
    ...body,
    neighborhoodId: req.person!.neighborhoodId,
    actorId: req.person!.id,
  })
  res.status(201).json({ id: guard.id, username: guard.username, status: guard.status })
})

const importRowSchema = z.object({
  line: z.number().int().min(2),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  lot: z.number().int().min(1).max(99999).nullable(),
})

adminRoutes.post('/people/import/preview', express.text({ type: 'text/csv', limit: '1mb' }), async (req, res) => {
  if (typeof req.body !== 'string') throw new AppError(400, 'csv_requerido')
  res.json(await previewPeopleCsv(req.body, req.person!.neighborhoodId))
})

adminRoutes.post('/people/import', async (req, res) => {
  const { rows } = z.object({ rows: z.array(importRowSchema).min(1).max(20) }).parse(req.body)
  res.json({ results: await importPeopleRows(rows, req.person!.neighborhoodId, req.person!.id) })
})

adminRoutes.post('/people', async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(['resident', 'guard', 'admin']),
    lot: z.coerce.number().int().min(1).max(99999).optional(),
    // Si el admin no lo asigna, el vecino lo declara al aceptar la invitación.
  }).parse(req.body)

  if (body.lot !== undefined && body.role !== 'resident') {
    throw new AppError(400, 'lote_solo_vecino')
  }

  const { person, mailEnviado } = await createPerson({
    ...body,
    unitIds: [],
    neighborhoodId: req.person!.neighborhoodId,
    actorId: req.person!.id,
  })
  res.status(201).json({ id: person.id, email: person.email ?? body.email, status: person.status, mailEnviado })
})

adminRoutes.post('/people/:id/disable', async (req, res) => {
  await disablePerson(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

// Un mail por persona por minuto: el doble clic, o el admin que insiste porque
// no lo ve llegar, no le llenan la bandeja al vecino. Cuenta al entrar y no al
// terminar, así dos pedidos simultáneos no pasan los dos.
const unReenvioPorMinuto = rateLimit({ max: 1, windowMs: 60_000, key: (req) => `reenvio:${req.params.id}` })

adminRoutes.post('/people/:id/resend', unReenvioPorMinuto, async (req, res) => {
  await resendInvite(String(req.params.id), req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/invite-link', async (req, res) => {
  res.json({ url: await inviteLink(req.params.id, req.person!.id, req.person!.neighborhoodId) })
})

adminRoutes.post('/people/:id/password', async (req, res) => {
  const { password } = z.object({ password: contrasena }).parse(req.body)
  await setGuardPassword(req.params.id, password, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.get('/neighborhood', async (req, res) => {
  res.json(await getNeighborhood(req.person!.neighborhoodId))
})

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/)
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
const franja = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  from: hhmm, to: hhmm,
  season: z.object({ from: mmdd, to: mmdd }).nullable(),
  trades: z.array(z.string().uuid()).min(1).nullable(),
}).refine((f) => f.from < f.to)
const franjas = z.array(franja).max(30)

adminRoutes.get('/trades', async (req, res) => {
  res.json(await listTrades(req.person!.neighborhoodId, { incluirArchivados: true }))
})

adminRoutes.post('/trades', async (req, res) => {
  const { name, requiresInsurance } = z.object({
    name: z.string().trim().min(1).max(40), requiresInsurance: z.boolean().optional(),
  }).parse(req.body)
  res.status(201).json(await createTrade(req.person!.neighborhoodId, req.person!.id, name, requiresInsurance))
})

adminRoutes.patch('/trades/:id', async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(40).optional(),
    archived: z.boolean().optional(),
    requiresInsurance: z.boolean().optional(),
  }).parse(req.body)
  res.json(await updateTrade(req.person!.neighborhoodId, req.person!.id, req.params.id, body))
})

adminRoutes.patch('/neighborhood', async (req, res) => {
  // Antes del resto: el front traduce 'franja_invalida', no el shape genérico de zod.
  const ventanas = franjas.optional().safeParse(req.body?.providerWindows)
  if (!ventanas.success) throw new AppError(400, 'franja_invalida')
  const body = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    address: z.string().max(200).optional(),
    // Un link, no una API de mapas. Se valida que sea http(s) y nada más.
    mapUrl: z.union([z.string().url().startsWith('http'), z.literal('')]).optional(),
    // La validación contra la paleta la hace el servicio, que es donde vive.
    brandColor: z.string().optional(),
    overstayHours: z.object({
      visita: z.number().int().min(1).max(72).nullable().optional(),
      proveedor: z.number().int().min(1).max(72).nullable().optional(),
    }).optional(),
    overstayMinutes: z.object({
      delivery: z.number().int().min(5).max(240).nullable().optional(),
    }).optional(),
    insuranceWarnDays: z.number().int().min(1).max(90).nullable().optional(),
    vehicleInsuranceRequired: z.boolean().optional(),
    vehicleInsuranceOverride: z.boolean().optional(),
  }).parse({ ...req.body, providerWindows: undefined })

  res.json(await updateNeighborhood(req.person!.neighborhoodId, req.person!.id,
    { ...body, providerWindows: ventanas.data }))
})

adminRoutes.post('/people/:id/enable', async (req, res) => {
  await enablePerson(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

/** Corregir el lote de un vecino que se equivocó al entrar. Solo el admin. */
adminRoutes.post('/people/:id/lot', async (req, res) => {
  const { lot } = z.object({ lot: z.coerce.number().int().min(1).max(99999) }).parse(req.body)
  res.json(await setPersonLot(req.person!.neighborhoodId, req.params.id, lot, req.person!.id))
})

/*
 * El archivo viaja como body crudo, no como multipart: `express.raw` ya viene
 * en Express 5 y aplica el límite de tamaño sin que entre nada al proceso de
 * más. Una dependencia menos que mantener.
 *
 * `type` acepta los dos mimes y nada más, así que un Content-Type distinto ni
 * siquiera se bufferea. Igual no se le cree: el formato real lo decide
 * tipoDeImagen() mirando los bytes.
 */
adminRoutes.put('/branding/logo',
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '500kb' }),
  async (req, res) => {
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AppError(400, 'formato_no_soportado')
    }
    res.json(await guardarLogo(bytes, req.person!.id))
  })

adminRoutes.delete('/branding/logo', async (req, res) => {
  await borrarLogo(req.person!.id)
  res.json({ ok: true })
})

/* Mismo criterio que el logo: el formato real lo decide tipoDePlano() por los bytes. */
adminRoutes.put('/branding/plano',
  express.raw({ type: ['image/svg+xml', 'image/png', 'image/jpeg'], limit: '1mb' }),
  async (req, res) => {
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new AppError(400, 'formato_no_soportado')
    }
    res.json(await guardarPlano(bytes, req.person!.id))
  })

adminRoutes.delete('/branding/plano', async (req, res) => {
  await borrarPlano(req.person!.id)
  res.json({ ok: true })
})
