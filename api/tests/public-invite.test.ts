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
  kind: 'visita' | 'evento'; capacity: number; guestDoc: string | null; plate: string | null
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
    guestName: over.kind === 'evento' ? 'Cumple de Sofi' : 'Juan Pérez',
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

describe('anotarse a un evento', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el link de un evento se identifica como puerta de anotación', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 30 })
    const res = await request(app).get(`/invitations/public/${inv.token}`)

    expect(res.body.isEventDoor).toBe(true)
    expect(res.body.spotsLeft).toBe(30)
  })

  it('el invitado se anota y se lleva su propio token', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 30 })
    const res = await request(app).post(`/invitations/public/${inv.token}/join`)
      .send({ guestName: 'Martina Gómez', guestDoc: '35111222' })

    expect(res.status).toBe(201)
    expect(res.body.token).not.toBe(inv.token)
    expect(res.body.alreadyJoined).toBe(false)

    // Y ese token propio muestra SU nombre, no el del evento.
    const suya = await request(app).get(`/invitations/public/${res.body.token}`)
    expect(suya.body.guestName).toBe('Martina Gómez')
    expect(suya.body.isEventDoor).toBe(false)
  })

  it('el mismo documento no quema dos lugares', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 30 })
    const a = await request(app).post(`/invitations/public/${inv.token}/join`)
      .send({ guestName: 'Martina', guestDoc: '35111222' })
    const b = await request(app).post(`/invitations/public/${inv.token}/join`)
      .send({ guestName: 'Martina otra vez', guestDoc: '35111222' })

    expect(b.body.token).toBe(a.body.token)
    expect(b.body.alreadyJoined).toBe(true)

    const res = await request(app).get(`/invitations/public/${inv.token}`)
    expect(res.body.spotsLeft).toBe(29)
  })

  it('no se puede anotar más gente que el cupo', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 2 })
    await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Uno' })
    await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Dos' })

    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Tres' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_capacity')
  })

  it('los ingresos directos al evento también ocupan lugares', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 2 })
    // La tía que no se anotó y la registra el guardia contra el QR del evento.
    await registerEntry(inv.id, null, { guestName: 'Tía Ana' })

    await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Uno' }).expect(201)
    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Dos' })
    expect(res.status).toBe(409)
  })

  it('no se puede anotar a una visita: no es un evento', async () => {
    const { inv } = await escenario()
    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Colado' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('not_an_event')
  })

  it('no se puede anotar a un evento anulado', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 30 })
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id))

    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Uno' })
    expect(res.status).toBe(409)
  })

  it('no se puede anotar a un evento que ya pasó', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 30 })
    await db.update(invitations).set({ validFrom: '2020-01-01', validTo: '2020-01-02' })
      .where(eq(invitations.id, inv.id))

    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'Uno' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('expired')
  })

  it('el rate limit corta el abuso sobre un mismo link', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 100 })
    for (let i = 0; i < 10; i++) {
      await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: `N${i}` })
    }
    const res = await request(app).post(`/invitations/public/${inv.token}/join`).send({ guestName: 'N11' })
    expect(res.status).toBe(429)
  })
})

describe('anotarse pide los datos una sola vez', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el que se anota con documento y patente no tiene que volver a cargarlos', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 10 })

    const anotado = await request(app).post(`/invitations/public/${inv.token}/join`)
      .send({ guestName: 'Martina Gómez', guestDoc: '35111222', plate: 'ab123cd' })
      .expect(201)

    // Su propia página ya tiene los dos datos: no hay nada más que pedirle.
    const suya = await request(app).get(`/invitations/public/${anotado.body.token}`)
    expect(suya.body.hasDoc).toBe(true)
    expect(suya.body.hasPlate).toBe(true)

    // Y la garita los lee sin tipear nada.
    const [fila] = await db.select().from(invitations)
      .where(eq(invitations.token, anotado.body.token))
    expect(fila.guestDoc).toBe('35111222')
    expect(fila.plate).toBe('AB123CD')
  })

  it('sin patente, solo queda pendiente la patente', async () => {
    const { inv } = await escenario({ kind: 'evento', capacity: 10 })
    const anotado = await request(app).post(`/invitations/public/${inv.token}/join`)
      .send({ guestName: 'Sin auto', guestDoc: '35111222' }).expect(201)

    const suya = await request(app).get(`/invitations/public/${anotado.body.token}`)
    expect(suya.body.hasDoc).toBe(true)
    expect(suya.body.hasPlate).toBe(false)
  })
})
