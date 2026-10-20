import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, invitations, entryLogs } from '../src/db/schema.js'
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
  const inv = async (kind: 'visita' | 'frecuente' | 'proveedor', capacity = 1, frequentAs?: 'visita' | 'proveedor') => (await db.insert(invitations).values({
    unitId: u.id, createdBy: guardia.id, kind, frequentAs, guestName: `Juan ${kind}`,
    validFrom: hoy, validTo: hoy, capacity, token: randomToken(16),
  }).returning())[0]
  const entro = (invitationId: string, enteredAt: Date) =>
    db.insert(entryLogs).values({ invitationId, unitId: u.id, guardId: guardia.id, enteredAt, guestName: 'Juan' })
  const adentro = async () =>
    (await request(app).get('/gate/adentro').set('Cookie', cookie).expect(200)).body as
      { id: string; alertaDesde: string | null }[]

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
  })

  it('usa el umbral de proveedor para un proveedor', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2, proveedor: 5 })
    const i = await inv('proveedor')
    const desde = haceH(1)
    await entro(i.id, desde)
    const [fila] = await adentro()
    expect(new Date(fila.alertaDesde!).getTime()).toBe(desde.getTime() + 5 * HORA)
  })

  it('sin umbral para su tipo, alertaDesde es null', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2 })
    await entro((await inv('proveedor')).id, haceH(5))
    await entro((await inv('frecuente', 999, 'proveedor')).id, haceH(5))
    const filas = await adentro()
    expect(filas).toHaveLength(2)
    expect(filas.every((f) => f.alertaDesde === null)).toBe(true)
  })

  it('una frecuente usa el umbral de lo que es; sin subtipo, el de visita', async () => {
    const { inv, entro, adentro } = await escenario({ visita: 2, proveedor: 5 })
    const prov = await inv('frecuente', 999, 'proveedor')
    const sinSubtipo = await inv('frecuente', 999)
    const desde = haceH(1)
    await entro(prov.id, desde)
    await entro(sinSubtipo.id, desde)
    const filas = await adentro()
    const de = (id: string) => new Date(filas.find((f) => f.id === id)!.alertaDesde!).getTime()
    expect(de(prov.id)).toBe(desde.getTime() + 5 * HORA)
    expect(de(sinSubtipo.id)).toBe(desde.getTime() + 2 * HORA)
  })

  it('la base rechaza un subtipo en una invitación que no es frecuente', async () => {
    const { inv } = await escenario()
    await expect(inv('visita', 1, 'proveedor')).rejects.toThrow()
  })




})
