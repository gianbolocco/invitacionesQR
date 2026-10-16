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

async function login(email: string) {
  const r = await request(app).post('/auth/login').send({ email, password: PASS })
  return r.headers['set-cookie']
}

async function base() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const hash = await hashPassword(PASS)
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín', role: 'resident', status: 'active', passwordHash: hash,
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Rulo', role: 'guard', status: 'active', passwordHash: hash,
  }).returning()
  const [inv] = await db.insert(invitations).values({
    unitId: u.id, createdBy: vecino.id, kind: 'visita', guestName: 'Visita',
    validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16),
  }).returning()
  return { n, u, vecino, guardia, inv, cg: await login('garita@example.com'), cv: await login('martin@example.com') }
}

const anular = (ctx: Awaited<ReturnType<typeof base>>, reason: unknown, id = ctx.inv.id) =>
  request(app).post(`/gate/invitations/${id}/revoke`).set('Cookie', ctx.cg).send({ reason })

describe('anulación de invitaciones por la guardia', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('anula con motivo y deja constancia en la invitación y en el audit_log', async () => {
    const ctx = await base()
    const res = await anular(ctx, '  El vecino llamó para cancelar  ')
    expect(res.status).toBe(200)

    const [fila] = await db.select().from(invitations).where(eq(invitations.id, ctx.inv.id))
    expect(fila.revokedAt).not.toBeNull()
    expect(fila.revokedReason).toBe('El vecino llamó para cancelar')

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'invitation.revoked_by_guard'))
    expect(log.actorId).toBe(ctx.guardia.id)
    expect(log.entityId).toBe(ctx.inv.id)
    expect(log.meta).toEqual({ reason: 'El vecino llamó para cancelar' })
  })

  it('el motivo es opcional: sin motivo igual anula y queda marcada como de la portería', async () => {
    for (const reason of [undefined, '', '   ']) {
      await resetDb(); resetRateLimits()
      const ctx = await base()
      const res = await anular(ctx, reason)
      expect(res.status).toBe(200)
      const [fila] = await db.select().from(invitations).where(eq(invitations.id, ctx.inv.id))
      expect(fila.revokedAt).not.toBeNull()
      // '' y no null: null querría decir que no la anuló la portería.
      expect(fila.revokedReason).toBe('')
      const det = await request(app).get(`/invitations/${ctx.inv.id}`).set('Cookie', ctx.cv)
      expect(det.body.revokedReason).toBe('')
    }
  })

  it('no anula con el invitado adentro, igual que cuando anula el vecino', async () => {
    const ctx = await base()
    await db.insert(entryLogs).values({
      invitationId: ctx.inv.id, unitId: ctx.u.id, guardId: ctx.guardia.id, guestName: 'Visita',
    })
    const res = await anular(ctx, 'Motivo de prueba')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('guest_inside')
  })

  it('no anula dos veces', async () => {
    const ctx = await base()
    await anular(ctx, 'Primer motivo')
    const res = await anular(ctx, 'Segundo motivo')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('already_revoked')
  })

  it('no anula invitaciones de otro barrio', async () => {
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
    const res = await anular(ctx, 'Motivo de prueba', ajena.id)
    expect(res.status).toBe(403)
  })

  it('un vecino no puede usar la ruta de la guardia', async () => {
    const ctx = await base()
    const res = await request(app).post(`/gate/invitations/${ctx.inv.id}/revoke`).set('Cookie', ctx.cv)
      .send({ reason: 'Motivo de prueba' })
    expect(res.status).toBe(403)
  })

  it('el vecino ve el motivo en su invitación', async () => {
    const ctx = await base()
    await anular(ctx, 'Se sospecha de un QR compartido')
    const res = await request(app).get('/invitations').set('Cookie', ctx.cv)
    // Las anuladas no están en la home: se ven en el detalle.
    expect(res.body).toHaveLength(0)
    const det = await request(app).get(`/invitations/${ctx.inv.id}`).set('Cookie', ctx.cv)
    expect(det.body.revokedAt).not.toBeNull()
    expect(det.body.revokedReason).toBe('Se sospecha de un QR compartido')
  })

  it('la guardia no puede deshacer la anulación, pero el vecino sí, y el motivo se borra', async () => {
    const ctx = await base()
    await anular(ctx, 'Motivo de prueba')

    const g = await request(app).post(`/invitations/${ctx.inv.id}/restore`).set('Cookie', ctx.cg)
    expect(g.status).toBe(403)
    const [sigue] = await db.select().from(invitations).where(eq(invitations.id, ctx.inv.id))
    expect(sigue.revokedAt).not.toBeNull()

    const v = await request(app).post(`/invitations/${ctx.inv.id}/restore`).set('Cookie', ctx.cv)
    expect(v.status).toBe(200)
    const [vuelve] = await db.select().from(invitations).where(eq(invitations.id, ctx.inv.id))
    expect(vuelve.revokedAt).toBeNull()
    expect(vuelve.revokedReason).toBeNull()
  })

  it('cuando anula el vecino no hay motivo', async () => {
    const ctx = await base()
    await request(app).post(`/invitations/${ctx.inv.id}/revoke`).set('Cookie', ctx.cv)
    const [fila] = await db.select().from(invitations).where(eq(invitations.id, ctx.inv.id))
    expect(fila.revokedAt).not.toBeNull()
    expect(fila.revokedReason).toBeNull()
  })

  it('la auditoría muestra el motivo de la anulada', async () => {
    const ctx = await base()
    await anular(ctx, 'El vecino llamó para cancelar')
    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cg)
    expect(res.body.rows[0].status).toBe('anulada')
    expect(res.body.rows[0].revokedReason).toBe('El vecino llamó para cancelar')
  })

  it('una anulada no pasa por la barrera', async () => {
    const ctx = await base()
    await anular(ctx, 'Motivo de prueba')
    const res = await request(app).get(`/gate/invitation/${ctx.inv.id}`).set('Cookie', ctx.cg)
    expect(res.body.check).toEqual({ ok: false, reason: 'revoked' })
  })
})
