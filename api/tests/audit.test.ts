import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers, invitations } from '../src/db/schema.js'
import { hashPassword, randomToken } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { registerEntry, registerExit } from '../src/services/entries.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const hoy = todayInBuenosAires()

async function base() {
  const [n] = await db.insert(neighborhoods).values({ name: 'Álamo Alto' }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 142' }).returning()
  const [vecino] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'martin@example.com', name: 'Martín',
    role: 'resident', status: 'active',
  }).returning()
  await db.insert(unitMembers).values({ unitId: u.id, personId: vecino.id })
  const [guardia] = await db.insert(people).values({
    neighborhoodId: n.id, email: 'garita@example.com', name: 'Rulo',
    role: 'guard', status: 'active', passwordHash: await hashPassword(PASS),
  }).returning()
  const login = await request(app).post('/auth/login').send({ email: 'garita@example.com', password: PASS })
  return { cookie: login.headers['set-cookie'], unitId: u.id, vecinoId: vecino.id, guardiaId: guardia.id }
}

async function inv(ctx: Awaited<ReturnType<typeof base>>, over: Record<string, unknown> = {}) {
  const [row] = await db.insert(invitations).values({
    unitId: ctx.unitId, createdBy: ctx.vecinoId, kind: 'visita', guestName: 'Alguien',
    validFrom: hoy, validTo: hoy, capacity: 1, token: randomToken(16), ...over,
  }).returning()
  return row
}

describe('auditoría de invitaciones', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('muestra la que entró y la que NO entró', async () => {
    const ctx = await base()
    const entro = await inv(ctx, { guestName: 'Sí vino' })
    await inv(ctx, { guestName: 'No vino' })
    await registerEntry(entro.id, ctx.guardiaId, { guestName: 'Sí vino' })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const porNombre = Object.fromEntries(
      res.body.rows.map((r: { guestName: string; status: string }) => [r.guestName, r.status]),
    )
    expect(porNombre['Sí vino']).toBe('entro')
    expect(porNombre['No vino']).toBe('esperando')
  })

  it('registra la hora del escaneo y qué guardia lo hizo', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Juan' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Juan' })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const fila = res.body.rows.find((r: { guestName: string }) => r.guestName === 'Juan')
    expect(fila.enteredAt).not.toBeNull()
    expect(fila.guardName).toBe('Rulo')
    expect(fila.enteredCount).toBe(1)
  })

  it('una de ayer sin ingresos queda como vencida, no como esperando', async () => {
    const ctx = await base()
    const ayer = new Date(`${hoy}T12:00:00Z`)
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    const iso = ayer.toISOString().slice(0, 10)
    await inv(ctx, { guestName: 'Nunca vino', validFrom: iso, validTo: iso })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(res.body.rows[0].status).toBe('vencida')
  })

  it('la anulada se distingue de la que no vino', async () => {
    const ctx = await base()
    await inv(ctx, { guestName: 'Anulada', revokedAt: new Date() })
    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(res.body.rows[0].status).toBe('anulada')
  })


  it('exporta un .xlsx de verdad, con las hojas Invitaciones e Ingresos', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Martín Pérez' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Martín Pérez' })

    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)

    // Un .xlsx es un zip: tiene que empezar con "PK", no con texto.
    const buf = res.body as Buffer
    expect(buf.subarray(0, 2).toString()).toBe('PK')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Invitaciones', 'Ingresos'])

    const inv1 = wb.getWorksheet('Invitaciones')!
    const encabezados = (inv1.getRow(1).values as unknown[]).map(String)
    const columna = (titulo: string) => encabezados.indexOf(titulo)

    expect(inv1.getRow(1).getCell(1).value).toBe('Invitado')
    expect(inv1.getRow(2).getCell(1).value).toBe('Martín Pérez')
    expect(inv1.getRow(2).getCell(columna('Estado')).value).toBe('Entró')

    // Por encabezado, igual que la hoja de arriba: los índices fijos se
    // rompen cada vez que se agrega una columna, y no es lo que se quiere
    // afirmar acá.
    const ing = wb.getWorksheet('Ingresos')!
    const cabecerasIng = (ing.getRow(1).values as unknown[]).map(String)
    const colIng = (t: string) => cabecerasIng.indexOf(t)
    expect(ing.getRow(2).getCell(colIng('Invitado')).value).toBe('Martín Pérez')
    expect(ing.getRow(2).getCell(colIng('Guardia')).value).toBe('Rulo')
  })

  it('el export trae todo, no solo la página que se está viendo', async () => {
    const ctx = await base()
    for (let n = 0; n < 7; n++) await inv(ctx, { guestName: `Invitado ${n}` })

    const pagina = await request(app).get('/gate/audit?pageSize=3').set('Cookie', ctx.cookie)
    expect(pagina.body.rows).toHaveLength(3)
    expect(pagina.body.total).toBe(7)

    const res = await request(app).get('/gate/audit.xlsx?pageSize=3').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)
    // 7 filas + encabezado
    expect(wb.getWorksheet('Invitaciones')!.rowCount).toBe(8)
  })

  it('pagina y cuenta por estado del lado del servidor', async () => {
    const ctx = await base()
    const entro = await inv(ctx, { guestName: 'Vino' })
    await registerEntry(entro.id, ctx.guardiaId, { guestName: 'Vino' })
    await inv(ctx, { guestName: 'No vino 1' })
    await inv(ctx, { guestName: 'No vino 2' })
    await inv(ctx, { guestName: 'Anulada', revokedAt: new Date() })

    const todo = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    expect(todo.body.total).toBe(4)
    expect(todo.body.counts).toMatchObject({ entro: 1, esperando: 2, anulada: 1 })

    // Filtrar por estado cambia el total, no solo lo que se ve.
    const soloEsperando = await request(app).get('/gate/audit?status=esperando').set('Cookie', ctx.cookie)
    expect(soloEsperando.body.total).toBe(2)
    expect(soloEsperando.body.rows).toHaveLength(2)

    const p1 = await request(app).get('/gate/audit?pageSize=2&page=1').set('Cookie', ctx.cookie)
    const p2 = await request(app).get('/gate/audit?pageSize=2&page=2').set('Cookie', ctx.cookie)
    expect(p1.body.rows).toHaveLength(2)
    expect(p2.body.rows).toHaveLength(2)
    const ids = [...p1.body.rows, ...p2.body.rows].map((r: { id: string }) => r.id)
    expect(new Set(ids).size).toBe(4)   // sin repetidos entre páginas
  })

  it('un vecino no puede auditar', async () => {
    const ctx = await base()
    await db.update(people).set({ passwordHash: await hashPassword(PASS) })
      .where(eq(people.email, 'martin@example.com'))
    const login = await request(app).post('/auth/login')
      .send({ email: 'martin@example.com', password: PASS })
    const res = await request(app).get('/gate/audit').set('Cookie', login.headers['set-cookie'])
    expect(res.status).toBe(403)
  })
})

