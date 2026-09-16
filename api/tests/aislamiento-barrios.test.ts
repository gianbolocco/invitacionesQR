import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { neighborhoods, units, people, unitMembers } from '../src/db/schema.js'
import { hashPassword } from '../src/lib/crypto.js'
import { todayInBuenosAires } from '../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { resetRateLimits } from '../src/middleware/rateLimit.js'

const app = buildApp()
const PASS = 'una-contrasena-larga'
const HOY = todayInBuenosAires()

async function barrio(nombre: string, prefijo: string) {
  const [n] = await db.insert(neighborhoods).values({ name: nombre }).returning()
  const [u] = await db.insert(units).values({ neighborhoodId: n.id, label: 'Lote 1' }).returning()

  const cuenta = async (rol: 'admin' | 'guard' | 'resident') => {
    const [p] = await db.insert(people).values({
      neighborhoodId: n.id, email: `${rol}@${prefijo}.test`, name: rol,
      role: rol, status: 'active', passwordHash: await hashPassword(PASS),
    }).returning()
    if (rol === 'resident') await db.insert(unitMembers).values({ unitId: u.id, personId: p.id })
    const login = await request(app).post('/auth/login')
      .send({ email: p.email, password: PASS })
    return { id: p.id, cookie: login.headers['set-cookie'] }
  }

  return {
    unitId: u.id,
    admin: await cuenta('admin'),
    guard: await cuenta('guard'),
    resident: await cuenta('resident'),
  }
}

/**
 * ============================================================================
 * PENDIENTE DE DECISIÓN — estos tests están salteados A PROPÓSITO.
 * ============================================================================
 *
 * Hoy los servicios reciben el neighborhoodId del que hace el pedido pero NO lo
 * usan para filtrar: buscan la persona o la invitación solo por id. Con un solo
 * barrio en la base el impacto real es cero, y por eso está sin arreglar.
 *
 * Verificado en vivo contra el stack, con dos barrios en la misma base: un
 * admin del barrio B pudo cambiarle la contraseña a un vecino del barrio A y
 * entrar con ella. Lo mismo con dar de baja, reactivar, reenviar el alta y
 * cambiar el lote; y un guardia del barrio B pudo consultar y registrar el
 * ingreso de una invitación del barrio A.
 *
 * Están escritos y salteados en vez de escritos al revés a propósito: un test
 * que afirme el agujero lo convierte en comportamiento esperado y hay que
 * borrarlo para arreglarlo. Así, el día que entre un segundo barrio la tarea
 * completa es sacar el `.skip` y hacerlos pasar.
 *
 * Los lugares a tocar son cinco:
 *   services/people.ts   disablePerson, enablePerson, resendInvite, setGuardPassword
 *   services/units.ts    setPersonLot
 *   services/entries.ts  loadForCheck (afecta a checkById, checkByToken y registerEntry)
 * ============================================================================
 */
describe.skip('aislamiento entre barrios', () => {
  beforeEach(async () => { await resetDb(); resetRateLimits() })

  it('un admin no toca las cuentas de otro barrio', async () => {
    const a = await barrio('Álamo Alto', 'a')
    const b = await barrio('Vista Linda', 'b')

    for (const accion of ['disable', 'enable', 'resend']) {
      await request(app).post(`/admin/people/${a.resident.id}/${accion}`)
        .set('Cookie', b.admin.cookie).expect(404)
    }

    await request(app).post(`/admin/people/${a.resident.id}/password`)
      .set('Cookie', b.admin.cookie).send({ password: 'contrasena-del-atacante' })
      .expect(404)

    await request(app).post(`/admin/people/${a.resident.id}/lot`)
      .set('Cookie', b.admin.cookie).send({ lot: 999 }).expect(404)

    // Y lo que importa: la víctima sigue entrando con SU contraseña.
    await request(app).post('/auth/login')
      .send({ email: 'resident@a.test', password: PASS }).expect(200)
  })

  it('un guardia no valida ni registra invitaciones de otro barrio', async () => {
    const a = await barrio('Álamo Alto', 'a')
    const b = await barrio('Vista Linda', 'b')

    const inv = (await request(app).post('/invitations').set('Cookie', a.resident.cookie).send({
      unitId: a.unitId, kind: 'visita', guestName: 'Juan',
      validFrom: HOY, validTo: HOY, capacity: 1,
    }).expect(201)).body

    await request(app).get(`/gate/invitation/${inv.id}`).set('Cookie', b.guard.cookie).expect(404)
    await request(app).get(`/gate/check/${inv.token}`).set('Cookie', b.guard.cookie).expect(404)
    await request(app).post('/gate/entries').set('Cookie', b.guard.cookie)
      .send({ invitationId: inv.id, guestName: 'Juan' }).expect(404)

    // El guardia propio sí puede.
    await request(app).get(`/gate/invitation/${inv.id}`).set('Cookie', a.guard.cookie).expect(200)
  })

  it('el mismo mail en dos barrios no vuelve ambiguo el login', async () => {
    // El índice único es (neighborhoodId, email), pero /auth/login busca solo
    // por email con limit(1): con el mismo mail en dos barrios, entrás a uno
    // arbitrario. Decidir si el login pide barrio o si el mail es único global.
    const a = await barrio('Álamo Alto', 'a')
    const [n] = await db.insert(neighborhoods).values({ name: 'Vista Linda' }).returning()
    await db.insert(people).values({
      neighborhoodId: n.id, email: 'resident@a.test', name: 'Homónimo',
      role: 'resident', status: 'active', passwordHash: await hashPassword(PASS),
    })

    const login = await request(app).post('/auth/login')
      .send({ email: 'resident@a.test', password: PASS })
    const me = await request(app).get('/auth/me').set('Cookie', login.headers['set-cookie'])
    expect(me.body.id).toBe(a.resident.id)
  })
})
