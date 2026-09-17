import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db, pool } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry, checkByToken } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function scenario(capacity = 1) {
  const [n] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })

  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Garita',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()

  const [inv] = await db.insert(invitations).values({
    unitId: u.id, createdBy: vecino.id, kind: capacity > 1 ? 'frecuente' : 'visita',
    guestName: 'Juan Pérez', validFrom: hoy, validTo: hoy, capacity, token: randomToken(16),
  }).returning()

  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], inv, guardia, unit: u }
}

describe('garita', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('autoriza un QR vigente', async () => {
    const { cookie, inv } = await scenario()
    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.check).toEqual({ ok: true })
    expect(res.body.invitation.guestName).toBe('Juan Pérez')
    expect(res.body.invitation.unitLabel).toBe('Lote 142')
  })

  it('un vecino logueado no puede usar la pantalla de garita', async () => {
    const { inv } = await scenario()
    // Le damos contraseña a Martín para que SÍ pueda loguear: así el 403 que
    // esperamos viene del rol y no de un login fallido.
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login').send({ email: 'martin@example.com', password: PASS })
    expect(login.status).toBe(200)

    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })

  it('registra el ingreso y deja la invitación sin cupo', async () => {
    const { cookie, inv, guardia } = await scenario()
    const post = await request(app).post('/gate/entries').set('Cookie', cookie).send({
      invitationId: inv.id, guardId: guardia.id, guestName: 'Juan Pérez', guestDoc: '30123456',
    })
    expect(post.status).toBe(201)

    const res = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', cookie)
    expect(res.body.check).toEqual({ ok: false, reason: 'no_capacity' })
    expect(res.body.lastEntryAt).not.toBeNull()
  })

  it('varios registros simultáneos no se pasan del cupo', async () => {
    const { inv, guardia } = await scenario(1)
    const data = { guestName: 'Juan Pérez' }
    const resultados = await Promise.allSettled([
      registerEntry(inv.id, guardia.id, data),
      registerEntry(inv.id, guardia.id, data),
      registerEntry(inv.id, guardia.id, data),
    ])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const filas = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, inv.id))
    expect(filas).toHaveLength(1)
  })

  /**
   * El test de arriba NO prueba el lock: en la práctica las transacciones no
   * llegan a solaparse y pasa igual sin `FOR UPDATE`.
   *
   * Este sí lo prueba: tomamos un lock de la fila desde AFUERA y verificamos
   * que `registerEntry` se queda esperando.
   *
   * El lock externo es FOR KEY SHARE, no FOR UPDATE, y la elección importa.
   * El INSERT en entry_log ya toma un FOR KEY SHARE sobre la invitación por la
   * foreign key, así que un bloqueador FOR UPDATE frenaría a registerEntry
   * aunque el servicio no pidiera ningún lock: el test pasaría siempre.
   * FOR KEY SHARE, en cambio, choca con FOR UPDATE pero convive con el lock de
   * la FK — o sea que solo bloquea si el servicio pide FOR UPDATE de verdad.
   */
  it('registerEntry toma el lock de la invitación', async () => {
    const { inv, guardia } = await scenario(1)
    const bloqueador = await pool.connect()

    try {
      await bloqueador.query('begin')
      await bloqueador.query('select * from invitation where id = $1 for key share', [inv.id])

      const registro = registerEntry(inv.id, guardia.id, { guestName: 'Juan Pérez' })
      const carrera = await Promise.race([
        registro.then(() => 'no_se_bloqueo').catch(() => 'no_se_bloqueo'),
        new Promise((r) => setTimeout(() => r('bloqueado'), 400)),
      ])
      expect(carrera).toBe('bloqueado')

      // Al soltar el lock, el registro avanza y termina bien.
      await bloqueador.query('rollback')
      const entry = await registro
      expect(entry.guestName).toBe('Juan Pérez')
    } finally {
      bloqueador.release()
    }
  })

  it('una invitación de cupo 2 deja entrar a dos y rechaza al tercero', async () => {
    const { inv, guardia } = await scenario(2)
    await registerEntry(inv.id, guardia.id, { guestName: 'Uno' })
    await registerEntry(inv.id, guardia.id, { guestName: 'Dos' })
    await expect(registerEntry(inv.id, guardia.id, { guestName: 'Tres' })).rejects.toThrow()
  })

  it('no registra el ingreso de una invitación revocada', async () => {
    const { inv, guardia } = await scenario()
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id))
    await expect(registerEntry(inv.id, guardia.id, { guestName: 'Juan' })).rejects.toThrow(/revoked/)
  })

  it('la búsqueda manual encuentra por apellido y por UF', async () => {
    const { cookie } = await scenario()
    const porNombre = await request(app).get('/gate/search?q=Pérez').set('Cookie', cookie)
    expect(porNombre.body).toHaveLength(1)

    const porUnidad = await request(app).get('/gate/search?q=142').set('Cookie', cookie)
    expect(porUnidad.body).toHaveLength(1)
  })

  it('encuentra "Perez" sin tilde: en la barrera nadie escribe acentos', async () => {
    const { cookie } = await scenario()
    const res = await request(app).get('/gate/search?q=perez').set('Cookie', cookie)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].guestName).toBe('Juan Pérez')
  })

  it('la búsqueda y el QR caen en el mismo resultado', async () => {
    const { cookie, inv } = await scenario()
    const hit = await request(app).get('/gate/search?q=Pérez').set('Cookie', cookie)
    const porId = await request(app).get(`/gate/invitation/${hit.body[0].id}`).set('Cookie', cookie)
    const porToken = await request(app).get(`/gate/check/${inv.token}`).set('Cookie', cookie)
    expect(porId.body.invitation).toEqual(porToken.body.invitation)
  })
})

describe('quién dio el ingreso', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('queda registrado el guardia logueado, no lo que mande el cliente', async () => {
    const { cookie, inv, guardia } = await scenario()

    // El body trae un guardId falso a propósito: tiene que ignorarse.
    await request(app).post('/gate/entries').set('Cookie', cookie).send({
      invitationId: inv.id,
      guardId: '00000000-0000-0000-0000-000000000000',
      guestName: 'Juan Pérez',
    }).expect(201)

    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, inv.id))
    expect(fila.guardId).toBe(guardia.id)
  })

  it('la auditoría muestra el nombre de ese guardia', async () => {
    const { cookie, inv } = await scenario()
    await request(app).post('/gate/entries').set('Cookie', cookie)
      .send({ invitationId: inv.id, guestName: 'Juan Pérez' }).expect(201)

    const res = await request(app).get('/gate/audit').set('Cookie', cookie)
    const fila = res.body.rows.find((r: { guestName: string }) => r.guestName === 'Juan Pérez')
    expect(fila.guardName).toBe('Garita')
    expect(fila.status).toBe('entro')
  })
})
