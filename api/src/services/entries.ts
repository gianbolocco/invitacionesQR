import { and, desc, eq, gt, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, units, people, trades, neighborhoods } from '../db/schema.js'
import { canEnter, type EntryCheck } from '../authz.js'
import { todayInBuenosAires, TZ } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'
import { audit } from '../lib/audit.js'
import { pideSeguro, claveSeguro, type Seguro } from '../lib/seguro.js'
import { aplicaFranjas } from '../lib/franjas.js'
import { normalizarDoc, normalizarPatente } from '../lib/padron.js'
import { PORTERIA } from '../lib/porteria.js'
import { buscarProveedor, buscarVehiculo, guardarProveedor, guardarVehiculo, ultimaPatente, type ProveedorPadron, type VehiculoPadron } from './padron.js'
import { assertUnitInNeighborhood, completarDocContacto, valoresDePorteria, franjasDelRubro } from './invitations.js'

/** db o una transacción: las queries de lectura sirven para las dos. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/*
 * Busca por id o por token y no filtra por barrio, a propósito: un despliegue
 * es un barrio y toda invitación de la base es suya. Ver la nota larga en
 * people.ts.
 */
async function loadForCheck(where: SQL) {
  const [row] = await db.select({
    id: invitations.id,
    kind: invitations.kind,
    frequentAs: invitations.frequentAs,
    tradeId: invitations.tradeId,
    tradeName: trades.name,
    providerWindows: neighborhoods.providerWindows,
    insuranceWarnDays: neighborhoods.insuranceWarnDays,
    requiresInsurance: trades.requiresInsurance,
    neighborhoodId: neighborhoods.id,
    vehicleInsuranceRequired: neighborhoods.vehicleInsuranceRequired,
    vehicleInsuranceOverride: neighborhoods.vehicleInsuranceOverride,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    note: invitations.note,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    weekdays: invitations.weekdays,
    capacity: invitations.capacity,
    revokedAt: invitations.revokedAt,
    expiresAt: invitations.expiresAt,
    unitId: invitations.unitId,
    unitLabel: units.label,
    // Para el veredicto: a quién llamar si hay dudas. Si la creó un guardia
    // (alta exprés), no se muestra su nombre, igual que en la agenda.
    creatorRole: people.role,
    inviterName: sql<string>`case when ${people.role} = 'guard' then ${PORTERIA} else ${people.name} end`,
  }).from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .leftJoin(trades, eq(trades.id, invitations.tradeId))
    .where(where).limit(1)
  return row ?? null
}

type LoadedInvitation = NonNullable<Awaited<ReturnType<typeof loadForCheck>>>

/** Lo que el check necesita del padrón: los dos seguros y los switches del barrio. */
export type Padron = {
  provider: ProveedorPadron | null
  vehicle: VehiculoPadron | null
  /** Vino en auto: hay una patente cargada (la de la invitación o la que tipeó el guardia). */
  hayPatente: boolean
  vehicleInsuranceRequired: boolean
  vehicleInsuranceOverride: boolean
}

/** Lo que canEnter necesita, a partir de las columnas crudas (el rubro puede ser null) y del padrón. */
export function aLike<T extends {
  creatorRole: string
  kind: string; frequentAs: string | null; requiresInsurance: boolean | null
}>(row: T, padron: Padron) {
  const s = padron.provider?.insurance ?? null
  return {
    ...row,
    porteria: row.creatorRole === 'guard',
    requiresInsurance: pideSeguro(row.kind, row.frequentAs, row.requiresInsurance),
    // Los mismos tres campos planos de antes, ahora del padrón: la web los sigue leyendo así.
    insuranceCompany: s?.company ?? null,
    insurancePolicy: s?.policy ?? null,
    insuranceExpiresOn: s?.expiresOn ?? null,
    insuranceComplete: s !== null,
    vehicleRequiresInsurance: padron.vehicleInsuranceRequired && padron.hayPatente,
    vehicleInsuranceExpiresOn: padron.vehicle?.insurance.expiresOn ?? null,
    vehicleOverride: padron.vehicleInsuranceOverride,
  }
}

/**
 * `datos` es lo que el guardia tiene tipeado en el veredicto. Sin él, vale lo
 * de la invitación. El veredicto se recalcula acá, con el único canEnter, cada
 * vez que el guardia cambia el documento o la patente.
 */
