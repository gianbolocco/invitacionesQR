import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations, entryLogs, auditLogs } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry } from '../src/services/entries.js'
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

const cargar = (ctx: Awaited<ReturnType<typeof base>>, items: Record<string, unknown>[]) =>
  request(app).post('/gate/manual').set('Cookie', ctx.cookie)
    .send({ items: items.map((i) => ({ guestDoc: '30123456', ...i })) })

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

  it('carga a alguien sin invitación: crea la invitación de portería del día del ingreso', async () => {
    const ctx = await base()
    const res = await cargar(ctx, [{ guest: { name: 'Juan Pérez', unitId: ctx.u.id }, enteredAt: haceH(30) }])
    expect(res.status).toBe(201)
    const [i] = await db.select().from(invitations)
    const dia = todayInBuenosAires(new Date(haceH(30)))
    expect(i.createdBy).toBe(ctx.quien.id)
    expect(i.capacity).toBe(1)
    expect(i.kind).toBe('visita')
    expect(i.validFrom).toBe(dia)
    expect(i.validTo).toBe(dia)
    expect(i.guestName).toBe('Juan Pérez')
    const [f] = await db.select().from(entryLogs)
    expect(f.invitationId).toBe(i.id)
  })

  it('guarda la patente cargada, en mayúsculas, en el movimiento y en la invitación de portería', async () => {
    const ctx = await base()
    await cargar(ctx, [{ guest: { name: 'Juan Pérez', unitId: ctx.u.id }, plate: ' ab 123 cd ', enteredAt: haceH(2) }])
    const [i] = await db.select().from(invitations)
    const [f] = await db.select().from(entryLogs)
    expect(i.plate).toBe('AB 123 CD')
    expect(f.plate).toBe('AB 123 CD')
  })

  it('sin patente cargada, el movimiento usa la de la invitación', async () => {
    const ctx = await base()
    const i = await inv(ctx, { plate: 'AA111BB' })
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2) }])
    const [f] = await db.select().from(entryLogs)
    expect(f.plate).toBe('AA111BB')
  })

  it('la patente cargada pisa la de la invitación solo en el movimiento', async () => {
    const ctx = await base()
    const i = await inv(ctx, { plate: 'AA111BB' })
    await cargar(ctx, [{ invitationId: i.id, plate: 'cc222dd', enteredAt: haceH(2) }])
    const [f] = await db.select().from(entryLogs)
    const [ii] = await db.select().from(invitations)
    expect(f.plate).toBe('CC222DD')
    expect(ii.plate).toBe('AA111BB')
  })

  it('rechaza una unidad de otro barrio para alguien sin invitación', async () => {
    const ctx = await base()
    const [otro] = await db.insert(neighborhoods).values({ name: 'Otro' }).returning()
    const [uo] = await db.insert(units).values({ neighborhoodId: otro.id, label: 'Lote 1' }).returning()
    const res = await cargar(ctx, [{ guest: { name: 'Juan', unitId: uo.id }, enteredAt: haceH(2) }])
    expect(res.status).toBe(403)
  })

  it('rechaza un ítem sin DNI', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    const res = await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2), guestDoc: '' }])
    expect(res.status).toBe(400)
  })

  it('completa el DNI de la invitación que no lo tenía', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestDoc: null })
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(2), guestDoc: '28999111' }])
    const [after] = await db.select().from(invitations).where(eq(invitations.id, i.id))
    const [f] = await db.select().from(entryLogs)
    expect(after.guestDoc).toBe('28999111')
    expect(f.guestDoc).toBe('28999111')
  })

  it('si falla una fila no queda nada, tampoco la invitación de portería', async () => {
    const ctx = await base()
    const res = await cargar(ctx, [
      { guest: { name: 'Juan', unitId: ctx.u.id }, enteredAt: haceH(5) },
      { invitationId: '00000000-0000-4000-8000-000000000000', enteredAt: haceH(2) },
    ])
    expect(res.status).toBe(404)
    expect(res.body.fila).toBe(1)
    expect(await db.select().from(invitations)).toHaveLength(0)
    expect(await db.select().from(entryLogs)).toHaveLength(0)
  })

  it('marca loaded_at en la carga manual', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(5) }])
    const [f] = await db.select().from(entryLogs)
    expect(Math.abs(Date.now() - f.loadedAt!.getTime())).toBeLessThan(10_000)
  })

  it('el detalle de movimientos trae la nota, quién cargó y cuándo', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(5), note: 'corte de luz' }])
    const res = await request(app).get(`/gate/audit/${i.id}/entries`).set('Cookie', ctx.cookie)
    expect(res.status).toBe(200)
    expect(res.body[0].note).toBe('corte de luz')
    expect(res.body[0].loaderName).toBe('Rulo')
    expect(res.body[0].loadedAt).not.toBeNull()
  })

  it('el excel marca el origen', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await cargar(ctx, [{ invitationId: i.id, enteredAt: haceH(5), note: 'corte de luz' }])
    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)
    const celda = (hoja: string, titulo: string) => {
      const ws = wb.getWorksheet(hoja)!
      const col = (ws.getRow(1).values as unknown[]).map(String).indexOf(titulo)
      expect(col, `${hoja}/${titulo}`).toBeGreaterThan(0)
      return ws.getRow(2).getCell(col).value
    }
    expect(celda('Ingresos', 'Origen')).toBe('Carga manual')
    expect(celda('Ingresos', 'Cargado el')).toBeTruthy()
    expect(celda('Ingresos', 'Nota')).toBe('corte de luz')
    expect(celda('Ingresos', 'Guardia ingreso')).toBe('Carga manual · Rulo')
    expect(celda('Invitaciones', 'Carga manual')).toBe('Sí')
    // Sin salida cargada no hay guardia de salida: no queda el prefijo colgando.
    expect(celda('Ingresos', 'Guardia salida')).toBe('')
  })

  it('el excel marca como escaneo lo que no es carga manual', async () => {
    const ctx = await base()
    const i = await inv(ctx)
    await registerEntry(i.id, ctx.quien.id, { guestName: 'Visita' })
    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)
    const celda = (hoja: string, titulo: string) => {
      const ws = wb.getWorksheet(hoja)!
      const col = (ws.getRow(1).values as unknown[]).map(String).indexOf(titulo)
      expect(col, `${hoja}/${titulo}`).toBeGreaterThan(0)
      return ws.getRow(2).getCell(col).value
    }
    expect(celda('Ingresos', 'Origen')).toBe('Escaneo')
    expect(celda('Ingresos', 'Guardia ingreso')).toBe('Rulo')
    expect(celda('Invitaciones', 'Carga manual')).toBe('No')
  })

  it('una tanda vacía se rechaza', async () => {
    const ctx = await base()
    expect((await cargar(ctx, [])).status).toBe(400)
  })
})
