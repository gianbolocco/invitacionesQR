import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry, registerExit } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

function masDias(n: number): string {
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function base() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  })
  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, vecinoId: vecino.id, neighborhoodId: n.id }
}

async function invitacion(ctx: Awaited<ReturnType<typeof base>>, over: Record<string, unknown>) {
  const [inv] = await db.insert(invitations).values({
    unitId: ctx.unitId, createdBy: ctx.vecinoId, kind: 'visita', guestName: 'Sin nombre',
    validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
    ...over,
  }).returning()
  return inv
}

describe('agenda del día', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('lista las visitas de hoy con la unidad y quién invita', async () => {
    const ctx = await base()
    await invitacion(ctx, { guestName: 'Juan Pérez' })

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      guestName: 'Juan Pérez', unitLabel: 'Lote 142', inviterName: 'Martín', enteredCount: 0,
    })
  })

  it('no muestra las de otros días', async () => {
    const ctx = await base()
    await invitacion(ctx, { guestName: 'Mañana', validFrom: masDias(1), validTo: masDias(1) })

    const hoyRes = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    expect(hoyRes.body).toHaveLength(0)

    const manana = await request(app).get(`/gate/agenda?date=${masDias(1)}`).set('Cookie', ctx.cookie)
    expect(manana.body[0].guestName).toBe('Mañana')
  })

  it('respeta los días de semana de una frecuente', async () => {
    const ctx = await base()
    const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay()
    await invitacion(ctx, {
      guestName: 'Empleada', kind: 'frecuente', validTo: masDias(300),
      weekdays: [dow], capacity: 999,
    })
    await invitacion(ctx, {
      guestName: 'Profe de tenis', kind: 'frecuente', validTo: masDias(300),
      weekdays: [(dow + 1) % 7], capacity: 999,
    })

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    const nombres = res.body.map((r: { guestName: string }) => r.guestName)
    expect(nombres).toContain('Empleada')
    expect(nombres).not.toContain('Profe de tenis')
  })

  it('no lista las anuladas', async () => {
    const ctx = await base()
    await invitacion(ctx, { guestName: 'Anulada', revokedAt: new Date() })
    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    expect(res.body).toHaveLength(0)
  })

  it('el que ya entró sigue en la lista, marcado', async () => {
    const ctx = await base()
    const inv = await invitacion(ctx, { guestName: 'Juan Pérez' })
    await registerEntry(inv.id, null, { guestName: 'Juan Pérez' })

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].enteredCount).toBe(1)
    expect(res.body[0].lastEntryAt).not.toBeNull()
  })





  it('un vecino no puede ver la agenda del barrio', async () => {
    const ctx = await base()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const res = await request(app).get('/gate/agenda').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })
})

describe('los ingresos se cuentan del día que se mira, no de siempre', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('una frecuente que entró hoy no figura adentro mañana', async () => {
    const ctx = await base()
    const frec = await invitacion(ctx, {
      guestName: 'Mucama', kind: 'frecuente', capacity: 999,
      validFrom: hoy, validTo: masDias(7),
    })
    await registerEntry(frec.id, null, { guestName: 'Mucama' })

    const deHoy = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', ctx.cookie)
    expect(deHoy.body[0]).toMatchObject({ enteredCount: 1 })
    expect(deHoy.body[0].lastEntryAt).not.toBeNull()

    const deManana = await request(app).get(`/gate/agenda?date=${masDias(1)}`).set('Cookie', ctx.cookie)
    expect(deManana.body[0]).toMatchObject({ guestName: 'Mucama', enteredCount: 0 })
    expect(deManana.body[0].lastEntryAt).toBeNull()
  })

  it('mirar ayer no muestra el ingreso de hoy', async () => {
    const ctx = await base()
    const frec = await invitacion(ctx, {
      guestName: 'Jardinero', kind: 'frecuente', capacity: 999,
      validFrom: masDias(-7), validTo: masDias(7),
    })
    await registerEntry(frec.id, null, { guestName: 'Jardinero' })

    const ayer = await request(app).get(`/gate/agenda?date=${masDias(-1)}`).set('Cookie', ctx.cookie)
    expect(ayer.body[0]).toMatchObject({ guestName: 'Jardinero', enteredCount: 0 })
  })

})

describe('la lista del día distingue adentro de salió', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const fila = async (ctx: Awaited<ReturnType<typeof base>>, id: string) => {
    const res = await request(app).get(`/gate/agenda?date=${hoy}`).set('Cookie', ctx.cookie)
    return res.body.find((r: { id: string }) => r.id === id)
  }

  it('antes de entrar: ni adentro ni salida', async () => {
    const ctx = await base()
    const inv = await invitacion(ctx, { guestName: 'Juan' })
    const r = await fila(ctx, inv.id)
    expect(r).toMatchObject({ enteredCount: 0, adentro: false })
    expect(r.lastExitAt).toBeNull()
  })

  it('después de entrar: adentro, sin salida', async () => {
    const ctx = await base()
    const inv = await invitacion(ctx, { guestName: 'Juan' })
    await registerEntry(inv.id, null, { guestName: 'Juan' })

    const r = await fila(ctx, inv.id)
    expect(r).toMatchObject({ enteredCount: 1, adentro: true })
    expect(r.lastExitAt).toBeNull()
  })

  it('después de salir: no adentro, con la hora de salida', async () => {
    const ctx = await base()
    const inv = await invitacion(ctx, { guestName: 'Juan' })
    await registerEntry(inv.id, null, { guestName: 'Juan' })
    await registerExit(inv.id, null)

    const r = await fila(ctx, inv.id)
    // enteredCount sigue en 1: el egreso no agrega ni quita un ingreso.
    expect(r).toMatchObject({ enteredCount: 1, adentro: false })
    expect(r.lastExitAt).not.toBeNull()
  })

  it('una fila abierta de ayer deja adentro en true hoy', async () => {
    const ctx = await base()
    const inv = await invitacion(ctx, {
      guestName: 'Mucama', kind: 'frecuente', capacity: 999,
      validFrom: masDias(-7), validTo: masDias(7),
    })
    const entrada = await registerEntry(inv.id, null, { guestName: 'Mucama' })
    await db.update(entryLogs)
      .set({ enteredAt: new Date(Date.now() - 36 * 3600_000) })
      .where(eq(entryLogs.id, entrada.id))

    const r = await fila(ctx, inv.id)
    // El ingreso fue anteayer, así que no cuenta para hoy, pero la persona
    // sigue sin registrar su salida: adentro es la verdad.
    expect(r.enteredCount).toBe(0)
    expect(r.adentro).toBe(true)
  })
})