async function buildCheck(invitation: LoadedInvitation, datos: { doc?: string; plate?: string } = {}) {
  const { usedCount, lastEntryAt } = await usage(invitation.id)
  const { providerWindows, insuranceWarnDays, neighborhoodId, vehicleInsuranceRequired, vehicleInsuranceOverride, ...crudo } = invitation
  // Si está adentro, lo que vale es con qué entró: la patente que tipeó la
  // garita queda solo en entry_log, no en la invitación.
  const abierta = await openEntry(invitation.id)
  const doc = datos.doc ?? (abierta ? abierta.guestDoc : invitation.guestDoc) ?? ''
  const plate = datos.plate ?? (abierta ? abierta.plate : invitation.plate) ?? ''
  const [provider, vehicle, lastPlate] = await Promise.all([
    buscarProveedor(neighborhoodId, doc),
    buscarVehiculo(neighborhoodId, plate),
    ultimaPatente(neighborhoodId, doc),
  ])
  const inv = aLike(crudo, { provider, vehicle, hayPatente: normalizarPatente(plate) !== '', vehicleInsuranceRequired, vehicleInsuranceOverride })
  const check: EntryCheck = canEnter(inv, new Date(), usedCount, providerWindows)

  return {
    invitation: inv,
    // Solo las franjas de su rubro, nunca la lista entera del barrio.
    franjas: franjasDelRubro(providerWindows, invitation.kind, invitation.frequentAs, invitation.tradeId),
    insuranceWarnDays,
    check,
    usedCount,
    lastEntryAt,
    provider: provider && { insurance: provider.insurance, insuranceSource: provider.insuranceSource, updatedAt: provider.updatedAt },
    vehicle: vehicle && { plate: vehicle.plate, insurance: vehicle.insurance, updatedByName: vehicle.updatedByName, updatedAt: vehicle.updatedAt },
    lastPlate,
    vehicleInsuranceRequired,
    vehicleInsuranceOverride,
    /*
     * Si viene, el próximo movimiento es un egreso y `check` no aplica: un
     * egreso no se valida. El cliente decide a qué endpoint pegar con esto, y
     * el servidor valida igual por si el dato quedó viejo.
     */
    adentro: abierta ? { entryId: abierta.id, enteredAt: abierta.enteredAt, guestDoc: abierta.guestDoc, plate: abierta.plate } : null,
  }
}

/** Cuántas veces se usó una invitación y cuándo fue la última. */
async function usage(invitationId: string, tx: Executor = db) {
  const [row] = await tx.select({
    used: sql<number>`count(*)::int`,
    last: sql<Date | null>`max(${entryLogs.enteredAt})`,
  }).from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return { usedCount: row?.used ?? 0, lastEntryAt: row?.last ?? null }
}

/**
 * La fila abierta de una invitación: alguien entró y no se registró su salida.
 *
 * Si hay más de una —una frecuente donde el guardia olvidó cerrar una— vale la
 * más reciente. Las anteriores quedan abiertas y la auditoría las muestra sin
 * salida, que es la verdad: no sabemos a qué hora se fue.
 */
async function openEntry(invitationId: string, tx: Executor = db) {
  const [row] = await tx.select({ id: entryLogs.id, enteredAt: entryLogs.enteredAt, guestDoc: entryLogs.guestDoc, plate: entryLogs.plate })
    .from(entryLogs)
    .where(and(eq(entryLogs.invitationId, invitationId), isNull(entryLogs.exitedAt)))
    .orderBy(desc(entryLogs.enteredAt))
    .limit(1)
  return row ?? null
}

export async function checkByToken(token: string) {
  const invitation = await loadForCheck(eq(invitations.token, token))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation)
}

export async function checkById(id: string, datos?: { doc?: string; plate?: string }) {
  const invitation = await loadForCheck(eq(invitations.id, id))
  if (!invitation) throw new AppError(404, 'not_found')
  return buildCheck(invitation, datos)
}

/**
 * Registra el ingreso revalidando el cupo DENTRO de la transacción.
 *
 * El FOR UPDATE sobre la invitación es lo que serializa el cupo: sin él, dos
 * escaneos simultáneos del mismo QR leen el mismo contador y los dos entran.
 */
