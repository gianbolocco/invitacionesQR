import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { eq, sql } from 'drizzle-orm'
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

describe('cuántos se anotaron', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('el evento reporta sus anotados, la visita reporta cero', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const evento = await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'evento', guestName: 'Cumple', validFrom: hoy, validTo: hoy, capacity: 20,
    })
    await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'visita', guestName: 'Juan', validFrom: hoy, validTo: hoy, capacity: 1,
    })
    for (const n of ['Uno', 'Dos', 'Tres']) {
      await request(app).post(`/invitations/public/${evento.body.token}/join`).send({ guestName: n })
    }

    const lista = await request(app).get('/invitations').set('Cookie', ctx.cookie)
    const porNombre = Object.fromEntries(
      lista.body.map((i: { guestName: string; joinedCount: number }) => [i.guestName, i.joinedCount]),
    )
    expect(porNombre['Cumple']).toBe(3)
    expect(porNombre['Juan']).toBe(0)
  })
})

describe('administrar a los anotados de un evento', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  async function eventoCon(anotados: string[], capacity = 10) {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const ev = await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'evento', guestName: 'Cumple', validFrom: hoy, validTo: hoy, capacity,
    })
    for (const n of anotados) {
      await request(app).post(`/invitations/public/${ev.body.token}/join`).send({ guestName: n })
    }
    const guests = await request(app).get(`/invitations/${ev.body.id}/guests`).set('Cookie', ctx.cookie)
    return { ctx, evento: ev.body, guests: guests.body }
  }

  it('el listado trae lo necesario para abrir a cada uno como una invitación', async () => {
    const { guests } = await eventoCon(['Martina'])
    expect(guests[0]).toMatchObject({ guestName: 'Martina', capacity: 1, kind: 'evento' })
    expect(guests[0].token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(guests[0].unitLabel).toBe('Lote 142')
  })

  it('se le puede editar el nombre y el documento', async () => {
    const { ctx, guests } = await eventoCon(['Martina'])
    const res = await request(app).patch(`/invitations/${guests[0].id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Martina Gómez', guestDoc: '35111222' })

    expect(res.status).toBe(200)
    expect(res.body.guestName).toBe('Martina Gómez')
    expect(res.body.guestDoc).toBe('35111222')
    expect(res.body.token).toBe(guests[0].token)
  })

  it('editarlo NO le cambia las fechas: las hereda del evento', async () => {
    const { ctx, guests } = await eventoCon(['Martina'])
    await request(app).patch(`/invitations/${guests[0].id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Martina', validFrom: '2030-01-01', validTo: '2030-01-01', capacity: 99 })

    const [fila] = await db.select().from(invitations).where(eq(invitations.id, guests[0].id))
    expect(fila.validFrom).toBe(hoy)
    expect(fila.capacity).toBe(1)
  })

  it('se anula y se vuelve a habilitar', async () => {
    const { ctx, guests } = await eventoCon(['Martina'])

    await request(app).post(`/invitations/${guests[0].id}/revoke`).set('Cookie', ctx.cookie).expect(200)
    let lista = await request(app).get(`/invitations/${guests[0].id}/guests`).set('Cookie', ctx.cookie)
    let [fila] = await db.select().from(invitations).where(eq(invitations.id, guests[0].id))
    expect(fila.revokedAt).not.toBeNull()

    await request(app).post(`/invitations/${guests[0].id}/restore`).set('Cookie', ctx.cookie).expect(200)
    ;[fila] = await db.select().from(invitations).where(eq(invitations.id, guests[0].id))
    expect(fila.revokedAt).toBeNull()
    expect(lista.status).toBe(200)
  })

  it('no se habilita un anotado si el evento sigue anulado', async () => {
    const { ctx, evento, guests } = await eventoCon(['Martina'])
    await request(app).post(`/invitations/${evento.id}/revoke`).set('Cookie', ctx.cookie).expect(200)

    const res = await request(app).post(`/invitations/${guests[0].id}/restore`).set('Cookie', ctx.cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('evento_anulado')
  })

  it('habilitar el evento habilita también a los anotados', async () => {
    const { ctx, evento, guests } = await eventoCon(['Martina', 'Nico'])
    await request(app).post(`/invitations/${evento.id}/revoke`).set('Cookie', ctx.cookie)
    await request(app).post(`/invitations/${evento.id}/restore`).set('Cookie', ctx.cookie).expect(200)

    for (const g of guests) {
      const [fila] = await db.select().from(invitations).where(eq(invitations.id, g.id))
      expect(fila.revokedAt).toBeNull()
    }
  })

  it('no se habilita si mientras tanto se llenó el cupo', async () => {
    const { ctx, evento, guests } = await eventoCon(['Uno', 'Dos'], 2)
    await request(app).post(`/invitations/${guests[0].id}/revoke`).set('Cookie', ctx.cookie)

    // El lugar que quedó libre lo toma otro.
    await request(app).post(`/invitations/public/${evento.token}/join`)
      .send({ guestName: 'Tres' }).expect(201)

    const res = await request(app).post(`/invitations/${guests[0].id}/restore`).set('Cookie', ctx.cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_capacity')
  })

  it('un vecino de otra UF no puede habilitar', async () => {
    const { guests } = await eventoCon(['Martina'])
    const otro = await resident('ana@example.com', 'Lote 7')
    const res = await request(app).post(`/invitations/${guests[0].id}/restore`).set('Cookie', otro.cookie)
    expect(res.status).toBe(403)
  })
})

describe('historial: buscar, filtrar y paginar', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  // Fecha real, no fija: anotarse a un evento ya vencido devuelve 409, así que
  // una constante en el pasado haría fallar el test con el correr de los días.
  const HOY = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())

  async function poblar() {
    const { cookie, unitId, personId } = await resident('martin@example.com', 'Lote 142')
    const crear = (guestName: string, extra: Record<string, unknown> = {}) =>
      request(app).post('/invitations').set('Cookie', cookie).send({
        unitId, kind: 'visita', guestName, validFrom: HOY, validTo: HOY, capacity: 1, ...extra,
      }).expect(201)

    const martin = await crear('Martín Gómez', { guestDoc: '30111222', plate: 'AB123CD' })
    const ana = await crear('Ana López')
    const evento = await crear('Cumple de Sofi', { kind: 'evento', capacity: 5 })
    for (let i = 0; i < 12; i++) await crear(`Relleno ${i}`)

    return { cookie, unitId, personId, martin: martin.body, ana: ana.body, evento: evento.body }
  }

  it('busca sin tildes y en documento y patente', async () => {
    const { cookie } = await poblar()
    const nombres = async (q: string) =>
      (await request(app).get(`/invitations/historial?q=${encodeURIComponent(q)}`)
        .set('Cookie', cookie).expect(200)).body.rows.map((i: { guestName: string }) => i.guestName)

    expect(await nombres('martin')).toEqual(['Martín Gómez'])
    expect(await nombres('GÓMEZ')).toEqual(['Martín Gómez'])
    expect(await nombres('30111')).toEqual(['Martín Gómez'])
    expect(await nombres('ab123cd')).toEqual(['Martín Gómez'])
    expect(await nombres('nadie')).toEqual([])
  })

  it('pagina y el total es el del filtro, no el de la página', async () => {
    const { cookie } = await poblar()
    const p1 = await request(app).get('/invitations/historial?pageSize=5').set('Cookie', cookie).expect(200)
    expect(p1.body.rows).toHaveLength(5)
    expect(p1.body.total).toBe(15)

    const p3 = await request(app).get('/invitations/historial?pageSize=5&page=3').set('Cookie', cookie).expect(200)
    expect(p3.body.rows).toHaveLength(5)
    expect(p3.body.total).toBe(15)

    const ids = new Set([...p1.body.rows, ...p3.body.rows].map((i: { id: string }) => i.id))
    expect(ids.size).toBe(10)

    const p4 = await request(app).get('/invitations/historial?pageSize=5&page=4').set('Cookie', cookie).expect(200)
    expect(p4.body.rows).toHaveLength(0)
    expect(p4.body.total).toBe(15)
  })

  it('filtra por tipo y por estado', async () => {
    const { cookie, martin, evento } = await poblar()

    const porTipo = await request(app).get('/invitations/historial?kind=evento')
      .set('Cookie', cookie).expect(200)
    expect(porTipo.body.rows.map((i: { id: string }) => i.id)).toEqual([evento.id])

    await request(app).post(`/invitations/${martin.id}/revoke`).set('Cookie', cookie).expect(200)
    const anuladas = await request(app).get('/invitations/historial?estado=anulada')
      .set('Cookie', cookie).expect(200)
    expect(anuladas.body.total).toBe(1)
    expect(anuladas.body.rows[0].id).toBe(martin.id)

    // Nadie entró todavía: todas las que no están anuladas son "no entró".
    const sinEntrar = await request(app).get('/invitations/historial?estado=no_entro')
      .set('Cookie', cookie).expect(200)
    expect(sinEntrar.body.total).toBe(14)

    const entraron = await request(app).get('/invitations/historial?estado=entro')
      .set('Cookie', cookie).expect(200)
    expect(entraron.body.total).toBe(0)
  })

  it('"solo las mías" deja afuera las de los demás de la UF', async () => {
    const { cookie, unitId } = await poblar()
    const barrio = await neighborhood()
    const [ana] = await db.insert(people).values({
      neighborhoodId: barrio.id, email: 'ana@example.com', name: 'Ana', role: 'resident',
      status: 'active', passwordHash: await hashPassword(PASS),
    }).returning()
    await db.insert(unitMembers).values({ unitId, personId: ana.id })
    const login = await request(app).post('/auth/login').send({ email: 'ana@example.com', password: PASS })

    await request(app).post('/invitations').set('Cookie', login.headers['set-cookie']).send({
      unitId, kind: 'visita', guestName: 'Invitado de Ana',
      validFrom: HOY, validTo: HOY, capacity: 1,
    }).expect(201)

    const todas = await request(app).get('/invitations/historial')
      .set('Cookie', login.headers['set-cookie']).expect(200)
    expect(todas.body.total).toBe(16)

    const mias = await request(app).get('/invitations/historial?soloMias=true')
      .set('Cookie', login.headers['set-cookie']).expect(200)
    expect(mias.body.total).toBe(1)
    expect(mias.body.rows[0].guestName).toBe('Invitado de Ana')
  })

  it('no muestra a los anotados de un evento como filas sueltas', async () => {
    const { cookie, evento } = await poblar()
    await request(app).post(`/invitations/public/${evento.token}/join`)
      .send({ guestName: 'Juan Carlos' }).expect(201)

    const res = await request(app).get('/invitations/historial?q=juan')
      .set('Cookie', cookie).expect(200)
    expect(res.body.total).toBe(0)

    const todo = await request(app).get('/invitations/historial').set('Cookie', cookie).expect(200)
    expect(todo.body.total).toBe(15)
  })

  it('no filtra por UF ajena: solo ve lo de la suya', async () => {
    await poblar()
    const otro = await resident('vecina@example.com', 'Lote 7')
    const res = await request(app).get('/invitations/historial').set('Cookie', otro.cookie).expect(200)
    expect(res.body.total).toBe(0)
  })
})
