import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { neighborhoods, people, authTokens } from '../src/db/schema.js'
import { sembrar } from '../src/seed.js'
import { resetDb } from './helpers/db.js'

const ENTORNO = { ...process.env }

function configurar(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

describe('sembrar el barrio al instalar', () => {
  beforeEach(async () => {
    await resetDb()
    configurar({
      ADMIN_EMAIL: 'admin@aromos.test',
      ADMIN_NOMBRE: 'Gianluca',
    })
  })

  afterEach(() => { process.env = { ...ENTORNO } })

  it('crea el barrio con nombre provisorio y el admin en invited', async () => {
    expect(await sembrar()).toBe('sembrado')

    // Nombre, dirección y mapa los carga el admin desde su pantalla.
    const [b] = await db.select().from(neighborhoods)
    expect(b.name).toBe('Mi barrio')
    expect(b.address).toBeNull()
    expect(b.mapUrl).toBeNull()

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

  it('es idempotente: dos arranques dejan un barrio y un admin', async () => {
    expect(await sembrar()).toBe('sembrado')
    expect(await sembrar()).toBe('ya_existe')

    expect(await db.select().from(neighborhoods)).toHaveLength(1)
    expect(await db.select().from(people)).toHaveLength(1)
  })

  // Es el barrio que se configuró a mano, o aquel al que le sacaron las
  // variables después de instalarlo: está sembrado, y el arranque tiene que
  // decir eso y no "sin configurar".
  it('con el barrio ya hecho, no mira el entorno', async () => {
    expect(await sembrar()).toBe('sembrado')
    configurar({ ADMIN_EMAIL: undefined })
    expect(await sembrar()).toBe('ya_existe')
  })

  it('sin ADMIN_EMAIL no siembra, y no revienta', async () => {
    configurar({ ADMIN_EMAIL: undefined })
    expect(await sembrar()).toBe('sin_configurar')
    expect(await db.select().from(neighborhoods)).toHaveLength(0)
  })
})
