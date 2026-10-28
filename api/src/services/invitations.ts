import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { invitations, entryLogs, people, units, unitMembers, neighborhoods, trades, contacts } from '../db/schema.js'
import { randomToken } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { todayInBuenosAires, unMesDespues } from '../lib/dates.js'
import { AppError } from '../lib/errors.js'
import { valoresDeDelivery, type App } from '../lib/delivery.js'
import { PORTERIA } from '../lib/porteria.js'
import { aplicaFranjas, type Franja } from '../lib/franjas.js'
import { pideSeguro, seguroVigente, type Seguro } from '../lib/seguro.js'
import { buscarProveedor, guardarProveedor, type Executor } from './padron.js'

export type CreateInvitationInput = {
  unitId: string
  createdBy: string
  kind: 'visita' | 'frecuente' | 'proveedor'
  /** Solo cuenta en las frecuentes; sin él, visita. */
  frequentAs?: 'visita' | 'proveedor'
  guestName: string
  guestDoc?: string
  plate?: string
  note?: string
  validFrom: string
  validTo: string
  weekdays?: number[]
  capacity: number
  tradeId?: string | null
  neighborhoodId: string
  /** El contacto del que sale; tiene que ser de la misma UF. */
  contactId?: string
  /** Guarda a quien se invita como contacto nuevo, vinculado a la invitación. */
  saveContact?: boolean
}

export async function assertMemberOfUnit(personId: string, unitId: string): Promise<void> {
  const [row] = await db.select().from(unitMembers)
    .where(and(eq(unitMembers.personId, personId), eq(unitMembers.unitId, unitId)))
    .limit(1)
  if (!row) throw new AppError(403, 'not_your_unit')
}

/** El pase de delivery: lo crea el vecino, dura 2 horas y es para una sola entrada. */
export async function createDeliveryPass(input: { unitId: string; app: App; otro?: string; createdBy: string }) {
  await assertMemberOfUnit(input.createdBy, input.unitId)
  const [inv] = await db.insert(invitations).values({
    unitId: input.unitId, createdBy: input.createdBy,
    ...valoresDeDelivery(input.app, input.otro, new Date()), token: randomToken(16),
  }).returning()
  return inv
}

export async function assertUnitInNeighborhood(
  unitId: string,
  neighborhoodId: string,
  ejecutor: Pick<typeof db, 'select'> = db,
): Promise<void> {
  const [row] = await ejecutor.select().from(units)
    .where(and(eq(units.id, unitId), eq(units.neighborhoodId, neighborhoodId)))
    .limit(1)
  if (!row) throw new AppError(403, 'not_your_neighborhood')
}

export type CreateExpressInvitationInput = {
  unitId: string
  /** Obligatorio salvo en delivery, donde el nombre es la app. */
  guestName?: string
  guestDoc?: string
  plate?: string
  note?: string
  createdBy: string
  neighborhoodId: string
  kind?: 'visita' | 'proveedor' | 'delivery'
  app?: App
  otro?: string
  tradeId?: string | null
}

/**
 * El alta exprés: la crea el guardia cuando alguien llega sin invitación y
 * el vecino aprueba por teléfono. No usa `assertMemberOfUnit` —el guardia
 * nunca es miembro de una unidad— sino que valida que la unidad sea del
 * mismo barrio.
 *
 * Nada de lo que normalmente se elige: es de hoy, una vez, una persona —
 * los mismos defaults que ya tendría una visita de un solo día. La ruta
 * exige el documento siempre; el delivery, además, dura 2 horas.
 */
export async function createExpressInvitation(input: CreateExpressInvitationInput) {
  await assertUnitInNeighborhood(input.unitId, input.neighborhoodId)
  await assertRubro(input.neighborhoodId, input.kind ?? 'visita', null, input.tradeId)

  const [inv] = await db.insert(invitations)
    .values(valoresDePorteria(input, todayInBuenosAires()))
    .returning()

  return inv
}