export async function registerEntry(
  invitationId: string,
  guardId: string | null,
  data: { guestName: string; guestDoc?: string; plate?: string; note?: string; insurance?: Seguro; vehicleInsurance?: Seguro },
) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(invitations)
      .where(eq(invitations.id, invitationId)).for('update').limit(1)
    if (!target) throw new AppError(404, 'not_found')

    const { usedCount } = await usage(invitationId, tx)
    // Después del FOR UPDATE: quién la creó decide si canEnter mira franjas y seguro.
    const [{ creatorRole }] = await tx.select({ creatorRole: people.role }).from(people).where(eq(people.id, target.createdBy))

    // Después del FOR UPDATE de arriba, que sigue siendo lo que serializa el cupo.
    const [barrio] = await tx.select({
      providerWindows: neighborhoods.providerWindows, nid: neighborhoods.id, warnDays: neighborhoods.insuranceWarnDays,
      vehicleInsuranceRequired: neighborhoods.vehicleInsuranceRequired, vehicleInsuranceOverride: neighborhoods.vehicleInsuranceOverride,
    }).from(units).innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
      .where(eq(units.id, target.unitId)).limit(1)
    const [rubro] = target.tradeId
      ? await tx.select({ requiresInsurance: trades.requiresInsurance }).from(trades).where(eq(trades.id, target.tradeId))
      : []
    const pide = pideSeguro(target.kind, target.frequentAs, rubro?.requiresInsurance ?? null)
    const doc = data.guestDoc?.trim() ?? ''
    // Misma regla que buildCheck: lo tipeado manda, si no la de la invitación; '' es a pie.
    const plate = (data.plate ?? target.plate ?? '').trim()

    // El padrón se escribe ANTES de canEnter y en esta misma transacción: si
    // canEnter rechaza, el throw lo revierte junto con su auditoría.
    if (aplicaFranjas(target.kind, target.frequentAs) && normalizarDoc(doc) !== '') {
      await guardarProveedor(tx, {
        neighborhoodId: barrio.nid, doc, name: data.guestName, tradeId: target.tradeId ?? undefined,
        insurance: pide ? data.insurance : undefined, actorId: guardId,
      })
    }
    if (data.vehicleInsurance) {
      await guardarVehiculo(tx, { neighborhoodId: barrio.nid, plate, insurance: data.vehicleInsurance, actorId: guardId })
    }

    const provider = await buscarProveedor(barrio.nid, doc, tx)
    const vehicle = await buscarVehiculo(barrio.nid, plate, tx)
    const inv = aLike({ ...target, creatorRole, requiresInsurance: rubro?.requiresInsurance ?? null }, {
      provider, vehicle, hayPatente: normalizarPatente(plate) !== '',
      vehicleInsuranceRequired: barrio.vehicleInsuranceRequired, vehicleInsuranceOverride: barrio.vehicleInsuranceOverride,
    })
    const ahora = new Date()
    const check = canEnter(inv, ahora, usedCount, barrio.providerWindows)
    if (!check.ok) throw new AppError(409, check.reason)

    const [entry] = await tx.insert(entryLogs).values({
      invitationId,
      unitId: target.unitId,
      guardId,
      guestName: data.guestName.trim(),
      guestDoc: doc || null,
      plate: plate.toUpperCase() || null,
      note: data.note?.trim() || null,
      // La foto de los seguros en este momento: el padrón cambia, la auditoría no.
      // Se calcula sin las excepciones de la portería: así se ve lo que se autorizó igual.
      providerInsurance: claveSeguro(pide, provider?.insurance ?? null, barrio.warnDays, ahora),
      vehicleInsurance: claveSeguro(inv.vehicleRequiresInsurance, vehicle?.insurance ?? null, barrio.warnDays, ahora),
    }).returning()

    // Si la invitación no tenía documento, el que se tipeó en la puerta
    // queda ahí: la próxima vez (frecuente, proveedor) ya viene precargado.
    // La fila de la invitación ya está bloqueada por el FOR UPDATE de arriba.
    if (!target.guestDoc && doc) {
      await tx.update(invitations).set({ guestDoc: doc }).where(eq(invitations.id, invitationId))
    }
    // Aunque la invitación ya tuviera DNI (del link): el del contacto es el que vio la garita.
    await completarDocContacto(tx, target.contactId, doc)

    return entry
  })
}

/** Hasta cuántas horas atrás se puede cargar un movimiento a mano. */
const VENTANA_MANUAL_H = 48
export const MAX_CARGA_MANUAL = 50

export type CargaManual = {
  /** Una invitación existente, o `guest` para alguien que entró sin ninguna. */
  invitationId?: string
  guest?: { name: string; unitId: string }
  guestDoc: string
  /** La anotada en la planilla. Sin ella, la de la invitación. */
  plate?: string
  enteredAt: Date
  /** null = todavía está adentro. */
  exitedAt: Date | null
  note?: string
}

/**
 * Carga a mano ingresos y egresos que ya pasaron (un corte de luz, una
 * planilla de papel), con la hora en que ocurrieron.
 *
 * Es un registro, no una decisión de acceso: igual que registerExit, NO
 * valida cupo, fecha ni anulación. Lo que sí valida es que el relato cierre:
 * nada en el futuro, nada de hace más de 48 h (es lo que separa cargar un
 * corte de reescribir la historia) y nada que se superponga con otro
 * movimiento de la misma invitación. Todo o nada: una tanda con un error no
 * guarda ninguna, y el error dice qué fila (`fila`, desde 0) lo causó.
 *
 * Quien no tenía invitación (`guest`) recibe una de portería del día en que
 * entró. Quien carga queda como guardia de ingreso y de salida, y en
 * `loaded_by`/`loaded_at`: la fila no se hace pasar por un escaneo.
 */
export async function registerManual(
  neighborhoodId: string,
  loaderId: string,
  items: CargaManual[],
) {
  if (items.length === 0 || items.length > MAX_CARGA_MANUAL) throw new AppError(400, 'tanda_invalida')
  const ahora = new Date()
  const desde = new Date(ahora.getTime() - VENTANA_MANUAL_H * 3_600_000)

  const filas = await db.transaction(async (tx) => {
    const creadas = []
    for (const [n, it] of items.entries()) {
      try {
        creadas.push(await cargarUna(tx, neighborhoodId, loaderId, it, ahora, desde))
      } catch (e) {
        if (e instanceof AppError) throw new AppError(e.status, e.code, e.message, n)
        throw e
      }
    }
    return creadas
  })

  for (const f of filas) {
    await audit(loaderId, neighborhoodId, 'entry.manual', 'entry_log', f.id, {
      invitationId: f.invitationId, enteredAt: f.enteredAt, exitedAt: f.exitedAt, note: f.note,
    })
  }
  return filas
}

