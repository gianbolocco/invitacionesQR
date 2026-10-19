import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, invitations, entryLogs, auditLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const HORA = 3_600_000
const haceH = (h: number) => new Date(Date.now() - h * HORA)

async function escenario(umbrales: { visita?: number | null; proveedor?: number | null } = {}) {
  const [n] = await db.insert(neighborhoods).values({
    name: 'Álamo Alto',
    overstayHoursVisita: umbrales.visita ?? null,
    overstayHoursProveedor: umbrales.proveedor ?? null,
  }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'rulo@example.com', name: 'Rulo',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'rulo@example.com', password: PASS })
  const cookie = login.headers['set-cookie'] as unknown as string[]

  const hoy = todayInBuenosAires()
  const inv = async (kind: 'visita' | 'frecuente' | 'proveedor', capacity = 1) => (await db.insert(invitations).values({
    unitId: u.id, createdBy: guardia.id, kind, guestName: `Juan ${kind}`,
    validFrom: hoy, validTo: hoy, capacity, token: randomToken(16),
  }).returning())[0]
  const entro = (invitationId: string, enteredAt: Date) =>
    db.insert(entryLogs).values({ invitationId, unitId: u.id, guardId: guardia.id, enteredAt, guestName: 'Juan' })
  const adentro = async () =>
    (await request(app).get('/gate/adentro').set('Cookie', cookie).expect(200)).body as
      { id: string; alertaDesde: string | null; alertaVista: boolean }[]

  return { n, guardia, cookie, inv, entro, adentro }
}

describe('alerta de permanencia', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('alertaDesde es el ingreso abierto más viejo más el umbral del tipo', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2 })
    const i = await inv('visita', 2)
    const primero = haceH(3)
    await entro(i.id, primero)
    await entro(i.id, haceH(1))

    const [fila] = await adentro()
    expect(new Date(fila.alertaDesde!).getTime()).toBe(primero.getTime() + 2 * HORA)
    expect(fila.alertaVista).toBe(false)
  })

  it('usa el umbral de proveedor para un proveedor', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2, proveedor: 5 })
    const i = await inv('proveedor')
    const desde = haceH(1)
    await entro(i.id, desde)
    const [fila] = await adentro()
    expect(new Date(fila.alertaDesde!).getTime()).toBe(desde.getTime() + 5 * HORA)
  })

  it('sin umbral o frecuente, alertaDesde es null', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2 })
    await entro((await inv('proveedor')).id, haceH(5))
    await entro((await inv('frecuente')).id, haceH(5))
    const filas = await adentro()
    expect(filas).toHaveLength(2)
    expect(filas.every((f) => f.alertaDesde === null)).toBe(true)
  })

  it('ya lo vi marca los ingresos abiertos y queda en la auditoría', async () => {
    const { inv, entro, adentro, cookie, guardia } = await escenario({ visita: 1 })
    const i = await inv('visita')
    await entro(i.id, haceH(3))

    await request(app).post(`/gate/invitations/${i.id}/alerta-vista`).set('Cookie', cookie).expect(200)

    expect((await adentro())[0].alertaVista).toBe(true)
    const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.invitationId, i.id))
    expect(fila.overstaySeenBy).toBe(guardia.id)
    expect(fila.overstaySeenAt).not.toBeNull()
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'entry.overstay_seen'))
    expect(log.entityId).toBe(i.id)
    expect(log.actorId).toBe(guardia.id)
  })

  it('un reingreso vuelve a alertar', async () => {
    const { inv, entro, adentro, cookie } = await escenario({ visita: 1 })
    const i = await inv('visita', 2)
    await entro(i.id, haceH(3))
    await request(app).post(`/gate/invitations/${i.id}/alerta-vista`).set('Cookie', cookie).expect(200)

    await request(app).post('/gate/exits').set('Cookie', cookie).send({ invitationId: i.id }).expect(201)
    await entro(i.id, haceH(2))

    expect((await adentro())[0].alertaVista).toBe(false)
  })

  it('ya lo vi sin nadie adentro da 409 no_esta_adentro', async () => {
    const { inv, cookie } = await escenario({ visita: 1 })
    const i = await inv('visita')
    const res = await request(app).post(`/gate/invitations/${i.id}/alerta-vista`).set('Cookie', cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_esta_adentro')
  })

  it('ya lo vi sobre una invitación de otro barrio da 403', async () => {
    const { cookie } = await escenario({ visita: 1 })
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [u] = await db.insert(units).values({ neighborhoodId: otro.id, label: 'Lote 1' }).returning()
    const [p] = await db.insert(people).values({
      neighborhoodId: otro.id, email: 'x@example.com', name: 'X', role: 'resident', status: 'active',
    }).returning()
    const hoy = todayInBuenosAires()
    const [i] = await db.insert(invitations).values({
      unitId: u.id, createdBy: p.id, kind: 'visita', guestName: 'Ajeno',
      validFrom: hoy, validTo: hoy, token: randomToken(16),
    }).returning()
    await request(app).post(`/gate/invitations/${i.id}/alerta-vista`).set('Cookie', cookie).expect(403)
  })
})