/** Los valores de una invitación de portería: de un día, una vez, una persona. */
export function valoresDePorteria(input: CreateExpressInvitationInput, dia: string) {
  const base = {
    unitId: input.unitId,
    createdBy: input.createdBy,
    kind: input.kind ?? 'visita',
    tradeId: input.tradeId ?? null,
    guestName: (input.guestName ?? '').trim(),
    guestDoc: input.guestDoc?.trim() || null,
    plate: input.plate?.trim().toUpperCase() || null,
    note: input.note?.trim() || null,
    validFrom: dia,
    validTo: dia,
    capacity: 1,
    token: randomToken(16),
  }
  return input.kind === 'delivery' ? { ...base, ...valoresDeDelivery(input.app!, input.otro, new Date()) } : base
}

/**
 * Una visita frecuente dura hasta un mes: la empleada o el profesor se renuevan
 * cada mes, así la lista no junta gente que ya no viene. La frecuente que viene
 * a trabajar (proveedor) no tiene este tope.
 */
function assertRangoDeFrecuente(kind: string, frequentAs: string | null | undefined, validFrom: string, validTo: string) {
  if (kind === 'frecuente' && (frequentAs ?? 'visita') === 'visita' && validTo > unMesDespues(validFrom)) {
    throw new AppError(400, 'frecuente_mas_de_un_mes')
  }
}

async function assertRubro(neighborhoodId: string, kind: string, frequentAs: string | null, tradeId: string | null | undefined) {
  if (!aplicaFranjas(kind, frequentAs)) {
    if (tradeId) throw new AppError(400, 'rubro_invalido')
    return
  }
  if (tradeId) {
    const [t] = await db.select().from(trades).where(and(eq(trades.id, tradeId),
      eq(trades.neighborhoodId, neighborhoodId), isNull(trades.archivedAt))).limit(1)
    if (!t) throw new AppError(400, 'rubro_invalido')
    return
  }
  const [hay] = await db.select({ id: trades.id }).from(trades)
    .where(and(eq(trades.neighborhoodId, neighborhoodId), isNull(trades.archivedAt))).limit(1)
  if (hay) throw new AppError(400, 'rubro_requerido')
}

async function rubroPideSeguro(tradeId: string | null | undefined): Promise<boolean> {
  if (!tradeId) return false
  const [t] = await db.select({ r: trades.requiresInsurance }).from(trades).where(eq(trades.id, tradeId)).limit(1)
  return t?.r === true
}

/** El seguro solo se carga si el rubro de quien entra a trabajar lo pide; borrarlo (null) siempre se puede. */
export async function assertSeguro(
  kind: string, frequentAs: string | null, tradeId: string | null | undefined, insurance: Seguro | null | undefined,
) {
  if (insurance === undefined || insurance === null) return
  if (!pideSeguro(kind, frequentAs, await rubroPideSeguro(tradeId))) throw new AppError(400, 'seguro_no_aplica')
}

/** Las franjas que le tocan a un rubro: las de todos los rubros y las que lo nombran. */
export function franjasDelRubro(franjas: Franja[], kind: string, frequentAs: string | null, tradeId: string | null): Franja[] {
  if (!aplicaFranjas(kind, frequentAs)) return []
  return franjas.filter((f) => f.trades === null || (tradeId !== null && f.trades.includes(tradeId)))
}

export async function createInvitation(input: CreateInvitationInput) {
  await assertMemberOfUnit(input.createdBy, input.unitId)
  assertRangoDeFrecuente(input.kind, input.frequentAs, input.validFrom, input.validTo)
  const frequentAs = input.kind === 'frecuente' ? (input.frequentAs ?? 'visita') : null
  await assertRubro(input.neighborhoodId, input.kind, frequentAs, input.tradeId)
  if (input.contactId) {
    const [c] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.unitId, input.unitId))).limit(1)
    if (!c) throw new AppError(404, 'contact_not_found')
  }

  // Contacto e invitación juntos: si la invitación falla, no queda un contacto suelto.
  return db.transaction(async (tx) => {
    let contactId = input.contactId ?? null
    if (input.saveContact && !contactId) {
      const kind = input.kind === 'proveedor' || frequentAs === 'proveedor' ? 'proveedor' : 'visita'
      const [c] = await tx.insert(contacts).values({
        unitId: input.unitId, kind, name: input.guestName.trim(), doc: input.guestDoc?.trim() || null,
        tradeId: kind === 'proveedor' ? input.tradeId ?? null : null, createdBy: input.createdBy,
      }).returning({ id: contacts.id })
      contactId = c.id
    }

    const [inv] = await tx.insert(invitations).values({
      unitId: input.unitId,
      createdBy: input.createdBy,
      kind: input.kind,
      frequentAs,
      tradeId: input.tradeId ?? null,
      contactId,
      guestName: input.guestName.trim(),
      guestDoc: input.guestDoc?.trim() || null,
      plate: input.plate?.trim().toUpperCase() || null,
      note: input.note?.trim() || null,
      validFrom: input.validFrom,
      validTo: input.validTo,
      weekdays: input.weekdays?.length ? input.weekdays : null,
      capacity: input.capacity,
      token: randomToken(16),
    }).returning()
    return inv
  })
}