async function cargarUna(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  neighborhoodId: string,
  loaderId: string,
  it: CargaManual,
  ahora: Date,
  desde: Date,
) {
  if (it.enteredAt > ahora || (it.exitedAt && it.exitedAt > ahora)) throw new AppError(400, 'fecha_futura')
  if (it.enteredAt < desde) throw new AppError(400, 'fuera_de_ventana')
  if (it.exitedAt && it.exitedAt < it.enteredAt) throw new AppError(400, 'salida_anterior')
  if (!it.invitationId && !it.guest) throw new AppError(400, 'tanda_invalida')

  const guestDoc = it.guestDoc.trim()
  const plate = it.plate?.trim().toUpperCase() || null
  let invitationId: string
  let target: { unitId: string; guestName: string; guestDoc: string | null; plate: string | null }

  if (it.guest) {
    await assertUnitInNeighborhood(it.guest.unitId, neighborhoodId, tx)
    // Recién creada y sin otros movimientos: no hay con qué superponerse.
    const [inv] = await tx.insert(invitations).values(valoresDePorteria({
      unitId: it.guest.unitId, guestName: it.guest.name, guestDoc, plate: plate ?? undefined,
      createdBy: loaderId, neighborhoodId,
    }, todayInBuenosAires(it.enteredAt))).returning()
    invitationId = inv.id
    target = inv
  } else {
    invitationId = it.invitationId!
    const [encontrada] = await tx.select({
      unitId: invitations.unitId, guestName: invitations.guestName,
      guestDoc: invitations.guestDoc, plate: invitations.plate, contactId: invitations.contactId,
    }).from(invitations)
      .innerJoin(units, eq(units.id, invitations.unitId))
      .where(and(eq(invitations.id, invitationId), eq(units.neighborhoodId, neighborhoodId)))
      // Serializa dos tandas simultáneas sobre la misma invitación: sin esto las
      // dos pasan el chequeo de superposición y se pisan.
      .for('update', { of: invitations })
      .limit(1)
    if (!encontrada) throw new AppError(404, 'not_found')
    target = encontrada

    // Un movimiento ocupa [ingreso, salida) y una fila abierta ocupa hasta hoy.
    // Se superponen si cada uno empieza antes de que el otro termine.
    const [choque] = await tx.select({ id: entryLogs.id }).from(entryLogs).where(and(
      eq(entryLogs.invitationId, invitationId),
      or(isNull(entryLogs.exitedAt), gt(entryLogs.exitedAt, it.enteredAt)),
      it.exitedAt ? lt(entryLogs.enteredAt, it.exitedAt) : undefined,
    )).limit(1)
    if (choque) throw new AppError(409, 'se_superpone')

    // Igual que registerEntry: el DNI cargado queda en la invitación.
    if (!target.guestDoc) {
      await tx.update(invitations).set({ guestDoc }).where(eq(invitations.id, invitationId))
    }
    await completarDocContacto(tx, encontrada.contactId, guestDoc)
  }

  const [fila] = await tx.insert(entryLogs).values({
    invitationId,
    unitId: target.unitId,
    guardId: loaderId,
    enteredAt: it.enteredAt,
    exitedAt: it.exitedAt,
    exitGuardId: it.exitedAt ? loaderId : null,
    guestName: target.guestName,
    guestDoc,
    plate: plate ?? target.plate,
    note: it.note?.trim() || null,
    source: 'manual',
    loadedBy: loaderId,
    loadedAt: ahora,
  }).returning()
  return fila
}

/**
 * Registra la salida: cierra la fila abierta más reciente de esa invitación.
 *
 * No valida NADA. Ni fechas, ni cupo, ni anulación: el que está adentro tiene
 * que poder salir, y si le anularon la invitación mientras estaba adentro eso
 * es justamente lo que se quiere registrado.
 *
 * El `isNull(exitedAt)` del WHERE no es redundante con la lectura de arriba: es
 * lo que hace que dos egresos simultáneos no escriban los dos. El que pierde
 * actualiza cero filas y se va con 409.
 */
export async function registerExit(invitationId: string, guardId: string | null) {
  const abierta = await openEntry(invitationId)
  if (!abierta) throw new AppError(409, 'no_esta_adentro')

  const [salida] = await db.update(entryLogs)
    .set({ exitedAt: new Date(), exitGuardId: guardId })
    .where(and(eq(entryLogs.id, abierta.id), isNull(entryLogs.exitedAt)))
    .returning()

  if (!salida) throw new AppError(409, 'no_esta_adentro')
  return salida
}

/**
 * Cuántos minutos se puede deshacer un movimiento.
 *
 * Es lo que separa "corregir un escaneo doble" de "borrar evidencia": sin
 * límite, un guardia podría borrar un ingreso de hace tres semanas.
 */
const VENTANA_DESHACER_MIN = 5

/**
 * Deshace el último movimiento de una fila de la bitácora.
 *
 * Si tiene salida, la borra (deshace el egreso). Si no, borra la fila entera
 * (deshace el ingreso) y con eso libera el cupo que había consumido.
 *
 * El ingreso borrado se guarda en el meta del audit_log: la fila desaparece,
 * pero que desapareció y qué decía, no.
 */
