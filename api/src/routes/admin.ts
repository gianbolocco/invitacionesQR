import express, { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { requireRole } from '../middleware/requireRole.js'
import { createUnit, listUnits, labelForLot, setPersonLot } from '../services/units.js'
import {
  createPerson, listPeople, disablePerson, enablePerson, resendInvite, setGuardPassword,
} from '../services/people.js'
import { getNeighborhood, updateNeighborhood } from '../services/neighborhoods.js'
import { guardarLogo, borrarLogo } from '../services/branding.js'
import { AppError } from '../lib/errors.js'

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

adminRoutes.post('/people', async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(['resident', 'guard', 'admin']),
    // Sin unitIds: el lote lo declara el vecino al entrar.
  }).parse(req.body)

  const { person, mailEnviado } = await createPerson({
    ...body,
    unitIds: [],
    neighborhoodId: req.person!.neighborhoodId,
    actorId: req.person!.id,
  })
  res.status(201).json({ id: person.id, email: person.email, status: person.status, mailEnviado })
})

adminRoutes.post('/people/:id/disable', async (req, res) => {
  await disablePerson(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/resend', async (req, res) => {
  await resendInvite(req.params.id, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.post('/people/:id/password', async (req, res) => {
  const { password } = z.object({ password: z.string().min(10) }).parse(req.body)
  await setGuardPassword(req.params.id, password, req.person!.id, req.person!.neighborhoodId)
  res.json({ ok: true })
})

adminRoutes.get('/neighborhood', async (req, res) => {
  res.json(await getNeighborhood(req.person!.neighborhoodId))
})

adminRoutes.patch('/neighborhood', async (req, res) => {
  const body = z.object({
    name: z.string().min(1).optional(),
    address: z.string().max(200).optional(),
    // Un link, no una API de mapas. Se valida que sea http(s) y nada más.
    mapUrl: z.union([z.string().url().startsWith('http'), z.literal('')]).optional(),
    // La validación contra la paleta la hace el servicio, que es donde vive.
    brandColor: z.string().optional(),
  }).parse(req.body)

  res.json(await updateNeighborhood(req.person!.neighborhoodId, req.person!.id, body))
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