/**
 * El DNI que la garita registra completa el contacto del que salió la
 * invitación, si no tenía. Nunca pisa uno ya cargado: si no coincide, puede
 * ser otra persona, y eso lo corrige el vecino, que sabe quién es.
 */
export async function completarDocContacto(tx: Executor, contactId: string | null, doc: string): Promise<void> {
  if (!contactId || !doc.trim()) return
  await tx.update(contacts).set({ doc: doc.trim() }).where(and(eq(contacts.id, contactId), isNull(contacts.doc)))
}

/*
 * Las columnas de una invitación tal como las ve el vecino. Las usan la home,
 * el historial y el detalle: una sola definición para que las tres pantallas
 * no se desfasen. Requiere el join con people, units y entry_log y el group by
 * de abajo.
 */
const adentroSql = sql<boolean>`coalesce(bool_or(${entryLogs.id} is not null and ${entryLogs.exitedAt} is null), false)`

/**
 * Cuando quien creó la invitación es un guardia (alta exprés por teléfono),
 * se muestra esta etiqueta en vez de su nombre: no es el vecino que invita,
 * y mostrar el nombre del guardia da la impresión de que invitó él
 * personalmente a un desconocido.
 */
const nombreOEtiquetaSql = sql<string>`case when ${people.role} = 'guard' then ${PORTERIA} else ${people.name} end`

const columnas = {
  id: invitations.id,
  kind: invitations.kind,
  frequentAs: invitations.frequentAs,
  guestName: invitations.guestName,
  guestDoc: invitations.guestDoc,
  plate: invitations.plate,
  note: invitations.note,
  validFrom: invitations.validFrom,
  validTo: invitations.validTo,
  weekdays: invitations.weekdays,
  capacity: invitations.capacity,
  token: invitations.token,
  revokedAt: invitations.revokedAt,
  revokedReason: invitations.revokedReason,
  createdAt: invitations.createdAt,
  createdBy: invitations.createdBy,
  tradeId: invitations.tradeId,
  tradeName: trades.name,
  requiresInsurance: trades.requiresInsurance,
  creatorName: nombreOEtiquetaSql,
  unitId: invitations.unitId,
  unitLabel: units.label,
  usedCount: count(entryLogs.id),
  // Hay un ingreso sin salida: la persona está en el barrio ahora.
  adentro: adentroSql,
  ultimoIngreso: sql<Date | null>`max(${entryLogs.enteredAt})`,
}

function consultaInvitaciones() {
  return db.select(columnas)
    .from(invitations)
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(units, eq(units.id, invitations.unitId))
    .leftJoin(trades, eq(trades.id, invitations.tradeId))
    .leftJoin(entryLogs, eq(entryLogs.invitationId, invitations.id))
    .$dynamic()
}

/**
 * Las invitaciones VIGENTES de las UF indicadas, con cuántas veces se usó cada
 * una. Es lo que muestra la home del vecino; el pasado vive en el historial.
 *
 * El filtro está acá y no en el navegador porque antes esto devolvía todas las
 * invitaciones que la unidad tuvo en su vida —50 filas y 23 KB para mostrar 12,
 * en una base de unas semanas— y solo empeora con el tiempo.
 *
 * "Vigente" es: no anulada, todavía dentro de la ventana, y con cupo libre O
 * con alguien adentro ahora mismo. El día de la semana NO entra: una frecuente
 * de lunes y miércoles sigue siendo una invitación vigente un martes.
 */