export async function undoMovement(
  entryId: string,
  personId: string,
  neighborhoodId: string,
): Promise<{ deshecho: 'ingreso' | 'egreso' }> {
  const [fila] = await db.select().from(entryLogs).where(eq(entryLogs.id, entryId)).limit(1)
  if (!fila) throw new AppError(404, 'not_found')

  // El plazo se cuenta desde el movimiento que se está deshaciendo: alguien que
  // entró hace dos horas y salió hace un minuto puede deshacer esa salida.
  const momento = fila.exitedAt ?? fila.enteredAt
  if (Date.now() - momento.getTime() > VENTANA_DESHACER_MIN * 60_000) {
    throw new AppError(409, 'fuera_de_plazo')
  }

  if (fila.exitedAt) {
    await db.update(entryLogs).set({ exitedAt: null, exitGuardId: null })
      .where(eq(entryLogs.id, entryId))
    await audit(personId, neighborhoodId, 'entry.undone', 'entry', entryId, {
      movimiento: 'egreso', exitedAt: fila.exitedAt,
    })
    return { deshecho: 'egreso' }
  }

  await db.delete(entryLogs).where(eq(entryLogs.id, entryId))
  await audit(personId, neighborhoodId, 'entry.undone', 'entry', entryId, {
    movimiento: 'ingreso',
    guestName: fila.guestName,
    guestDoc: fila.guestDoc,
    plate: fila.plate,
    enteredAt: fila.enteredAt,
    guardId: fila.guardId,
  })
  return { deshecho: 'ingreso' }
}

/**
 * Invitaciones todavía vigentes que matchean nombre, documento, etiqueta de UF
 * o patente.
 *
 * La comparación del nombre y la UF pasa por `unaccent`: con un auto esperando
 * en la barrera nadie escribe "Pérez" con tilde, y el vecino sí la escribió al
 * cargar la invitación.
 *
 * ponytail: unaccent() no es IMMUTABLE, así que esto no usa índice y hace scan.
 * Con las invitaciones vigentes de un barrio son decenas de filas. Si alguna vez
 * duele: wrapper IMMUTABLE + índice GIN con pg_trgm.
 */
export async function searchGuests(neighborhoodId: string, query: string) {
  const q = `%${query.trim()}%`
  const hoy = todayInBuenosAires()
  const digitos = query.replace(/\D/g, '')

  return db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    kind: invitations.kind,
    plate: invitations.plate,
    note: invitations.note,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    frequentAs: invitations.frequentAs,
    tradeName: trades.name,
    unitLabel: units.label,
    // Para que el guardia sepa qué va a pasar antes de tocar el resultado.
    anulada: sql<boolean>`${invitations.revokedAt} is not null`,
    adentro: sql<boolean>`exists (
      select 1 from entry_log e
      where e.invitation_id = ${invitations.id} and e.exited_at is null
    )`,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .leftJoin(trades, eq(trades.id, invitations.tradeId))
    .where(and(
      eq(units.neighborhoodId, neighborhoodId),
      // O sigue adentro: el que entró ayer con una invitación de ayer tiene que
      // aparecer hoy por DNI, para registrarle la salida sin el QR.
      or(
        gte(invitations.validTo, hoy),
        sql`exists (select 1 from entry_log e where e.invitation_id = ${invitations.id} and e.exited_at is null)`,
      ),
      or(
        sql`unaccent(${invitations.guestName}) ilike unaccent(${q})`,
        sql`unaccent(${units.label}) ilike unaccent(${q})`,
        ilike(invitations.plate, q),
        // Sin unaccent: un documento no lleva tildes, y pasarlo por unaccent
        // sería gasto sin efecto.
        ilike(invitations.guestDoc, q),
        // Por dígitos: el vecino cargó "30.123.456" y la lectora del DNI manda
        // 30123456. Desde 3 dígitos, para que "Lote 1" no matchee todo con un 1.
        // Solo si la búsqueda no tiene letras: "Lote 142" es una unidad, no un
        // documento, y sin este corte matchearía cualquier DNI con 142 adentro.
        digitos.length >= 3 && !/\p{L}/u.test(query)
          ? sql`regexp_replace(${invitations.guestDoc}, '\\D', '', 'g') like ${`%${digitos}%`}`
          : undefined,
      ),
    ))
    .orderBy(desc(invitations.createdAt))
    .limit(20)
}


export type AgendaRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  note: string | null
  kind: 'visita' | 'frecuente' | 'proveedor' | 'delivery'
  frequentAs: 'visita' | 'proveedor' | null
  tradeName: string | null
  unitLabel: string
  inviterName: string
  capacity: number
  /** Para que la garita distinga "no vino todavía" de "ya venció". */
  validTo: string
  /** Solo en delivery: el instante en que deja de valer. */
  expiresAt: Date | null
  enteredCount: number
  lastEntryAt: Date | null
  /** Última salida registrada ESE día. */
  lastExitAt: Date | null
  /**
   * Hay una fila abierta, de cualquier día. No se filtra por día a propósito:
   * si entró anteayer y nadie registró su salida, sigue adentro hoy.
   */
  adentro: boolean
  /** Solo en `insideNow`: cuándo vence su tiempo adentro; null = su tipo no alerta. */
  alertaDesde?: Date | null
}

/**
 * Quiénes están habilitados a entrar un día dado.
 *
 * Aplica las mismas reglas que canEnter salvo el cupo: una invitación con el
 * cupo agotado igual aparece, marcada como "ya entró". El guardia necesita ver
 * quién vino, no solo quién falta.
 *
 */
