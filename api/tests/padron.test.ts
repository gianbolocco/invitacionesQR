import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import { neighborhoods, providers, vehicles } from '../src/db/schema.js'
import { resetDb } from './helpers/db.js'
import { violatedConstraint } from './helpers/constraint.js'
import { normalizarDoc, normalizarPatente } from '../src/lib/padron.js'

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
