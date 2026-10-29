import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { validarUuid } from '../middleware/uuidParam.js'
import { unitsOfPerson } from '../services/units.js'
import { createContact, deleteContact, editContact, listContacts } from '../services/contacts.js'

export const contactRoutes = Router()
contactRoutes.use(requireAuth)
validarUuid(contactRoutes)

const ids = async (personId: string) => (await unitsOfPerson(personId)).map((u) => u.id)
const nombre = z.string().trim().min(1).max(80)
const doc = z.string().trim().max(40).nullable().optional()

contactRoutes.get('/', async (req, res) => {
  res.json(await listContacts(await ids(req.person!.id)))
})

contactRoutes.post('/', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid().optional(),
    kind: z.enum(['visita', 'proveedor']),
    name: nombre,
    doc,
    tradeId: z.string().uuid().nullable().optional(),
  }).refine((b) => b.kind === 'proveedor' || !b.tradeId, { path: ['tradeId'] }).parse(req.body)
  res.status(201).json(await createContact(req.person!.id, await ids(req.person!.id), body))
})

contactRoutes.patch('/:id', async (req, res) => {
  const body = z.object({ name: nombre.optional(), doc, tradeId: z.string().uuid().nullable().optional() }).parse(req.body)
  res.json(await editContact(req.params.id, await ids(req.person!.id), body))
})

contactRoutes.delete('/:id', async (req, res) => {
  await deleteContact(req.params.id, await ids(req.person!.id))
  res.json({ ok: true })
})