export async function listForUnits(unitIds: string[]) {
  if (!unitIds.length) return []
  const hoy = todayInBuenosAires()
  return consultaInvitaciones()
    .where(and(
      inArray(invitations.unitId, unitIds),
      isNull(invitations.revokedAt),
      gte(invitations.validTo, hoy),
    ))
    .groupBy(invitations.id, people.name, people.role, units.label, trades.name, trades.requiresInsurance)
    // El cupo se mide sobre el count de ingresos, así que va en HAVING. Quien
    // está adentro sigue en la home aunque haya agotado el cupo: es justo lo
    // que el vecino quiere ver ("ya llegó").
    .having(sql`count(${entryLogs.id}) < ${invitations.capacity} or ${adentroSql}`)
    .orderBy(desc(invitations.createdAt))
}

export type HistoryFilters = {
  q?: string
  kind?: 'visita' | 'frecuente' | 'proveedor' | 'delivery'
  estado?: 'entro' | 'no_entro' | 'anulada'
  /** Id del vecino, para el filtro "solo las mías". */
  createdBy?: string
  page?: number
  pageSize?: number
}

export type HistoryPage = {
  rows: Awaited<ReturnType<typeof listForUnits>>
  total: number
  page: number
  pageSize: number
}

/**
 * El historial: lo mismo que la lista, pero buscable, filtrable y paginado.
 *
 * El filtro y el conteo van del lado del servidor. Filtrar la página que llegó
 * daría un "3 resultados" que en realidad son 3 de esta página, y el buscador
 * no encontraría a nadie que esté más atrás en el tiempo.
 *
 * El estado se resuelve con un EXISTS sobre entry_log y no con el count de
 * ingresos: así la condición entra en el WHERE y el total sale de un count
 * simple, sin que el join de ingresos multiplique filas.
 */
