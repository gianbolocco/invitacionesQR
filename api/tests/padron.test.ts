import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLogs, entryLogs, invitations, neighborhoods, people, providers, units, vehicles } from '../src/db/schema.js'
import { resetDb } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'
import { normalizarDoc, normalizarPatente } from '../src/lib/padron.js'
import { buscarProveedor, buscarVehiculo, guardarProveedor, guardarVehiculo, ultimaPatente } from '../src/services/padron.js'
import { AppError } from '../src/lib/errors.js'

describe('normalización del padrón', () => {
  it('un DNI con puntos y otro sin ellos son el mismo', () => {
    expect(normalizarDoc('30.123.456')).toBe('30123456')
    expect(normalizarDoc(' 30123456 ')).toBe('30123456')
  })
  it('un pasaporte conserva las letras, en mayúscula', () => {
    expect(normalizarDoc('aaa 123-456')).toBe('AAA123456')
  })
  it('una patente con espacios, guiones o minúsculas es la misma', () => {
    expect(normalizarPatente('ab-123 cd')).toBe('AB123CD')
    expect(normalizarPatente('ABC 123')).toBe('ABC123')
  })
  it('lo que no tiene letras ni dígitos queda vacío', () => {
    expect(normalizarDoc(' .-. ')).toBe('')
    expect(normalizarPatente('')).toBe('')
  })
})

describe('tablas del padrón', () => {
  beforeEach(async () => { await resetDb() })

  it('un DNI aparece una sola vez por barrio', async () => {
    const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
    await db.insert(providers).values({ neighborhoodId: n.id, doc: '30123456', name: 'Carlos' })
    expect(await violatedConstraint(db.insert(providers).values({ neighborhoodId: n.id, doc: '30123456', name: 'Otro' })))
      .toBe('provider_doc_uq')
  })

  it('el padrón solo acepta claves normalizadas', async () => {
    const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
    expect(await violatedConstraint(db.insert(providers).values({ neighborhoodId: n.id, doc: '30.123.456', name: 'C' })))
      .toBe('provider_doc_ck')
    expect(await violatedConstraint(db.insert(vehicles).values({
      neighborhoodId: n.id, plate: 'AB 123 CD', insuranceCompany: 'X', insurancePolicy: 'Y', insuranceExpiresOn: '2027-01-01',
    }))).toBe('vehicle_plate_ck')
  })

  it('el seguro del proveedor va completo o no va', async () => {
    const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
    expect(await violatedConstraint(db.insert(providers).values({
      neighborhoodId: n.id, doc: '1', name: 'C', insuranceCompany: 'X',
    }))).toBe('provider_insurance_all_or_none_ck')
  })

  it('los switches del auto arrancan: no se pide, y si se pide se puede autorizar igual', async () => {
    const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
    expect(n.vehicleInsuranceRequired).toBe(false)
    expect(n.vehicleInsuranceOverride).toBe(true)
  })
})

describe('servicio del padrón', () => {
  beforeEach(async () => { await resetDb() })
  const seguro = { company: 'La Caja', policy: '4410', expiresOn: '2027-03-12' }

  async function barrio() {
    const [n] = await db.insert(neighborhoods).values({ name: 'B' }).returning()
    const [g] = await db.insert(people).values({
      neighborhoodId: n.id, email: 'g@example.com', name: 'Julio', role: 'guard', status: 'active',
    }).returning()
    return { nid: n.id, guardId: g.id }
  }

  it('guarda un proveedor por su DNI normalizado y lo encuentra escrito de otra forma', async () => {
    const { nid, guardId } = await barrio()
    await db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: '30.123.456', name: 'Carlos', insurance: seguro, actorId: guardId }))
    const p = await buscarProveedor(nid, '30123456')
    expect(p).toMatchObject({ name: 'Carlos', insurance: seguro, insuranceSource: 'garita' })
  })

  it('actualizar el seguro audita el antes y el después', async () => {
    const { nid, guardId } = await barrio()
    await db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: '1', name: 'C', insurance: seguro, actorId: guardId }))
    const nuevo = { ...seguro, expiresOn: '2028-01-01' }
    await db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: '1', name: 'C', insurance: nuevo, source: 'link', actorId: null }))
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'provider.insurance_updated'))
    expect(logs).toHaveLength(2)
    expect(logs[1].meta).toEqual({ doc: '1', antes: seguro, despues: nuevo })
    expect((await buscarProveedor(nid, '1'))!.insuranceSource).toBe('link')
  })

  it('sin seguro no lo borra ni audita: solo el nombre y el rubro', async () => {
    const { nid, guardId } = await barrio()
    await db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: '1', name: 'C', insurance: seguro, actorId: guardId }))
    await db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: '1', name: 'Carlos Gómez', actorId: guardId }))
    expect(await buscarProveedor(nid, '1')).toMatchObject({ name: 'Carlos Gómez', insurance: seguro })
    expect(await db.select().from(auditLogs)).toHaveLength(1)
  })

  it('un DNI vacío da doc_required', async () => {
    const { nid } = await barrio()
    await expect(db.transaction((tx) => guardarProveedor(tx, { neighborhoodId: nid, doc: ' . ', name: 'C', actorId: null })))
      .rejects.toMatchObject({ code: 'doc_required' } satisfies Partial<AppError>)
  })

  it('guarda un auto por su patente normalizada, con el guardia que lo cargó', async () => {
    const { nid, guardId } = await barrio()
    await db.transaction((tx) => guardarVehiculo(tx, { neighborhoodId: nid, plate: 'ab 123 cd', insurance: seguro, actorId: guardId }))
    const v = await buscarVehiculo(nid, 'AB-123-CD')
    expect(v).toMatchObject({ plate: 'AB123CD', insurance: seguro, updatedByName: 'Julio' })
    expect(await buscarVehiculo(nid, 'ZZ999ZZ')).toBeNull()
    expect(await buscarVehiculo(nid, '')).toBeNull()
  })

  it('la última patente con la que entró un DNI', async () => {
    const { nid } = await barrio()
    const [u] = await db.insert(units).values({ neighborhoodId: nid, label: 'Lote 1' }).returning()
    const [p] = await db.insert(people).values({ neighborhoodId: nid, email: 'v@example.com', name: 'V', role: 'resident' }).returning()
    const [inv] = await db.insert(invitations).values({
      unitId: u.id, createdBy: p.id, kind: 'visita', guestName: 'C', validFrom: '2026-10-01', validTo: '2026-10-01', token: 't',
    }).returning()
    await db.insert(entryLogs).values([
      { invitationId: inv.id, unitId: u.id, guestName: 'C', guestDoc: '30.123.456', plate: 'AA 111 AA', enteredAt: new Date('2026-10-01T10:00:00Z') },
      { invitationId: inv.id, unitId: u.id, guestName: 'C', guestDoc: '30123456', plate: 'BB 222 BB', enteredAt: new Date('2026-10-02T10:00:00Z') },
      { invitationId: inv.id, unitId: u.id, guestName: 'C', guestDoc: '30123456', plate: null, enteredAt: new Date('2026-10-03T10:00:00Z') },
    ])
    expect(await ultimaPatente(nid, '30123456')).toBe('BB 222 BB')
    expect(await ultimaPatente(nid, '1')).toBeNull()
  })
})
