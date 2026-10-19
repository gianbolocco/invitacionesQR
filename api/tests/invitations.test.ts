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

/** Hoy en Buenos Aires. La home devuelve solo lo vigente, así que una constante
 *  en el pasado haría fallar estos tests con el correr de los días. */
const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
}).format(new Date())

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
      validFrom: DIA, validTo: DIA, capacity: 1,
    })

    const res = await request(app).get('/invitations').set('Cookie', loginAna.headers['set-cookie'])
    expect(res.body).toHaveLength(1)
    expect(res.body[0].guestName).toBe('Juan Pérez')
    expect(res.body[0].creatorName).toBe('martin')
  })

  it('revoca una invitación: sale de la home y queda anulada en el historial', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan',
      validFrom: DIA, validTo: DIA, capacity: 1,
    })
    const res = await request(app).post(`/invitations/${inv.body.id}/revoke`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const lista = await request(app).get('/invitations').set('Cookie', cookie)
    expect(lista.body).toHaveLength(0)

    const hist = await request(app).get('/invitations/historial?estado=anulada').set('Cookie', cookie)
    expect(hist.body.rows).toHaveLength(1)
    expect(hist.body.rows[0].revokedAt).not.toBeNull()
  })

  /** Un guardia logueado, para registrar el ingreso en los tests de abajo. */
  async function guardiaDeTurno() {
    const barrio = await neighborhood()
    await db.insert(people).values({
      neighborhoodId: barrio.id, email: 'guardia@example.com', name: 'Guardia',
      role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
    }).onConflictDoNothing()
    const g = await request(app).post('/auth/login')
      .send({ email: 'guardia@example.com', password: PASS })
    return g.headers['set-cookie']
  }

  it('no deja anular con el invitado adentro', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    const g = await guardiaDeTurno()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Juan', guestDoc: '30123456' }).expect(201)

    const res = await request(app).post(`/invitations/${inv.id}/revoke`).set('Cookie', cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('guest_inside')

    // Sigue vigente: no quedó anulada a medias.
    const lista = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(lista.body.map((i: { id: string }) => i.id)).toContain(inv.id)
  })

  it('se puede anular una vez que el invitado salió', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    const g = await guardiaDeTurno()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Juan', guestDoc: '30123456' }).expect(201)
    await request(app).post('/gate/exits').set('Cookie', g)
      .send({ invitationId: inv.id }).expect(201)

    await request(app).post(`/invitations/${inv.id}/revoke`).set('Cookie', cookie).expect(200)
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

  it('rechaza un cupo menor a 1', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const res = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 0,
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

describe('editar una invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const HOY = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const MANIANA = new Date(Date.parse(`${HOY}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

  async function visita(ctx: { cookie: string[]; unitId: string }, over = {}) {
    const res = await request(app).post('/invitations').set('Cookie', ctx.cookie).send({
      unitId: ctx.unitId, kind: 'visita', guestName: 'Juan Pérez',
      validFrom: HOY, validTo: HOY, capacity: 1, ...over,
    })
    return res.body
  }

  it('una frecuente guarda si es visita o proveedor; sin decirlo, visita', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const prov = await visita(ctx, { kind: 'frecuente', frequentAs: 'proveedor', capacity: 999 })
    const sinDecir = await visita(ctx, { kind: 'frecuente', capacity: 999 })
    const comun = await visita(ctx, { frequentAs: 'proveedor' })
    expect(prov.frequentAs).toBe('proveedor')
    expect(sinDecir.frequentAs).toBe('visita')
    // Una invitación que no es frecuente no lleva subtipo aunque lo manden.
    expect(comun.frequentAs).toBeNull()
  })

  it('el subtipo de una frecuente se edita; en otra invitación da 400', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const frec = await visita(ctx, { kind: 'frecuente', capacity: 999 })
    const res = await request(app).patch(`/invitations/${frec.id}`).set('Cookie', ctx.cookie)
      .send({ frequentAs: 'proveedor' }).expect(200)
    expect(res.body.frequentAs).toBe('proveedor')

    const comun = await visita(ctx)
    const mal = await request(app).patch(`/invitations/${comun.id}`).set('Cookie', ctx.cookie)
      .send({ frequentAs: 'proveedor' })
    expect(mal.status).toBe(400)
    expect(mal.body.error).toBe('no_es_frecuente')
  })

  it('cambia nombre, documento y fecha mientras está pendiente', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const inv = await visita(ctx)

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Juan Carlos Pérez', guestDoc: '30123456', validTo: MANIANA })

    expect(res.status).toBe(200)
    expect(res.body.guestName).toBe('Juan Carlos Pérez')
    expect(res.body.guestDoc).toBe('30123456')
    expect(res.body.validTo).toBe(MANIANA)
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
    const inv = await visita(ctx, { validTo: MANIANA })

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ validFrom: MANIANA, validTo: HOY })
    expect(res.status).toBe(400)
  })

  it('no se edita una invitación usada, ni con el invitado adentro ni después', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const frec = await visita(ctx, { kind: 'frecuente', capacity: 10 })

    const { registerEntry, registerExit } = await import('../src/services/entries.js')
    await registerEntry(frec.id, null, { guestName: 'Juan Pérez' })

    const adentro = await request(app).patch(`/invitations/${frec.id}`).set('Cookie', ctx.cookie)
      .send({ guestName: 'Otro' })
    expect(adentro.status).toBe(409)
    expect(adentro.body.error).toBe('ya_usada')

    await registerExit(frec.id, null)
    const salio = await request(app).patch(`/invitations/${frec.id}`).set('Cookie', ctx.cookie)
      .send({ validTo: MANIANA })
    expect(salio.status).toBe(409)
  })

  it('no se edita una vencida', async () => {
    const ctx = await resident('martin@example.com', 'Lote 142')
    const inv = await visita(ctx)
    await db.update(invitations).set({ validFrom: '2020-01-01', validTo: '2020-01-02' })
      .where(eq(invitations.id, inv.id))

    const res = await request(app).patch(`/invitations/${inv.id}`).set('Cookie', ctx.cookie)
      .send({ validTo: MANIANA })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('vencida')
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

describe('historial: buscar, filtrar y paginar', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

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
    const frec = await crear('Mucama', { kind: 'frecuente', capacity: 999 })
    for (let i = 0; i < 12; i++) await crear(`Relleno ${i}`)

    return { cookie, unitId, personId, martin: martin.body, ana: ana.body, frec: frec.body }
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
    const { cookie, martin, frec } = await poblar()

    const porTipo = await request(app).get('/invitations/historial?kind=frecuente')
      .set('Cookie', cookie).expect(200)
    expect(porTipo.body.rows.map((i: { id: string }) => i.id)).toEqual([frec.id])

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


  it('no filtra por UF ajena: solo ve lo de la suya', async () => {
    await poblar()
    const otro = await resident('vecina@example.com', 'Lote 7')
    const res = await request(app).get('/invitations/historial').set('Cookie', otro.cookie).expect(200)
    expect(res.body.total).toBe(0)
  })
})

describe('la home del vecino pide solo lo vigente', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  const HOY = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date())
  const dias = (n: number) => {
    const d = new Date(`${HOY}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  /** Un guardia logueado, para registrar ingresos y salidas. Devuelve su cookie. */
  async function guardia() {
    const barrio = await neighborhood()
    await db.insert(people).values({
      neighborhoodId: barrio.id, email: 'guardia@example.com', name: 'Guardia',
      role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
    }).onConflictDoNothing()
    const g = await request(app).post('/auth/login')
      .send({ email: 'guardia@example.com', password: PASS })
    return g.headers['set-cookie']
  }

  it('deja afuera las vencidas, las anuladas y las que ya se usaron y salieron', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const crear = (guestName: string, over: Record<string, unknown> = {}) =>
      request(app).post('/invitations').set('Cookie', cookie).send({
        unitId, kind: 'visita', guestName, validFrom: HOY, validTo: HOY, capacity: 1, ...over,
      }).expect(201).then((r) => r.body)

    const viva = await crear('Vigente')
    await crear('Vencida', { validFrom: dias(-10), validTo: dias(-3) })
    const anulada = await crear('Anulada')
    await request(app).post(`/invitations/${anulada.id}/revoke`).set('Cookie', cookie).expect(200)
    const usada = await crear('Ya entró')

    const g = await guardia()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: usada.id, guestName: 'Ya entró', guestDoc: '30123456' }).expect(201)
    await request(app).post('/gate/exits').set('Cookie', g)
      .send({ invitationId: usada.id }).expect(201)

    const res = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(res.body.map((i: { guestName: string }) => i.guestName)).toEqual(['Vigente'])
    expect(res.body[0].id).toBe(viva.id)
    expect(res.body[0].adentro).toBe(false)
    expect(res.body[0].ultimoIngreso).toBeNull()

    // Pero el historial las sigue teniendo todas.
    const hist = await request(app).get('/invitations/historial').set('Cookie', cookie).expect(200)
    expect(hist.body.total).toBe(4)
  })

  it('quien está adentro sigue en la home aunque haya agotado el cupo', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Adentro', validFrom: HOY, validTo: HOY, capacity: 1,
    }).expect(201).then((r) => r.body)

    const g = await guardia()
    await request(app).post('/gate/entries').set('Cookie', g)
      .send({ invitationId: inv.id, guestName: 'Adentro', guestDoc: '30123456' }).expect(201)

    const res = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].adentro).toBe(true)
    expect(typeof res.body[0].ultimoIngreso).toBe('string')
    expect(res.body[0].usedCount).toBe(1)
  })

  it('una frecuente de todo el año sigue vigente aunque haya entrado muchas veces', async () => {
    const { cookie, unitId } = await resident('ana@example.com', 'Lote 7')
    await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'frecuente', guestName: 'Mucama',
      validFrom: dias(-30), validTo: dias(300), capacity: 999,
    }).expect(201)

    const res = await request(app).get('/invitations').set('Cookie', cookie).expect(200)
    expect(res.body.map((i: { guestName: string }) => i.guestName)).toEqual(['Mucama'])
  })
})

describe('detalle de una invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('devuelve la invitación con sus datos de lista', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    const res = await request(app).get(`/invitations/${inv.id}`).set('Cookie', cookie).expect(200)
    expect(res.body.guestName).toBe('Juan')
    expect(res.body.unitLabel).toBe('Lote 142')
    expect(res.body.creatorName).toBe('martin')
    expect(res.body.usedCount).toBe(0)
    expect(res.body.adentro).toBe(false)
  })

  it('también devuelve una anulada: el detalle no es solo de las vigentes', async () => {
    const { cookie, unitId } = await resident('martin@example.com', 'Lote 142')
    const inv = await request(app).post('/invitations').set('Cookie', cookie).send({
      unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)
    await request(app).post(`/invitations/${inv.id}/revoke`).set('Cookie', cookie).expect(200)

    const res = await request(app).get(`/invitations/${inv.id}`).set('Cookie', cookie).expect(200)
    expect(res.body.revokedAt).not.toBeNull()
  })

  it('un vecino de otra UF no la puede ver', async () => {
    const a = await resident('martin@example.com', 'Lote 142')
    const b = await resident('ana@example.com', 'Lote 7')
    const inv = await request(app).post('/invitations').set('Cookie', a.cookie).send({
      unitId: a.unitId, kind: 'visita', guestName: 'Juan', validFrom: DIA, validTo: DIA, capacity: 1,
    }).expect(201).then((r) => r.body)

    await request(app).get(`/invitations/${inv.id}`).set('Cookie', b.cookie).expect(403)
  })

  it('una que no existe da 404', async () => {
    const { cookie } = await resident('martin@example.com', 'Lote 142')
    await request(app).get('/invitations/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookie).expect(404)
  })
})