export async function agendaForDay(neighborhoodId: string, day: string): Promise<AgendaRow[]> {
  // 0 = domingo, igual que weekdayInBuenosAires y que la columna weekdays.
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()

  /*
   * Los ingresos se cuentan del día que se está mirando, no de toda la vida de
   * la invitación. Sin esto, una frecuente que entró el lunes figuraba "adentro"
   * el martes y el miércoles, y la agenda de ayer mostraba el ingreso de hoy.
   *
   * El corte del día va en hora de Buenos Aires y no en UTC: entre las 21 y la
   * medianoche acá ya es el día siguiente en UTC, que es justo el horario en
   * que más gente entra al barrio.
   */
  const eseDia = sql`(e.entered_at at time zone ${TZ})::date = ${day}::date`

  const res = await db.execute(sql`
    select
      i.id,
      i.guest_name        as "guestName",
      i.guest_doc         as "guestDoc",
      i.plate,
      i.note,
      i.kind,
      i.frequent_as       as "frequentAs",
      t.name              as "tradeName",
      u.label             as "unitLabel",
      case when p.role = 'guard' then ${PORTERIA} else p.name end as "inviterName",
      i.capacity,
      i.valid_to          as "validTo",
      i.expires_at        as "expiresAt",
      (select count(*) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)::int as "enteredCount",
      (select max(e.entered_at) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)      as "lastEntryAt",
      (select max(e.exited_at) from entry_log e
        where ${eseDia} and e.invitation_id = i.id)      as "lastExitAt",
      exists (select 1 from entry_log e
        where e.invitation_id = i.id and e.exited_at is null) as "adentro"
    from invitation i
    join unit u on u.id = i.unit_id
    join person p on p.id = i.created_by
    left join trade t on t.id = i.trade_id
    where u.neighborhood_id = ${neighborhoodId}
      and i.revoked_at is null
      and ${day}::date between i.valid_from and i.valid_to
      and (i.weekdays is null or ${dow} = any(i.weekdays))
    order by lower(i.guest_name)
  `)

  return res.rows as unknown as AgendaRow[]
}

/**
 * Quiénes están en el barrio ahora: toda invitación con un ingreso sin egreso.
 *
 * No mira fechas ni anulación, igual que el egreso: el que entró ayer con una
 * invitación de ayer, o al que le anularon la invitación estando adentro,
 * sigue adentro. Mismas columnas que la agenda, salvo `lastEntryAt`, que acá
 * es el último ingreso abierto de cualquier día.
 */
export async function insideNow(neighborhoodId: string): Promise<AgendaRow[]> {
  const hoy = sql`(e.entered_at at time zone ${TZ})::date = ${todayInBuenosAires()}::date`

  const res = await db.execute(sql`
    select
      i.id,
      i.guest_name        as "guestName",
      i.guest_doc         as "guestDoc",
      i.plate,
      i.note,
      i.kind,
      i.frequent_as       as "frequentAs",
      t.name              as "tradeName",
      u.label             as "unitLabel",
      case when p.role = 'guard' then ${PORTERIA} else p.name end as "inviterName",
      i.capacity,
      i.valid_to          as "validTo",
      i.expires_at        as "expiresAt",
      (select count(*) from entry_log e
        where ${hoy} and e.invitation_id = i.id)::int  as "enteredCount",
      abiertas.desde                                    as "lastEntryAt",
      (select max(e.exited_at) from entry_log e
        where ${hoy} and e.invitation_id = i.id)       as "lastExitAt",
      true                                              as "adentro",
      -- Un umbral NULL da NULL solo. Una frecuente usa el umbral de lo que es
      -- (sin subtipo, visita).
      case case when i.kind = 'frecuente' then coalesce(i.frequent_as, 'visita') else i.kind end
        when 'visita'    then abiertas.primero + make_interval(hours => n.overstay_hours_visita)
        when 'proveedor' then abiertas.primero + make_interval(hours => n.overstay_hours_proveedor)
        when 'delivery'  then abiertas.primero + make_interval(mins => n.overstay_minutes_delivery)
      end                                               as "alertaDesde"
    from (
      -- El reloj de la alerta corre desde el ingreso abierto más viejo: con
      -- cupo 3 puede haber tres adentro, y el que lleva más es el que importa.
      select invitation_id, max(entered_at) as desde, min(entered_at) as primero
      from entry_log where exited_at is null group by invitation_id
    ) abiertas
    join invitation i on i.id = abiertas.invitation_id
    join unit u on u.id = i.unit_id
    join neighborhood n on n.id = u.neighborhood_id
    join person p on p.id = i.created_by
    left join trade t on t.id = i.trade_id
    where u.neighborhood_id = ${neighborhoodId}
    order by abiertas.desde desc
  `)

  return res.rows as unknown as AgendaRow[]
}

export type AuditRow = {
  id: string
  guestName: string
  guestDoc: string | null
  plate: string | null
  kind: 'visita' | 'frecuente' | 'proveedor' | 'delivery'
  frequentAs: 'visita' | 'proveedor' | null
  tradeName: string | null
  /** El rubro pide seguro Y esta invitación es de quien entra a trabajar. */
  requiresInsurance: boolean
  /** 0 = domingo. null = todos los días. */
  weekdays: number[] | null
  /** Lo que el vecino le dejó dicho a la guardia. */
  note: string | null
  /** La creó la portería (alta exprés), no un vecino. */
  porteria: boolean
  insuranceCompany: string | null
  insurancePolicy: string | null
  insuranceExpiresOn: string | null
  /** El seguro del auto HOY, por la patente de la invitación. El de cada ingreso está en sus movimientos. */
  vehicleCompany: string | null
  vehiclePolicy: string | null
  vehicleExpiresOn: string | null
  /** Algún ingreso fue un alta exprés con un seguro faltante: "Autorizar igual". */
  autorizadoSinSeguro: boolean
  unitLabel: string
  inviterName: string
  validFrom: string
  validTo: string
  createdAt: Date
  /**
   * El ciclo de vida de una invitación. 'entro' se partió en dos al aparecer
   * los egresos: mezclaba al que sigue adentro con el que ya se fue, que es
   * justo la diferencia que hay que poder ver.
   */
  status: 'adentro' | 'concluida' | 'esperando' | 'vencida' | 'anulada'
  enteredAt: Date | null
  enteredCount: number
  guardName: string | null
  exitedAt: Date | null
  exitGuardName: string | null
  /** Algún movimiento de esta invitación se cargó a mano. */
  manual: boolean
  /** null = no la anuló la portería. '' = la anuló sin dejar motivo. */
  revokedReason: string | null
}

