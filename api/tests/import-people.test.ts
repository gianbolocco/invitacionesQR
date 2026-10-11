import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'

vi.mock('../src/lib/mail.js', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const { buildApp } = await import('../src/app.js')
const { db } = await import('../src/db/index.js')
const { neighborhoods, people } = await import('../src/db/schema.js')
const { hashPassword } = await import('../src/lib/crypto.js')
const { unitsOfPerson } = await import('../src/services/units.js')
const { resetDb } = await import('./helpers/db.js')
const { resetRateLimits } = await import('../src/middleware/rateLimit.js')

const app = buildApp()
const PASS = 'una-contrasena-larga'

async function adminCookie() {
  const [neighborhood] = await db.insert(neighborhoods).values({ name: 'Los Robles' }).returning()
  await db.insert(people).values({
    neighborhoodId: neighborhood.id,
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    status: 'active',
    passwordHash: await hashPassword(PASS),
  })
  const response = await request(app).post('/auth/login')
    .send({ email: 'admin@example.com', password: PASS })
  return response.headers['set-cookie']
}

describe('importar vecinos desde CSV', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('previsualiza CSV con BOM, punto y coma, acentos y lote opcional', async () => {
    const cookie = await adminCookie()
    const csv = '\uFEFFnombre;email;lote\r\n"Ana Pérez";ANA@example.com;142\r\n"Beto, Jr";beto@example.com;\r\nSin mail;;'

    const response = await request(app).post('/admin/people/import/preview')
      .set('Cookie', cookie)
      .set('Content-Type', 'text/csv')
      .send(csv)

    expect(response.status).toBe(200)
    expect(response.body.summary).toEqual({ total: 3, ready: 2, duplicates: 0, invalid: 1 })
    expect(response.body.rows[0]).toMatchObject({ line: 2, name: 'Ana Pérez', email: 'ana@example.com', lot: 142, status: 'ready' })
    expect(response.body.rows[1]).toMatchObject({ line: 3, name: 'Beto, Jr', lot: null, status: 'ready' })
    expect(response.body.rows[2].status).toBe('invalid')
  })

  it('omite correos ya cargados y marca repetidos dentro del archivo', async () => {
    const cookie = await adminCookie()
    const [neighborhood] = await db.select().from(neighborhoods).limit(1)
    await db.insert(people).values({
      neighborhoodId: neighborhood.id,
      email: 'ya@example.com',
      name: 'Ya existe',
      role: 'resident',
      status: 'invited',
    })
    const csv = [
      'nombre,email,lote',
      'Vecino,ya@example.com,',
      'Ana,ana@example.com,12',
      'Otra Ana,ANA@example.com,13',
    ].join('\n')

    const response = await request(app).post('/admin/people/import/preview')
      .set('Cookie', cookie)
      .set('Content-Type', 'text/csv')
      .send(csv)

    expect(response.body.summary).toEqual({ total: 3, ready: 1, duplicates: 2, invalid: 0 })
    expect(response.body.rows.map((row: { status: string }) => row.status))
      .toEqual(['existing', 'ready', 'duplicate_file'])
  })

  it('crea altas en tandas, asigna los lotes y devuelve el estado de cada mail', async () => {
    const cookie = await adminCookie()
    const response = await request(app).post('/admin/people/import').set('Cookie', cookie).send({
      rows: [
        { line: 2, name: 'Ana', email: 'ana@example.com', lot: 142 },
        { line: 3, name: 'Beto', email: 'beto@example.com', lot: null },
      ],
    })

    expect(response.status).toBe(200)
    expect(response.body.results.map((row: { status: string }) => row.status)).toEqual(['created', 'created'])
    const [ana] = await db.select().from(people).where(eq(people.email, 'ana@example.com'))
    const [beto] = await db.select().from(people).where(eq(people.email, 'beto@example.com'))
    expect((await unitsOfPerson(ana.id))[0].label).toBe('Lote 142')
    expect(await unitsOfPerson(beto.id)).toHaveLength(0)
  })
})
