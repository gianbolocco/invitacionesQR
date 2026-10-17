import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs, auditLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()
const haceH = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

async function base(rol: 'guard' | 'resident' = 'guard') {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  const [quien] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'quien@example.com', name: 'Rulo', role: rol, status: 'active',
    passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'quien@example.com', password: PASS })
  return { n, u, vecino, quien, cookie: login.headers['set-cookie'] }
}

async function inv(ctx: Awaited<ReturnType<typeof base>>, over: Record<string, unknown> = {}) {
  const [row] = await db.insert(invitations).values({
    unitId: ctx.u.id, createdBy: ctx.vecino.id, kind: 'visita', guestName: 'Visita',
    validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16), ...over,
  }).returning()
  return row
}

const cargar = (ctx: Awaited<ReturnType<typeof base>>, items: unknown[]) =>
  request(app).post('/gate/manual').set('Cookie', ctx.cookie).send({ items })

describe('carga manual de movimientos', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('carga una visita completa con la hora declarada y la marca como manual', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(5), exitedAt: haceH(3), note: 'corte de luz' }])
    expect(res.status).toBe(201)
    expect(res.body.cargados).toBe(1)

    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, i.id))
    expect(fila.source).toBe('manual')
    expect(fila.loadedBy).toBe(ctx.quien.id)
    expect(fila.guardId).toBe(ctx.quien.id)
    expect(fila.exitGuardId).toBe(ctx.quien.id)
    expect(fila.note).toBe('corte de luz')
    expect(fila.guestName).toBe('Visita')
    // La hora es la declarada, no la de ahora.
    expect(Date.now() - fila.enteredAt.getTime()).toBeGreaterThan(4.9 * 3_600_000)
  })

  it('deja la fila abierta si no tiene salida: la persona sigue adentro', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2) }])
    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, i.id))
    expect(fila.exitedAt).toBeNull()
    expect(fila.exitGuardId).toBeNull()
  })

  it('no valida cupo ni vigencia: es un registro de lo que pasó', async () => {
    const ctx = await base()
    const ayer = new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 10)
    const i = await inv(ctx, { validFrom: ayer, validTo: ayer, capacity: 1, revokedAt: new Date() })
    const res = await cargar(ctx, [
      { invitationId: i.id, enteredAt: haceH(10), exitedAt: haceH(9) },
      { invitationId: i.id, enteredAt: haceH(8), exitedAt: haceH(7) },
    ])
    expect(res.status).toBe(201)
    expect(res.body.cargados).toBe(2)
  })

  it('rechaza una hora en el futuro', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: new Date(Date.now() + 3_600_000).toISOString() }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('fecha_futura')
  })

  it('rechaza un ingreso de hace más de 48 horas', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(49) }])
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('fuera_de_ventana')
  })

  it('rechaza una salida anterior al ingreso', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2), exitedAt: haceH(3) }])
    expect(res.body.error).toBe('salida_anterior')
  })

  it('rechaza lo que se superpone con un movimiento ya registrado', async () => {
    const ctx = await base()
    const i = await inv(ctx, { capacity: 3 })
    // Entró hace 3 horas por el escáner y sigue adentro.
    await db.insert(entryLogs).values({
      invitationId: i.id, unitId: ctx.u.id, guardId: ctx.quien.id, guestName: 'Visita',
      enteredAt: new Date(haceH(3)),
    })
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2), exitedAt: haceH(1) }])
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('se_superpone')
  })

  it('rechaza dos cargas de la misma tanda que se pisan entre sí, y no guarda ninguna', async () => {
    const ctx = await base()
    const i = await inv(ctx, { capacity: 3 })
    const res = await cargar(ctx, [
      { invitationId: i.id, enteredAt: haceH(6), exitedAt: haceH(4) },
      { invitationId: i.id, enteredAt: haceH(5), exitedAt: haceH(3) },
    ])
    expect(res.status).toBe(409)
    expect(await db.select().from(entryLogs)).toHaveLength(0)
  })

  it('permite movimientos seguidos que no se pisan', async () => {
    const ctx = await base()
    const i = await inv(ctx, { capacity: 3 })
    const res = await cargar(ctx, [
      { invitationId: i.id, enteredAt: haceH(6), exitedAt: haceH(4) },
      { invitationId: i.id, enteredAt: haceH(4), exitedAt: haceH(2) },
    ])
    expect(res.status).toBe(201)
  })

  it('no carga sobre invitaciones de otro barrio', async () => {
    const ctx = await base()
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [uo] = await db.insert(units).values({ neighborhoodId: otro.id, label: 'Lote 1' }).returning()
    const [vo] = await db.insert(people).values({
      neighborhoodId: otro.id, email: 'v@otro.com', name: 'V', role: 'resident', status: 'active',
    }).returning()
    const [ajena] = await db.insert(invitations).values({
      unitId: uo.id, createdBy: vo.id, kind: 'visita', guestName: 'Ajena',
      validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
    }).returning()
    const res = await cargar(ctx, [{ invitationId: ajena.id, enteredAt: haceH(2) }])
    expect(res.status).toBe(404)
  })

  it('un vecino no puede cargar', async () => {
    const ctx = await base('resident')
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2) }])
    expect(res.status).toBe(403)
  })

  it('deja constancia en el audit_log y la auditoría lo marca como manual', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(5), exitedAt: haceH(4) }])

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'entry.manual'))
    expect(logs).toHaveLength(1)
    expect(logs[0].actorId).toBe(ctx.quien.id)

    const aud = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(aud.body.rows[0].manual).toBe(true)
    const det = await request(app).get(`/gate/audit/${i.id}/entries`).set('Cookie', ctx.cookie)
    expect(det.body[0].manual).toBe(true)
  })

  it('una tanda vacía se rechaza', async () => {
    const ctx = await base()
    expect((await cargar(ctx, [])).status).toBe(400)
  })
})
