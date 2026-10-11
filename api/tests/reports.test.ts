import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs, authTokens } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry, registerExit } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function scenario() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [conVecino] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 7' }) // UF sin vecinos
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: conVecino.id, personId: vecino.id })

  const [admin] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'admin@example.com', name: 'Admin', role: 'admin',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const [inv] = await db.insert(invitations).values({
    unitId: conVecino.id, createdBy: vecino.id, kind: 'visita', guestName: 'Juan Pérez',
    validFrom: hoy, validTo: hoy, capacity: 5, token: randomToken(16),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], inv, admin, vecino, n }
}

describe('reportes', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('los KPIs cuentan ingresos de hoy y UF sin vecinos', async () => {
    const { cookie, inv, admin } = await scenario()
    await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })
    await registerEntry(inv.id, admin.id, { guestName: 'Otro' })

    const res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.entriesToday).toBe(2)
    expect(res.body.unitsWithoutResidents).toBe(1)
    expect(res.body.enabledResidents).toBe(1)
    expect(res.body.activeInvitations).toBe(1)
  })

  it('distingue vecinos habilitados de vecinos que realmente entraron', async () => {
    const { cookie, vecino } = await scenario()
    let res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.enabledResidents).toBe(1)
    expect(res.body.activeResidents30d).toBe(0)

    await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, vecino.id))
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.activeResidents30d).toBe(1)
  })

  it('invitaciones por persona', async () => {
    const { cookie } = await scenario()
    const res = await request(app).get('/reports/invitations-by-person').set('Cookie', cookie)
    expect(res.body[0]).toMatchObject({ name: 'Martín', total: 1 })
  })

  it('cuenta quién está adentro ahora y quién hace más de 12 horas', async () => {
    const { cookie, inv, admin } = await scenario()
    const entrada = await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })

    let res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(1)
    expect(res.body.staleInside).toBe(0)

    await db.update(entryLogs).set({ enteredAt: new Date(Date.now() - 13 * 60 * 60 * 1000) })
      .where(eq(entryLogs.id, entrada.id))
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(1)
    expect(res.body.staleInside).toBe(1)

    await registerExit(inv.id, admin.id)
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.insideNow).toBe(0)
    expect(res.body.staleInside).toBe(0)
  })

  it('cuenta los ingresos del mismo día, la semana pasada', async () => {
    const { cookie, inv, admin } = await scenario()
    const entrada = await registerEntry(inv.id, admin.id, { guestName: 'Juan Pérez' })
    await db.update(entryLogs).set({ enteredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .where(eq(entryLogs.id, entrada.id))

    const res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.entriesSameDayLastWeek).toBe(1)
    expect(res.body.entriesToday).toBe(0)
  })

  it('cuenta a los invitados cuyo alta venció sin que entraran nunca', async () => {
    const { cookie, n } = await scenario()
    const [invitado] = await db.insert(people).values({
      neighborhoodId: n.id, email: 'nuevo@example.com', name: 'Nuevo', role: 'resident', status: 'invited',
    }).returning()
    await db.insert(authTokens).values({
      personId: invitado.id, tokenHash: 'vencido-1', purpose: 'invite',
      expiresAt: new Date(Date.now() - 1000),
    })

    let res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.invitedNeverLoggedIn).toBe(1)

    // Si lo reinvitan con un link fresco, deja de contar hasta que ese venza.
    await db.insert(authTokens).values({
      personId: invitado.id, tokenHash: 'fresco-1', purpose: 'invite',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    res = await request(app).get('/reports/kpis').set('Cookie', cookie)
    expect(res.body.invitedNeverLoggedIn).toBe(0)
  })

  it('un vecino no puede ver los reportes', async () => {
    await scenario()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/reports/kpis').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })
})