export async function searchInvitations(
  unitIds: string[],
  f: HistoryFilters,
): Promise<HistoryPage> {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 20))
  if (!unitIds.length) return { rows: [], total: 0, page, pageSize }

  const entro = sql`exists (select 1 from entry_log e where e.invitation_id = ${invitations.id})`

  const donde = and(
    inArray(invitations.unitId, unitIds),
    f.kind ? eq(invitations.kind, f.kind) : undefined,
    f.createdBy ? eq(invitations.createdBy, f.createdBy) : undefined,
    // unaccent para que "martin" encuentre a "Martín". Documento y patente van
    // sin unaccent: no llevan tildes.
    f.q
      ? sql`(unaccent(${invitations.guestName}) ilike unaccent(${'%' + f.q + '%'})
             or ${invitations.guestDoc} ilike ${'%' + f.q + '%'}
             or ${invitations.plate} ilike ${'%' + f.q + '%'})`
      : undefined,
    f.estado === 'anulada' ? sql`${invitations.revokedAt} is not null` : undefined,
    f.estado === 'entro' ? and(isNull(invitations.revokedAt), entro) : undefined,
    f.estado === 'no_entro' ? and(isNull(invitations.revokedAt), sql`not ${entro}`) : undefined,
  )

  const [rows, [conteo]] = await Promise.all([
    consultaInvitaciones()
      .where(donde)
      .groupBy(invitations.id, people.name, people.role, units.label, trades.name, trades.requiresInsurance)
      .orderBy(desc(invitations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` })
      .from(invitations)
      .where(donde),
  ])

  return { rows, total: conteo?.n ?? 0, page, pageSize }
}

/**
 * Una invitación, con lo mismo que muestra la lista. Cualquier estado: el
 * detalle se abre también desde el historial (anuladas, vencidas, usadas).
 * Solo para quien es de la unidad.
 */
export async function getInvitation(id: string, personId: string) {
  const [row] = await consultaInvitaciones()
    .where(eq(invitations.id, id))
    .groupBy(invitations.id, people.name, people.role, units.label, trades.name, trades.requiresInsurance)
    .limit(1)
  if (!row) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, row.unitId)
  return row
}

/** Hay una fila de esa invitación sin salida registrada: el invitado sigue adentro. */
async function estaAdentro(invitationId: string): Promise<boolean> {
  const [row] = await db.select({ id: entryLogs.id }).from(entryLogs)
    .where(and(eq(entryLogs.invitationId, invitationId), isNull(entryLogs.exitedAt)))
    .limit(1)
  return Boolean(row)
}

/**
 * No se puede anular con el invitado adentro: confundiría al guardia si lo
 * mira en ese momento, y no tiene sentido retirarle el acceso a alguien que
 * ya está físicamente en el barrio. Una vez que sale, se puede anular igual
 * que cualquier otra — ya cumplió su propósito.
 */
export async function revokeInvitation(id: string, personId: string, neighborhoodId: string): Promise<void> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)
  if (await estaAdentro(id)) throw new AppError(409, 'guest_inside')

  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id))
  await audit(personId, neighborhoodId, 'invitation.revoked', 'invitation', id)
}

/**
 * La portería anula una invitación, con un motivo si quiere dejarlo.
 *
 * Mismas reglas que cuando anula el vecino —no se anula con el invitado
 * adentro— más dos: queda marcada como anulada por la portería, con el motivo
 * si lo hubo (el vecino lo lee: "anulada por portería: …"), y la anulación se
 * puede deshacer SOLO desde la casa (restoreInvitation pide ser miembro de la
 * unidad). Quién anuló y cuándo queda en el audit_log.
 */
export async function revokeByGuard(
  id: string,
  guardId: string,
  neighborhoodId: string,
  reason: string | undefined,
): Promise<void> {
  const motivo = (reason ?? '').trim()

  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertUnitInNeighborhood(inv.unitId, neighborhoodId)
  if (inv.revokedAt) throw new AppError(409, 'already_revoked')
  if (await estaAdentro(id)) throw new AppError(409, 'guest_inside')

  await db.update(invitations).set({ revokedAt: new Date(), revokedReason: motivo }).where(eq(invitations.id, id))
  await audit(guardId, neighborhoodId, 'invitation.revoked_by_guard', 'invitation', id, { reason: motivo || null })
}

/**
 * Datos públicos del QR. Muestra quién invita, la unidad y cómo llegar: es una
 * apertura deliberada respecto de la versión anterior, que exponía lo mínimo.
 * Un link reenviado deja saber quién vive en esa unidad; se acepta porque el
 * invitado necesita saber de parte de quién viene el acceso. Nunca el mail.
 */
export async function findPublicByToken(token: string) {
  const [row] = await db.select({
    id: invitations.id,
    guestName: invitations.guestName,
    guestDoc: invitations.guestDoc,
    plate: invitations.plate,
    kind: invitations.kind,
    frequentAs: invitations.frequentAs,
    tradeId: invitations.tradeId,
    tradeName: trades.name,
    tradeRequiresInsurance: trades.requiresInsurance,
    neighborhoodId: neighborhoods.id,
    providerWindows: neighborhoods.providerWindows,
    validFrom: invitations.validFrom,
    validTo: invitations.validTo,
    revokedAt: invitations.revokedAt,
    unitLabel: units.label,
    inviterName: nombreOEtiquetaSql,
    neighborhoodName: neighborhoods.name,
    address: neighborhoods.address,
    mapUrl: neighborhoods.mapUrl,
  })
    .from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .innerJoin(people, eq(people.id, invitations.createdBy))
    .innerJoin(neighborhoods, eq(neighborhoods.id, units.neighborhoodId))
    .leftJoin(trades, eq(trades.id, invitations.tradeId))
    .where(eq(invitations.token, token))
    .limit(1)

  if (!row) return null

  const proveedor = row.guestDoc ? await buscarProveedor(row.neighborhoodId, row.guestDoc) : null
  const s = proveedor?.insurance ?? null
  const insuranceState = !s ? 'sin_cargar' : !seguroVigente(s.expiresOn, new Date()) ? 'vencido' : 'vigente'

  return {
    guestName: row.guestName,
    kind: row.kind,
    tradeName: row.tradeName,
    // Solo el estado: el link puede estar en manos de cualquiera, los datos no salen.
    requiresInsurance: pideSeguro(row.kind, row.frequentAs, row.tradeRequiresInsurance),
    insuranceState,
    // El vencimiento sí ("tu seguro vence el 12/03"): compañía y póliza nunca.
    insuranceExpiresOn: s?.expiresOn ?? null,
    insuranceVerified: seguroVerificado(proveedor),
    franjas: franjasDelRubro(row.providerWindows, row.kind, row.frequentAs, row.tradeId),
    validFrom: row.validFrom,
    validTo: row.validTo,
    revokedAt: row.revokedAt,
    unitLabel: row.unitLabel,
    inviterName: row.inviterName,
    neighborhood: { name: row.neighborhoodName, address: row.address, mapUrl: row.mapUrl },
    // Solo se informa si YA hay datos, nunca cuáles: el link puede estar en
    // manos de cualquiera.
    hasDoc: Boolean(row.guestDoc),
    hasPlate: Boolean(row.plate),
    frozen: (await entriesOf(row.id)) > 0,
  }
}

function seguroVerificado(p: Awaited<ReturnType<typeof buscarProveedor>>): boolean {
  return p?.insuranceSource === 'garita' && !!p.insurance && seguroVigente(p.insurance.expiresOn, new Date())
}

async function entriesOf(invitationId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(entryLogs).where(eq(entryLogs.invitationId, invitationId))
  return row?.n ?? 0
}

/**
 * El invitado carga su propio documento y patente desde el link.
 *
 * Escribe SOLO esos dos campos, y solo si están vacíos: un link reenviado no
 * puede pisar lo que cargó el vecino. Nunca nombre, fechas, cupo ni unidad.
 * No bloquea nada — si el invitado no completa, todo sigue funcionando.
 */
export async function fillGuestDetails(
  token: string,
  data: { guestDoc?: string; plate?: string; insurance?: Seguro },
): Promise<void> {
  const [fila] = await db.select({ inv: invitations, nid: units.neighborhoodId }).from(invitations)
    .innerJoin(units, eq(units.id, invitations.unitId))
    .where(eq(invitations.token, token)).limit(1)
  if (!fila) throw new AppError(404, 'not_found')
  const { inv, nid } = fila
  if (inv.revokedAt) throw new AppError(409, 'revoked')

  // Una vez que entró, entry_log ya guardó su copia: documento y patente no se
  // reescriben. El seguro sí se puede renovar: es lo que el proveedor frecuente necesita.
  if ((data.guestDoc !== undefined || data.plate !== undefined) && (await entriesOf(inv.id)) > 0) {
    throw new AppError(409, 'already_entered')
  }
  // El link lo tiene cualquiera: no puede cargar una póliza que ya venció.
  if (data.insurance && data.insurance.expiresOn < todayInBuenosAires()) throw new AppError(400, 'seguro_vencido')
  await assertSeguro(inv.kind, inv.frequentAs, inv.tradeId, data.insurance)

  const patch: { guestDoc?: string; plate?: string } = {}
  if (!inv.guestDoc && data.guestDoc?.trim()) patch.guestDoc = data.guestDoc.trim()
  if (!inv.plate && data.plate?.trim()) patch.plate = data.plate.trim().toUpperCase()

  // El seguro vive en el padrón, por DNI: sin DNI no hay a quién asignarlo.
  // Vale el de la invitación; si no tenía, el que manda el proveedor ahora.
  const doc = inv.guestDoc ?? patch.guestDoc
  if (data.insurance && !doc) throw new AppError(400, 'doc_required')

  // Lo que verificó la guardia (con la póliza a la vista) no lo pisa un link que
  // tiene cualquiera; recién cuando vence el link puede cargar uno nuevo.
  if (data.insurance && seguroVerificado(await buscarProveedor(nid, doc!))) throw new AppError(409, 'seguro_verificado')

  await db.transaction(async (tx) => {
    // El contacto no se completa desde acá: el link lo tiene cualquiera. Lo
    // completa la garita, que ve el documento (completarDocContacto).
    if (Object.keys(patch).length) await tx.update(invitations).set(patch).where(eq(invitations.id, inv.id))
    if (data.insurance) {
      await guardarProveedor(tx, {
        neighborhoodId: nid, doc: doc!, name: inv.guestName, tradeId: inv.tradeId,
        insurance: data.insurance, source: 'link', actorId: null,
      })
    }
  })
}

/** Deshacer una anulación. */
export async function restoreInvitation(
  id: string,
  personId: string,
  neighborhoodId: string,
): Promise<void> {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)
  if (!inv.revokedAt) return

  await db.update(invitations).set({ revokedAt: null, revokedReason: null }).where(eq(invitations.id, id))
  await audit(personId, neighborhoodId, 'invitation.restored', 'invitation', id)
}

export type EditInvitationInput = {
  guestName?: string
  guestDoc?: string | null
  plate?: string | null
  note?: string | null
  validFrom?: string
  validTo?: string
  weekdays?: number[] | null
  capacity?: number
  frequentAs?: 'visita' | 'proveedor'
  tradeId?: string | null
}

/**
 * Editar una invitación ya creada.
 *
 * Solo mientras está pendiente: sin anular, sin ningún ingreso y sin vencer.
 * Una vez usada, la auditoría muestra los datos de la invitación, y editarla
 * reescribiría quién entró; para volver a usarla está "Volver a invitar", que
 * crea otra. Vencida, lo mismo.
 *
 * No se puede cambiar de unidad ni de tipo: eso es otra invitación, no la misma
 * editada, y el guardia ya vio la anterior.
 */
export async function editInvitation(
  id: string,
  personId: string,
  input: EditInvitationInput,
  neighborhoodId: string,
) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
  if (!inv) throw new AppError(404, 'not_found')
  await assertMemberOfUnit(personId, inv.unitId)

  if (inv.revokedAt) throw new AppError(409, 'revoked')
  if ((await entriesOf(inv.id)) > 0) throw new AppError(409, 'ya_usada')
  if (inv.validTo < todayInBuenosAires()) throw new AppError(409, 'vencida')

  const validFrom = input.validFrom ?? inv.validFrom
  const validTo = input.validTo ?? inv.validTo
  if (validTo < validFrom) throw new AppError(400, 'ventana_invertida')

  const capacity = input.capacity ?? inv.capacity
  if (input.frequentAs !== undefined && inv.kind !== 'frecuente') throw new AppError(400, 'no_es_frecuente')
  // Solo si cambia algo que lo afecta: una frecuente vieja de un año se sigue
  // pudiendo corregir (el nombre, el DNI) sin obligar a acortarla.
  const cambiaRango = validFrom !== inv.validFrom || validTo !== inv.validTo
    || (input.frequentAs !== undefined && input.frequentAs !== inv.frequentAs)
  if (cambiaRango) assertRangoDeFrecuente(inv.kind, input.frequentAs ?? inv.frequentAs, validFrom, validTo)

  // El rubro se revalida solo si cambia algo que lo afecta (un rubro archivado no traba editar el nombre). Pasar a visita lo limpia.
  const frequentAs = input.frequentAs ?? inv.frequentAs
  let tradeId: string | null | undefined = input.tradeId
  if (input.frequentAs === 'visita') tradeId = null
  else if (
    (input.tradeId !== undefined && input.tradeId !== inv.tradeId)
    || (input.frequentAs !== undefined && input.frequentAs !== inv.frequentAs)
  ) {
    await assertRubro(neighborhoodId, inv.kind, frequentAs, input.tradeId === undefined ? inv.tradeId : input.tradeId)
  }

  const [actualizada] = await db.update(invitations).set({
    ...(tradeId !== undefined ? { tradeId } : {}),
    ...(input.guestName !== undefined ? { guestName: input.guestName.trim() } : {}),
    ...(input.guestDoc !== undefined ? { guestDoc: input.guestDoc?.trim() || null } : {}),
    ...(input.plate !== undefined ? { plate: input.plate?.trim().toUpperCase() || null } : {}),
    ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
    validFrom,
    validTo,
    ...(input.weekdays !== undefined ? { weekdays: input.weekdays?.length ? input.weekdays : null } : {}),
    capacity,
    ...(input.frequentAs !== undefined ? { frequentAs: input.frequentAs } : {}),
  }).where(eq(invitations.id, id)).returning()

  return actualizada
}
