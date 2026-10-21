import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { neighborhoods, people, authTokens } from '../src/db/schema.js'
import { crearAdmin } from '../src/seed.js'
import { resetDb } from './helpers/db.js'

describe('crear un admin desde la terminal', () => {
  beforeEach(async () => { await resetDb() })

  it('con la base vacía crea el barrio provisorio y el admin en invited', async () => {
    const { resultado, link } = await crearAdmin(' Admin@Aromos.test ', 'Gianluca')
    expect(resultado).toBe('creado')
    expect(link).toMatch(/\/acceso\?t=/)

    // Nombre, dirección y mapa los carga el admin desde su pantalla.
    const [b] = await db.select().from(neighborhoods)
    expect(b.name).toBe('Mi barrio')
    expect(b.address).toBeNull()

    const [p] = await db.select().from(people)
    expect(p.email).toBe('admin@aromos.test')
    expect(p.name).toBe('Gianluca')
    expect(p.role).toBe('admin')
    // invited y sin contraseña: la elige él con el link, que es el flujo real.
    expect(p.status).toBe('invited')
    expect(p.passwordHash).toBeNull()

    const tokens = await db.select().from(authTokens).where(eq(authTokens.personId, p.id))
    expect(tokens).toHaveLength(1)
    expect(tokens[0].purpose).toBe('invite')
  })

  it('con el barrio hecho, suma el admin a ese barrio', async () => {
    await crearAdmin('uno@aromos.test', 'Uno')
    await crearAdmin('dos@aromos.test', 'Dos')

    expect(await db.select().from(neighborhoods)).toHaveLength(1)
    expect(await db.select().from(people)).toHaveLength(2)
  })

  it('a un admin que no entró le reemite el link y vence el anterior', async () => {
    await crearAdmin('admin@aromos.test', 'Admin')
    const { resultado } = await crearAdmin('admin@aromos.test', 'Admin')
    expect(resultado).toBe('reinvitado')

    const [p] = await db.select().from(people)
    const tokens = await db.select().from(authTokens).where(eq(authTokens.personId, p.id))
    expect(tokens).toHaveLength(2)
    expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1)
  })

  it('a alguien que ya tiene cuenta no le toca nada', async () => {
    await crearAdmin('admin@aromos.test', 'Admin')
    await db.update(people).set({ status: 'active' })

    await expect(crearAdmin('admin@aromos.test', 'Admin')).rejects.toThrow(/ya tiene cuenta/)
    const [p] = await db.select().from(people)
    expect(await db.select().from(authTokens).where(eq(authTokens.personId, p.id))).toHaveLength(1)
  })
})
