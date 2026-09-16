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

  it('los anotados a un evento salen como filas propias, con el evento al lado', async () => {
    const ctx = await base()
    const evento = await invitacion(ctx, {
      guestName: 'Asado del sábado', kind: 'evento', capacity: 30,
    })
    for (const nombre of ['Martina', 'Nicolás', 'Sofía']) {
      await db.insert(invitations).values({
        unitId: ctx.unitId, createdBy: ctx.vecinoId, parentId: evento.id, kind: 'evento',
        guestName: nombre, validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
      })
    }

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    // El paraguas del evento más cada uno de los tres anotados.
    expect(res.body).toHaveLength(4)

    const paraguas = res.body.find((r: { parentId: string | null }) => r.parentId === null)
    expect(paraguas).toMatchObject({
      guestName: 'Asado del sábado', kind: 'evento', joinedCount: 3, capacity: 30,
    })

    const anotados = res.body.filter((r: { parentId: string | null }) => r.parentId !== null)
    expect(anotados.map((r: { guestName: string }) => r.guestName).sort())
      .toEqual(['Martina', 'Nicolás', 'Sofía'])
    // El evento va como contexto, no como nombre: el guardia busca a la persona.
    for (const a of anotados) {
      expect(a.eventName).toBe('Asado del sábado')
      expect(a.parentId).toBe(evento.id)
    }
  })

  it('escanear a un anotado lo pasa a "ya entró" sin mover a los demás', async () => {
    const ctx = await base()
    const evento = await invitacion(ctx, { guestName: 'Asado', kind: 'evento', capacity: 10 })
    const anotar = (guestName: string) => db.insert(invitations).values({
      unitId: ctx.unitId, createdBy: ctx.vecinoId, parentId: evento.id, kind: 'evento',
      guestName, validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
    }).returning()

    const [martina] = await anotar('Martina')
    await anotar('Nicolás')

    const antes = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    for (const r of antes.body) expect(r.enteredCount).toBe(0)

    await registerEntry(martina.id, null, { guestName: 'Martina' })

    const despues = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    const fila = (nombre: string) =>
      despues.body.find((r: { guestName: string }) => r.guestName === nombre)

    expect(fila('Martina').enteredCount).toBe(1)
    expect(fila('Martina').lastEntryAt).not.toBeNull()
    expect(fila('Nicolás').enteredCount).toBe(0)
    // El paraguas acumula: 1 de 10 entraron al evento.
    expect(fila('Asado').enteredCount).toBe(1)
  })

  it('un anotado anulado no aparece en la lista del día', async () => {
    const ctx = await base()
    const evento = await invitacion(ctx, { guestName: 'Asado', kind: 'evento', capacity: 10 })
    const [fuera] = await db.insert(invitations).values({
      unitId: ctx.unitId, createdBy: ctx.vecinoId, parentId: evento.id, kind: 'evento',
      guestName: 'Colado', validFrom: hoy, validTo: hoy, capacity: 1,
      token: randomToken(16), revokedAt: new Date(),
    }).returning()

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    expect(res.body.map((r: { id: string }) => r.id)).not.toContain(fuera.id)
  })

  it('los ingresos de los anotados cuentan para el evento', async () => {
    const ctx = await base()
    const evento = await invitacion(ctx, { guestName: 'Asado', kind: 'evento', capacity: 30 })
    const [hija] = await db.insert(invitations).values({
      unitId: ctx.unitId, createdBy: ctx.vecinoId, parentId: evento.id, kind: 'evento',
      guestName: 'Martina', validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
    }).returning()
    await registerEntry(hija.id, null, { guestName: 'Martina' })

    const res = await request(app).get('/gate/agenda').set('Cookie', ctx.cookie)
    const paraguas = res.body.find((r: { id: string }) => r.id === evento.id)
    expect(paraguas.enteredCount).toBe(1)
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
