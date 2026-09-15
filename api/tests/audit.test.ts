import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function base() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Rulo',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, vecinoId: vecino.id, guardiaId: guardia.id }
}

async function inv(ctx: Awaited<ReturnType<typeof base>>, over: Record<string, unknown> = {}) {
  const [row] = await db.insert(invitations).values({
    unitId: ctx.unitId, createdBy: ctx.vecinoId, kind: 'visita', guestName: 'Alguien',
    validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16), ...over,
  }).returning()
  return row
}

describe('auditoría de invitaciones', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('muestra la que entró y la que NO entró', async () => {
    const ctx = await base()
    const entro = await inv(ctx, { guestName: 'Sí vino' })
    await inv(ctx, { guestName: 'No vino' })
    await registerEntry(entro.id, ctx.guardiaId, { guestName: 'Sí vino' })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const porNombre = Object.fromEntries(
      res.body.map((r: { guestName: string; status: string }) => [r.guestName, r.status]),
    )
    expect(porNombre['Sí vino']).toBe('entro')
    expect(porNombre['No vino']).toBe('esperando')
  })

  it('registra la hora del escaneo y qué guardia lo hizo', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Juan' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Juan' })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const fila = res.body.find((r: { guestName: string }) => r.guestName === 'Juan')
    expect(fila.enteredAt).not.toBeNull()
    expect(fila.guardName).toBe('Rulo')
    expect(fila.enteredCount).toBe(1)
  })

  it('una de ayer sin ingresos queda como vencida, no como esperando', async () => {
    const ctx = await base()
    const ayer = new Date(`${hoy}T12:00:00Z`)
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    const iso = ayer.toISOString().slice(0, 10)
    await inv(ctx, { guestName: 'Nunca vino', validFrom: iso, validTo: iso })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(res.body[0].status).toBe('vencida')
  })

  it('la anulada se distingue de la que no vino', async () => {
    const ctx = await base()
    await inv(ctx, { guestName: 'Anulada', revokedAt: new Date() })
    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(res.body[0].status).toBe('anulada')
  })

  it('los anotados a un evento salen como filas propias con el evento al lado', async () => {
    const ctx = await base()
    const evento = await inv(ctx, { guestName: 'Cumple de Sofi', kind: 'evento', capacity: 20 })
    await inv(ctx, { guestName: 'Martina', kind: 'evento', parentId: evento.id })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const martina = res.body.find((r: { guestName: string }) => r.guestName === 'Martina')
    expect(martina.eventName).toBe('Cumple de Sofi')

    const padre = res.body.find((r: { guestName: string }) => r.guestName === 'Cumple de Sofi')
    expect(padre.eventName).toBeNull()
  })

  it('el CSV sale legible para Excel: BOM, separador y acentos', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Martín Pérez' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Martín Pérez' })

    const res = await request(app).get('/gate/audit.csv').set('Cookie', ctx.cookie)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.text.charCodeAt(0)).toBe(0xfeff)        // BOM
    // El BOM va pegado al sep=, sin salto ni espacio: así lo espera Excel.
    expect(res.text.split('\r\n')[0]).toBe('﻿sep=;')
    expect(res.text).toContain('Martín Pérez')
    expect(res.text).toContain('Entró')
  })

  it('un vecino no puede auditar', async () => {
    const ctx = await base()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/gate/audit').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })
})
