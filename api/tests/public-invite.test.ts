import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const hoy = todayInBuenosAires()

async function escenario(over: Partial<{
  kind: 'visita'; capacity: number; guestDoc: string | null; plate: string | null
}> = {}) {
  const [n] = await db.insert(neighborhoods).values({
    name: 'Álamo Alto',
    address: 'Ruta 8 km 62, Pilar',
    mapUrl: 'https://maps.google.com/?q=alamo+alto',
  }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín Bolocco',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })

  const [inv] = await db.insert(invitations).values({
    unitId: u.id, createdBy: vecino.id,
    kind: over.kind ?? 'visita',
    guestName: 'Juan Pérez',
    guestDoc: over.guestDoc ?? null,
    plate: over.plate ?? null,
    validFrom: hoy, validTo: hoy,
    capacity: over.capacity ?? 1,
    token: randomToken(16),
  }).returning()

  return { inv, vecino, unit: u, neighborhood: n }
}

describe('página pública del invitado', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('muestra quién invita, la unidad y cómo llegar, sin sesión', async () => {
    const { inv } = await escenario()
    const res = await request(app).get(`/invitations/public/${inv.token}`)

    expect(res.status).toBe(200)
    expect(res.body.inviterName).toBe('Martín Bolocco')
    expect(res.body.unitLabel).toBe('Lote 142')
    expect(res.body.neighborhood.address).toBe('Ruta 8 km 62, Pilar')
    expect(res.body.neighborhood.mapUrl).toContain('maps.google.com')
  })

  it('nunca expone el mail del vecino ni el documento cargado', async () => {
    const { inv } = await escenario({ guestDoc: '30123456' })
    const res = await request(app).get(`/invitations/public/${inv.token}`)

    expect(JSON.stringify(res.body)).not.toContain('martin@example.com')
    expect(JSON.stringify(res.body)).not.toContain('30123456')
    // Solo dice que YA hay datos, no cuáles.
    expect(res.body.hasDoc).toBe(true)
  })

  it('el invitado carga su documento y su patente', async () => {
    const { inv } = await escenario()
    await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ guestDoc: '30.123.456', plate: 'ab123cd' }).expect(200)

    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(row.guestDoc).toBe('30.123.456')
    expect(row.plate).toBe('AB123CD')
  })

  it('acepta pasaporte: el documento es texto libre', async () => {
    const { inv } = await escenario()
    await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ guestDoc: 'AAB123456 (Uruguay)' }).expect(200)

    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(row.guestDoc).toBe('AAB123456 (Uruguay)')
  })

  it('NO pisa lo que ya cargó el vecino', async () => {
    const { inv } = await escenario({ guestDoc: 'el-del-vecino' })
    await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ guestDoc: 'el-de-un-reenvio' }).expect(200)

    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(row.guestDoc).toBe('el-del-vecino')
  })

  it('IGNORA cualquier campo que no sea documento o patente', async () => {
    const { inv } = await escenario()
    await request(app).patch(`/invitations/public/${inv.token}`).send({
      guestDoc: '30123456',
      guestName: 'Me cambio el nombre',
      capacity: 999,
      validTo: '2099-12-31',
      unitId: '00000000-0000-0000-0000-000000000000',
    }).expect(200)

    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id))
    expect(row.guestName).toBe('Juan Pérez')
    expect(row.capacity).toBe(1)
    expect(row.validTo).toBe(hoy)
    expect(row.unitId).toBe(inv.unitId)
  })

  it('se congela después del primer ingreso', async () => {
    const { inv } = await escenario()
    await registerEntry(inv.id, null, { guestName: 'Juan Pérez' })

    const res = await request(app).patch(`/invitations/public/${inv.token}`).send({ guestDoc: '111' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('already_entered')
  })

  it('una invitación anulada no acepta datos', async () => {
    const { inv } = await escenario()
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id))

    const res = await request(app).patch(`/invitations/public/${inv.token}`).send({ guestDoc: '111' })
    expect(res.status).toBe(409)
  })

  it('un token inventado da 404', async () => {
    const res = await request(app).patch('/invitations/public/noexiste').send({ guestDoc: '111' })
    expect(res.status).toBe(404)
  })
})

describe('al invitado se le pide solo lo que falta', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('si el vecino ya cargó los dos datos, no queda nada pendiente', async () => {
    const { inv } = await escenario({ guestDoc: '35111222', plate: 'AB123CD' })
    const suya = await request(app).get(`/invitations/public/${inv.token}`)
    expect(suya.body.hasDoc).toBe(true)
    expect(suya.body.hasPlate).toBe(true)
  })

  it('con documento y sin patente, solo queda pendiente la patente', async () => {
    const { inv } = await escenario({ guestDoc: '35111222' })
    const suya = await request(app).get(`/invitations/public/${inv.token}`)
    expect(suya.body.hasDoc).toBe(true)
    expect(suya.body.hasPlate).toBe(false)
  })

  it('lo que carga el invitado queda listo para la garita', async () => {
    const { inv } = await escenario()
    await request(app).patch(`/invitations/public/${inv.token}`)
      .send({ guestDoc: '35111222', plate: 'ab123cd' }).expect(200)

    const [fila] = await db.select().from(invitations)
      .where(eq(invitations.token, inv.token))
    expect(fila.guestDoc).toBe('35111222')
    expect(fila.plate).toBe('AB123CD')
  })
})