export type AuditStatus = AuditRow['status']

export type AuditFilters = {
  from?: string
  to?: string
  unitId?: string
  status?: AuditStatus
  kind?: 'visita' | 'frecuente' | 'proveedor' | 'delivery'
  /** Texto libre: nombre, documento, patente, unidad o quién invita. */
  q?: string
  /** Solo las que entraron por un alta exprés con algún seguro faltante. */
  sinSeguro?: boolean
  page?: number
  pageSize?: number
}

export type AuditPage = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<AuditStatus, number>
  /** Días de aviso de vencimiento del barrio; null = sin aviso. */
  insuranceWarnDays: number | null
}

/**
 * Auditoría a nivel invitación: quién entró y quién NO.
 *
 * Cada fila es una invitación, incluidas las que nadie usó. "No vino nadie" es
 * justamente el dato que un listado de ingresos no puede mostrar; los ingresos
 * de cada una se piden aparte al desplegar la fila.
 *
 * El filtro por estado y los contadores van del lado del servidor: con
 * paginación, filtrar la página que llegó daría números que mienten.
 */
export async function auditInvitations(
  neighborhoodId: string,
  f: AuditFilters,
): Promise<AuditPage> {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50))
  const [rows, counts, [barrio]] = await Promise.all([
    auditRows(neighborhoodId, f, pageSize, (page - 1) * pageSize),
    auditCounts(neighborhoodId, f),
    db.select({ dias: neighborhoods.insuranceWarnDays }).from(neighborhoods).where(eq(neighborhoods.id, neighborhoodId)),
  ])

  const total = f.status
    ? counts[f.status]
    : Object.values(counts).reduce((a, b) => a + b, 0)

  return { rows, total, page, pageSize, counts, insuranceWarnDays: barrio?.dias ?? null }
}

/**
 * Todas las filas que matchean el filtro, sin paginar. Para exportar.
 * El tope de 5000 es una red, no una página: nadie espera que un export
 * respete el scroll, pero tampoco que tire la base abajo.
 */
export function auditAll(neighborhoodId: string, f: AuditFilters): Promise<AuditRow[]> {
  return auditRows(neighborhoodId, f, 5000, 0)
}


/**
 * Los filtros que comparten las filas y los contadores: con paginación, un
 * contador que no mira la búsqueda mostraría números de otra lista.
 * El estado NO entra acá: los contadores cuentan todos los estados a la vez.
 */
function filtrosAuditoria(neighborhoodId: string, f: AuditFilters) {
  const q = f.q?.trim() ?? ''
  // % y _ son comodines de LIKE: se escapan para que "Lote_1" busque ese texto.
  const patron = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
  // El documento se guarda como lo escribió quien invitó ("30.123.456"): se
  // compara solo por dígitos, y solo si lo buscado tiene alguno.
  const digitos = q.replace(/\D/g, '')
  const patronDoc = digitos ? `%${digitos}%` : null
  return sql`
    u.neighborhood_id = ${neighborhoodId}
    and (${f.from ?? null}::date is null or i.valid_to >= ${f.from ?? null}::date)
    and (${f.to ?? null}::date is null or i.valid_from <= ${f.to ?? null}::date)
    and (${f.unitId ?? null}::uuid is null or i.unit_id = ${f.unitId ?? null}::uuid)
    and (${f.kind ?? null}::text is null or i.kind = ${f.kind ?? null}::text)
    and (${patron}::text is null
      or i.guest_name ilike ${patron}::text
      or i.plate ilike ${patron}::text
      or u.label ilike ${patron}::text
      or p.name ilike ${patron}::text
      or regexp_replace(coalesce(i.guest_doc, ''), '\\D', '', 'g') like ${patronDoc}::text)
    and (not ${f.sinSeguro ?? false}::boolean or (p.role = 'guard' and exists (
      select 1 from entry_log es where es.invitation_id = i.id
        and (es.provider_insurance in ('sin_cargar','vencido') or es.vehicle_insurance in ('sin_cargar','vencido')))))
  `
}

