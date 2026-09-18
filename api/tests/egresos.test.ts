import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db, pool } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry, registerExit } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function escenario(capacity = 1, over: Record<string, unknown> = {}) {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })

  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'rulo@example.com', name: 'Rulo',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const [otro] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'carlos@example.com', name: 'Carlos',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const [inv] = await db.insert(invitations).values({
    unitId: u.id, createdBy: vecino.id, kind: capacity > 1 ? 'frecuente' : 'visita',
    guestName: 'Juan Pérez', validFrom: hoy, validTo: hoy, capacity,
    token: randomToken(16), ...over,
  }).returning()

  const login = await request(app).post('/auth/login')
    .send({ email: 'rulo@example.com', password: PASS })
  const loginOtro = await request(app).post('/auth/login')
    .send({ email: 'carlos@example.com', password: PASS })

  return {
    cookie: login.headers['set-cookie'] as unknown as string[],
    cookieOtro: loginOtro.headers['set-cookie'] as unknown as string[],
    inv, guardia, otro, unitId: u.id, neighborhoodId: n.id,
  }
}

describe('registrar un egreso', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('cierra la fila abierta con la hora y el guardia de la salida', async () => {
    const { inv, cookieOtro, guardia, otro } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })

    // Sale con OTRO guardia: es el caso del cambio de turno.
    const res = await request(app).post('/gate/exits')
      .set('Cookie', cookieOtro)
      .send({ invitationId: inv.id })
    expect(res.status).toBe(201)

    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, inv.id))
    expect(fila.exitedAt).not.toBeNull()
    expect(fila.exitGuardId).toBe(otro.id)
    expect(fila.guardId).toBe(guardia.id)
  })

  it('el guardia sale de la sesión: un exitGuardId del body se ignora', async () => {
    const { inv, cookie, guardia, otro } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })

    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id, exitGuardId: otro.id }).expect(201)

    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, inv.id))
    expect(fila.exitGuardId).toBe(guardia.id)
  })

  it('un egreso de quien no está adentro da 409', async () => {
    const { inv, cookie } = await escenario()
    const res = await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_esta_adentro')
  })

  it('no se puede salir dos veces', async () => {
    const { inv, cookie, guardia } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id }).expect(201)

    const res = await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id })
    expect(res.status).toBe(409)
  })

  it('un egreso se registra aunque la invitación esté anulada', async () => {
    const { inv, cookie, guardia } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id))

    // El que está adentro tiene que poder salir, y que eso quede registrado.
    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id }).expect(201)
  })

  it('un egreso se registra aunque la ventana haya vencido', async () => {
    const { inv, cookie, guardia } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    await db.update(invitations).set({ validFrom: '2020-01-01', validTo: '2020-01-02' })
      .where(eq(invitations.id, inv.id))

    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id }).expect(201)
  })

  it('el egreso no libera cupo: el reingreso sigue rebotando', async () => {
    const { inv, cookie, guardia } = await escenario(1)
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id }).expect(201)

    await expect(registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' }))
      .rejects.toThrow(/no_capacity/)
  })

  it('con dos filas abiertas cierra la más reciente y deja la otra abierta', async () => {
    const { inv, cookie, guardia } = await escenario(10)
    const primera = await registerEntry(inv.id, guardia.id, { guestName: 'Primera' })
    const segunda = await registerEntry(inv.id, guardia.id, { guestName: 'Segunda' })

    await request(app).post('/gate/exits').set('Cookie', cookie)
      .send({ invitationId: inv.id }).expect(201)

    const [a] = await db.select().from(entryLogs).where(eq(entryLogs.id, primera.id))
    const [b] = await db.select().from(entryLogs).where(eq(entryLogs.id, segunda.id))
    expect(b.exitedAt).not.toBeNull()
    expect(a.exitedAt).toBeNull()
  })

  it('un vecino no puede registrar egresos', async () => {
    const { inv, guardia } = await escenario()
    await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })

    const res = await request(app).post('/gate/exits')
      .set('Cookie', login.headers['set-cookie'])
      .send({ invitationId: inv.id })
    expect(res.status).toBe(403)
  })

  /*
   * La carrera de verdad: dos egresos simultáneos de la misma fila.
   *
   * El servicio lee la fila abierta y después hace el UPDATE con
   * `and exited_at is null`. Entre las dos cosas otro guardia puede cerrarla.
   * Este test fuerza exactamente esa ventana: se bloquea la fila desde afuera
   * con FOR UPDATE, se lanza registerExit —que se queda esperando el lock—, se
   * cierra la fila desde el bloqueador y se libera. Postgres reevalúa el WHERE
   * al soltar el lock, encuentra exited_at ya escrito, actualiza cero filas y
   * el servicio devuelve no_esta_adentro en vez de pisar la salida ajena.
   */
  it('dos egresos simultáneos: solo uno gana', async () => {
    const { inv, guardia, otro } = await escenario()
    const entrada = await registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
    const bloqueador = await pool.connect()

    try {
      await bloqueador.query('begin')
      await bloqueador.query('select * from entry_log where id = $1 for update', [entrada.id])

      const perdedor = registerExit(inv.id, otro.id)
      const carrera = await Promise.race([
        perdedor.then(() => 'no_se_bloqueo').catch(() => 'no_se_bloqueo'),
        new Promise((r) => setTimeout(() => r('bloqueado'), 400)),
      ])
      expect(carrera).toBe('bloqueado')

      // El otro guardia cierra la fila primero.
      await bloqueador.query(
        'update entry_log set exited_at = now(), exit_guard_id = $2 where id = $1',
        [entrada.id, guardia.id],
      )
      await bloqueador.query('commit')

      await expect(perdedor).rejects.toThrow(/no_esta_adentro/)
    } finally {
      bloqueador.release()
    }

    // Y la salida que quedó es la del que ganó.
    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.id, entrada.id))
    expect(fila.exitGuardId).toBe(guardia.id)
  })
})