describe('detalle de ingresos de una invitación', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('devuelve los movimientos que la auditoría resume como ×N', async () => {
    const ctx = await base()
    const frec = await inv(ctx, { guestName: 'Mucama', kind: 'frecuente', capacity: 10 })
    await registerEntry(frec.id, ctx.guardiaId, { guestName: 'Mucama' })
    await registerEntry(frec.id, ctx.guardiaId, { guestName: 'Mucama' })
    await registerEntry(frec.id, ctx.guardiaId, { guestName: 'Mucama' })

    const audit = await request(app).get('/gate/audit').set('Cookie', ctx.cookie)
    const fila = audit.body.rows.find((r: { guestName: string }) => r.guestName === 'Mucama')
    expect(fila.enteredCount).toBe(3)

    const detalle = await request(app).get(`/gate/audit/${frec.id}/entries`).set('Cookie', ctx.cookie)
    expect(detalle.body).toHaveLength(3)
    expect(detalle.body.every((e: { guestName: string }) => e.guestName === 'Mucama')).toBe(true)
    expect(detalle.body[0].guardName).toBe('Rulo')
    expect(detalle.body[0].enteredAt).toBeTruthy()
  })

  it('una invitación sin ingresos devuelve lista vacía', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'No vino' })
    const res = await request(app).get(`/gate/audit/${i.id}/entries`).set('Cookie', ctx.cookie)
    expect(res.body).toEqual([])
  })
})

describe('la auditoría muestra la salida', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('la fila trae la hora de salida y el guardia que la registró', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Martín Pérez' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Martín Pérez' })
    await registerExit(i.id, ctx.guardiaId)

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie).expect(200)
    const fila = res.body.rows.find((r: { id: string }) => r.id === i.id)
    expect(fila.exitedAt).not.toBeNull()
    expect(fila.exitGuardName).toBe('Rulo')
  })

  it('sin salida registrada, los dos campos vienen en null', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Sigue adentro' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Sigue adentro' })

    const res = await request(app).get('/gate/audit').set('Cookie', ctx.cookie).expect(200)
    const fila = res.body.rows.find((r: { id: string }) => r.id === i.id)
    expect(fila.exitedAt).toBeNull()
    expect(fila.exitGuardName).toBeNull()
  })

  it('el Excel trae las columnas de salida en las dos hojas', async () => {
    const ctx = await base()
    const i = await inv(ctx, { guestName: 'Martín Pérez' })
    await registerEntry(i.id, ctx.guardiaId, { guestName: 'Martín Pérez' })
    await registerExit(i.id, ctx.guardiaId)

    const res = await request(app).get('/gate/audit.xlsx').set('Cookie', ctx.cookie)
      .buffer(true).parse((r, cb) => {
        const trozos: Buffer[] = []
        r.on('data', (d: Buffer) => trozos.push(d))
        r.on('end', () => cb(null, Buffer.concat(trozos)))
      })
      .expect(200)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as Buffer)

    // Por encabezado y no por índice: agregar una columna no rompe el test.
    const hoja = (nombre: string) => {
      const w = wb.getWorksheet(nombre)!
      const encabezados = (w.getRow(1).values as unknown[]).map(String)
      return { w, columna: (t: string) => encabezados.indexOf(t) }
    }

    const invs = hoja('Invitaciones')
    expect(invs.columna('Salida')).toBeGreaterThan(0)
    expect(invs.columna('Guardia salida')).toBeGreaterThan(0)
    expect(invs.w.getRow(2).getCell(invs.columna('Guardia salida')).value).toBe('Rulo')

    const ing = hoja('Ingresos')
    expect(ing.columna('Salida')).toBeGreaterThan(0)
    expect(String(ing.w.getRow(2).getCell(ing.columna('Salida')).value)).not.toBe('')
  })
})
