import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { sql } from 'drizzle-orm'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function neighborhood() {
  const [n] = await db.select().from(neighborhoods).limit(1)
  return n ?? (await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning())[0]
}

async function resident(email: string, label: string) {
  const barrio = await neighborhood()
  const [u] = await db.insert(units).values({ neighborhoodId: barrio.id, label }).returning()
  const [p] = await db.insert(people).values({
    neighborhoodId: barrio.id, email, name: email.split('@')[0], role: 'resident',
    status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
  const login = await request(app).post('/auth/login').send({ email, password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, personId: p.id }
}

describe('invitaciones', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('crea una visita puntual y devuelve el token del QR', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    expect(res.status).toBe(201)
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(res.body.guestName).toBe('Juan Pérez')
  })

  it('no deja crear una invitación para una UF ajena', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const res = await request(app).post('/invitations').set('Cookie', a.cookie).send({
      unitId: b.unitId, kind: 'visita', guestName: 'Colado',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    expect(res.status).toBe(403)
  })

  it('lista las invitaciones de la UF, no solo las propias', async () => {
    const martin = await resident('martin@example.com', 'Lote 142')
    const barrio = await neighborhood()
    const [ana] = await db.insert(people).values({
      neighborhoodId: barrio.id, email: 'ana@example.com', name: 'Ana', role: 'resident',
      status: 'active', passwordHash: await hashPassword(PASS),
    }).returning()
    await db.insert(unitMembers).values({ unitId: martin.unitId, personId: ana.id })
    const loginAna = await request(app).post('/auth/login').send({ email: 'ana@example.com', password: PASS })

    await request(app).post('/invitations').set('Cookie', martin.cookie).send({
      unitId: martin.unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })

    const res = await request(app).get('/invitations').set('Cookie', loginAna.headers['set-cookie'])
    expect(res.body).toHaveLength(1)
    expect(res.body[0].guestName).toBe('Juan Pérez')
    expect(res.body[0].creatorName).toBe('martin')
  })

  it('revoca una invitación', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    const res = await request(app).post(`/invitations/${inv.body.id}/revoke`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const lista = await request(app).get('/invitations').set('Cookie', cookie)
    expect(lista.body[0].revokedAt).not.toBeNull()
  })

  it('un vecino de otra UF no puede revocar', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const inv = await request(app).post('/invitations').set('Cookie', a.cookie).send({
      unitId: a.unitId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    const res = await request(app).post(`/invitations/${inv.body.id}/revoke`).set('Cookie', b.cookie)
    expect(res.status).toBe(403)
  })

  it('la página pública del QR no necesita sesión ni filtra datos sensibles', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan Pérez', guestDoc: '30123456',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 1,
    })
    const res = await request(app).get(`/invitations/public/${inv.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.guestName).toBe('Juan Pérez')
    expect(res.body.unitLabel).toBe('Lote 142')
    expect(res.body.guestDoc).toBeUndefined()
  })

  it('rechaza un evento con cupo menor a 1', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'evento', guestName: 'Cumple de Sofi',
      validFrom: '2026-09-14', validTo: '2026-09-14', capacity: 0,
    })
    expect(res.status).toBe(400)
  })

  it('rechaza una ventana invertida', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan',
      validFrom: '2026-09-20', validTo: '2026-09-10', capacity: 1,
    })
    expect(res.status).toBe(400)
  })
})

describe('revocar un evento', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('anular el evento anula también a los anotados', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const evento = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'evento', guestName: 'Cumple de Sofi',
      validFrom: hoy, validTo: hoy, capacity: 10,
    })

    // Dos invitados se anotan desde el link público.
    const a = await request(app).post(`/invitations/public/${evento.body.token}/join`)
      .send({ guestName: 'Martina' })
    const b = await request(app).post(`/invitations/public/${evento.body.token}/join`)
      .send({ guestName: 'Nicolás' })

    await request(app).post(`/invitations/${evento.body.id}/revoke`).set('Cookie', cookie).expect(200)

    // Sin la cascada, cada anotado seguiría entrando con su propio QR.
    for (const token of [a.body.token, b.body.token]) {
      const { rows } = await db.execute(
        sql`select revoked_at from invitation where token = ${token}`,
      )
      expect(rows[0].revoked_at).not.toBeNull()
    }
  })
})

describe('editar una invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  async function visita(ctx: { cookie: string[]; unitId: string }, over = {}) {
    const res = await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: '2026-09-20', validTo: '2026-09-20', capacity: 1, ...over,
    })
    return res.body
  }

  it('cambia nombre, documento y fecha', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const inv = await visita(ctx)

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Juan Carlos Pérez', guestDoc: '30123456', validTo: '2026-09-21' })

    expect(res.status).toBe(200)
    expect(res.body.guestName).toBe('Juan Carlos Pérez')
    expect(res.body.guestDoc).toBe('30123456')
    expect(res.body.validTo).toBe('2026-09-21')
    // El token no cambia: el invitado ya tiene el link.
    expect(res.body.token).toBe(inv.token)
  })

  it('un vecino de otra UF no puede editar', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const inv = await visita(a)

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', b.cookie)
      .send({ guestName: 'Me la robo' })
    expect(res.status).toBe(403)
  })

  it('no deja invertir la ventana', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const inv = await visita(ctx)

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ validFrom: '2026-09-25', validTo: '2026-09-20' })
    expect(res.status).toBe(400)
  })

  it('no deja bajar el cupo por debajo de los que ya entraron', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const evento = await visita(ctx, { kind: 'evento', capacity: 10, validFrom: hoy, validTo: hoy })

    const { registerEntry } = await import('../src/services/entries.js')
    await registerEntry(evento.id, null, { guestName: 'Uno' })
    await registerEntry(evento.id, null, { guestName: 'Dos' })

    const res = await request(app).patch(`/invitations/${evento.id}`).set('Cookie', ctx.cookie)
      .send({ capacity: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('cupo_menor_al_usado')

    // Subirlo sí se puede.
    await request(app).patch(`/invitations/${evento.id}`).set('Cookie', ctx.cookie)
      .send({ capacity: 20 }).expect(200)
  })

  it('no se edita una anulada', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const inv = await visita(ctx)
    await request(app).post(`/invitations/${inv.id}/revoke`).set('Cookie', ctx.cookie)

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Otro' })
    expect(res.status).toBe(409)
  })

  it('no se edita a alguien que se anotó a un evento: esa invitación es suya', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const evento = await visita(ctx, { kind: 'evento', capacity: 10, validFrom: hoy, validTo: hoy })
    const anotado = await request(app).post(`/invitations/public/${evento.token}/join`)
      .send({ guestName: 'Martina' })

    const { rows } = await db.execute(
      sql`select id from invitation where token = ${anotado.body.token}`,
    )
    const res = await request(app).patch(`/invitations/${rows[0].id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Le cambio el nombre' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('es_un_anotado')
  })
})

describe('los anotados no son invitaciones del vecino', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('quien se anotó a un evento NO aparece como un evento propio en la lista', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const evento = await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'evento', guestName: 'Cumple de Sofi',
      validFrom: hoy, validTo: hoy, capacity: 20,
    })

    for (const nombre of ['juan carlos', 'Martina']) {
      await request(app).post(`/invitations/public/${evento.body.token}/join`)
        .send({ guestName: nombre }).expect(201)
    }

    const lista = await request(app).get('/invitations').set('Cookie', ctx.cookie)
    const nombres = lista.body.map((i: { guestName: string }) => i.guestName)

    // Solo el evento. Los anotados se ven entrando al evento, no sueltos.
    expect(nombres).toEqual(['Cumple de Sofi'])
    expect(nombres).not.toContain('juan carlos')

    // Y siguen estando, adentro del evento.
    const anotados = await request(app).get(`/invitations/${evento.body.id}/guests`)
      .set('Cookie', ctx.cookie)
    expect(anotados.body.map((a: { guestName: string }) => a.guestName)).toEqual(
      ['juan carlos', 'Martina'],
    )
  })
})