async function auditCounts(
  neighborhoodId: string,
  f: AuditFilters,
): Promise<Record<AuditStatus, number>> {
  const hoy = todayInBuenosAires()
  const { rows } = await db.execute(sql`
    with uso as (
      select e.invitation_id,
             count(*)::int as veces,
             count(*) filter (where e.exited_at is null)::int as abiertas
      from entry_log e group by e.invitation_id
    ),
    clasificadas as (
      select case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.abiertas, 0) > 0 then 'adentro'
        when coalesce(uso.veces, 0) > 0 then 'concluida'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end as status
      from invitation i
      join unit u on u.id = i.unit_id
      join person p on p.id = i.created_by
      left join uso on uso.invitation_id = i.id
      where ${filtrosAuditoria(neighborhoodId, f)}
    )
    select
      count(*) filter (where status = 'adentro')::int    as adentro,
      count(*) filter (where status = 'concluida')::int  as concluida,
      count(*) filter (where status = 'esperando')::int  as esperando,
      count(*) filter (where status = 'vencida')::int    as vencida,
      count(*) filter (where status = 'anulada')::int    as anulada
    from clasificadas
  `)
  return rows[0] as unknown as Record<AuditStatus, number>
}

async function auditRows(
  neighborhoodId: string,
  f: AuditFilters,
  limit: number,
  offset: number,
): Promise<AuditRow[]> {
  const hoy = todayInBuenosAires()

  const res = await db.execute(sql`
    with uso as (
      select e.invitation_id,
             count(*)::int as veces,
             count(*) filter (where e.exited_at is null)::int as abiertas,
             bool_or(e.source = 'manual') as manual
      from entry_log e
      group by e.invitation_id
    ),
    /*
     * El último ingreso ENTERO, con su salida y sus dos guardias. Antes eran
     * max() por columna: max(nombre) daba el guardia alfabéticamente último, y
     * max(salida) podía ser la de un ingreso anterior al que sigue abierto.
     */
    ultimo as (
      select distinct on (e.invitation_id)
             e.invitation_id, e.entered_at, e.exited_at,
             g.name as guardia, gs.name as guardia_salida
      from entry_log e
      left join person g on g.id = e.guard_id
      left join person gs on gs.id = e.exit_guard_id
      order by e.invitation_id, e.entered_at desc
    )
    select
      i.id,
      i.guest_name                as "guestName",
      i.guest_doc                 as "guestDoc",
      i.plate,
      i.kind,
      i.frequent_as       as "frequentAs",
      t.name                      as "tradeName",
      t.requires_insurance        as "tradeRequiresInsurance",
      i.weekdays,
      i.note,
      (p.role = 'guard')          as porteria,
      pv.insurance_company         as "insuranceCompany",
      pv.insurance_policy          as "insurancePolicy",
      pv.insurance_expires_on::text as "insuranceExpiresOn",
      ve.insurance_company        as "vehicleCompany",
      ve.insurance_policy         as "vehiclePolicy",
      ve.insurance_expires_on::text as "vehicleExpiresOn",
      (p.role = 'guard' and exists (select 1 from entry_log es where es.invitation_id = i.id
        and (es.provider_insurance in ('sin_cargar','vencido') or es.vehicle_insurance in ('sin_cargar','vencido'))))
                                  as "autorizadoSinSeguro",
      u.label                     as "unitLabel",
      case when p.role = 'guard' then ${PORTERIA} else p.name end as "inviterName",
      i.valid_from                as "validFrom",
      i.valid_to                  as "validTo",
      i.created_at                as "createdAt",
      case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.abiertas, 0) > 0 then 'adentro'
        when coalesce(uso.veces, 0) > 0 then 'concluida'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end                         as status,
      ultimo.entered_at           as "enteredAt",
      coalesce(uso.veces, 0)      as "enteredCount",
      ultimo.guardia              as "guardName",
      ultimo.exited_at            as "exitedAt",
      ultimo.guardia_salida       as "exitGuardName",
      coalesce(uso.manual, false) as manual,
      i.revoked_reason            as "revokedReason"
    from invitation i
    join unit u on u.id = i.unit_id
    join person p on p.id = i.created_by
    left join trade t on t.id = i.trade_id
    -- El seguro del proveedor vive en el padrón, por DNI normalizado (lib/padron.ts).
    left join provider pv on pv.neighborhood_id = u.neighborhood_id
      and pv.doc = upper(regexp_replace(coalesce(i.guest_doc, ''), '[^0-9A-Za-z]', '', 'g'))
    left join vehicle ve on ve.neighborhood_id = u.neighborhood_id
      and ve.plate = upper(regexp_replace(coalesce(i.plate, ''), '[^0-9A-Za-z]', '', 'g'))
    left join uso on uso.invitation_id = i.id
    left join ultimo on ultimo.invitation_id = i.id
    where ${filtrosAuditoria(neighborhoodId, f)}
      and (${f.status ?? null}::text is null or ${f.status ?? null}::text = case
        when i.revoked_at is not null then 'anulada'
        when coalesce(uso.abiertas, 0) > 0 then 'adentro'
        when coalesce(uso.veces, 0) > 0 then 'concluida'
        when i.valid_to < ${hoy}::date then 'vencida'
        else 'esperando'
      end)
    order by i.valid_from desc, lower(i.guest_name)
    limit ${limit} offset ${offset}
  `)

  return (res.rows as unknown as (Omit<AuditRow, 'requiresInsurance'> & { tradeRequiresInsurance: boolean | null })[])
    .map(({ tradeRequiresInsurance, ...r }) => ({
      ...r,
      requiresInsurance: pideSeguro(r.kind, r.frequentAs, tradeRequiresInsurance),
    }))
}
