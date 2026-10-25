import {
  pgTable, uuid, text, timestamp, integer, smallint, jsonb, date, boolean, primaryKey, index, uniqueIndex, check,
  customType,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Drizzle no trae bytea. pg ya lo convierte a Buffer y de vuelta.
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

// Va antes que `neighborhoods` solo por el tipo; la tabla `trade` va después.
export type Franja = {
  days: number[]                               // 0 = domingo, como invitation.weekdays
  from: string; to: string                     // 'HH:MM'; `to` excluido, '24:00' vale
  season: { from: string; to: string } | null  // 'MM-DD'; puede cruzar el año
  trades: string[] | null                      // ids de trade; null = todos los rubros
}

export const neighborhoods = pgTable('neighborhood', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // "Cómo llegar" en la página del invitado. Un link de mapas que carga el
  // admin: sin API de mapas, sin clave, sin embeber nada.
  address: text('address'),
  mapUrl: text('map_url'),
  // Hex de la paleta. NULL es el verde del producto: así una instalación nueva
  // no necesita elegir nada para verse bien.
  brandColor: text('brand_color'),
  // 'image/png' o 'image/jpeg'. NULL significa que no hay logo y se muestra el
  // nombre del barrio en itálica.
  logoMime: text('logo_mime'),
  // Los bytes del logo, en la base y no en un volumen: pesa 500 KB como mucho,
  // y así un solo backup de la base cubre todo el barrio.
  logo: bytea('logo'),
  // Cuándo se cambió el logo por última vez. Viaja como versión en la URL del
  // logo: la respuesta se cachea una hora y sin esto se vería el anterior.
  logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
  // El plano del barrio (SVG, PNG o JPG), en la base como el logo. Viaja como
  // versión en la URL por la misma razón.
  mapImage: bytea('map_image'),
  mapImageMime: text('map_image_mime'),
  mapImageUpdatedAt: timestamp('map_image_updated_at', { withTimezone: true }),
  // Horas adentro antes de que la garita avise, por tipo. NULL = ese tipo no
  // alerta. Una frecuente usa la de su subtipo (`invitation.frequent_as`).
  overstayHoursVisita: smallint('overstay_hours_visita'),
  overstayHoursProveedor: smallint('overstay_hours_proveedor'),
  // Franjas de ingreso de proveedores. [] = sin restricción.
  providerWindows: jsonb('provider_windows').$type<Franja[]>().notNull().default([]),
  // Días de anticipación con que se avisa que un seguro está por vencer. NULL = no avisa.
  insuranceWarnDays: smallint('insurance_warn_days'),
  // Seguro del auto. Arranca apagado: un barrio que se actualiza no empieza a
  // frenar autos hasta que el admin lo decide.
  vehicleInsuranceRequired: boolean('vehicle_insurance_required').notNull().default(false),
  // Con el pedido prendido: si la portería puede autorizar igual un auto sin seguro.
  vehicleInsuranceOverride: boolean('vehicle_insurance_override').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('neighborhood_insurance_warn_ck', sql`${t.insuranceWarnDays} between 1 and 90`),
  check('neighborhood_overstay_visita_ck', sql`${t.overstayHoursVisita} between 1 and 72`),
  check('neighborhood_overstay_proveedor_ck', sql`${t.overstayHoursProveedor} between 1 and 72`),
])

export const units = pgTable('unit', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  label: text('label').notNull(),
}, (t) => [uniqueIndex('unit_label_uq').on(t.neighborhoodId, t.label)])

export const people = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  email: text('email'),
  username: text('username'),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('invited'),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Global, no por barrio. Con (neighborhood_id, email) el mismo mail podía
  // existir en dos barrios, y el login —que busca por email/usuario— entraba a
  // uno arbitrario. Se impide el estado en vez de adivinar cuál era.
  uniqueIndex('person_email_uq').on(t.email),
  uniqueIndex('person_username_uq').on(t.username),
  check('person_role_ck', sql`${t.role} in ('resident','guard','admin')`),
  check('person_status_ck', sql`${t.status} in ('invited','active','disabled')`),
  check('person_login_identifier_ck', sql`(
    (${t.role} = 'guard' and (${t.email} is not null or ${t.username} is not null))
    or (${t.role} <> 'guard' and ${t.email} is not null)
  )`),
  check('person_username_role_ck', sql`${t.username} is null or ${t.role} = 'guard'`),
  check('person_username_format_ck', sql`${t.username} is null or ${t.username} ~ '^[a-z0-9][a-z0-9._-]{2,31}$'`),
])

export const unitMembers = pgTable('unit_member', {
  unitId: uuid('unit_id').notNull().references(() => units.id),
  personId: uuid('person_id').notNull().references(() => people.id),
}, (t) => [primaryKey({ columns: [t.unitId, t.personId] })])

export const trades = pgTable('trade', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  name: text('name').notNull(),
  // Se archiva, no se borra: las invitaciones y las franjas lo siguen usando.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  // Los proveedores de este rubro tienen que declarar un seguro vigente.
  requiresInsurance: boolean('requires_insurance').notNull().default(false),
}, (t) => [uniqueIndex('trade_name_uq').on(t.neighborhoodId, sql`lower(${t.name})`)])

export const invitations = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  kind: text('kind').notNull(),
  // Solo en las frecuentes: si viene de visita (la empleada, el profesor) o
  // como proveedor (el jardinero, el pintor de toda la semana). Decide el
  // umbral de la alerta de permanencia y la marca en la garita.
  frequentAs: text('frequent_as'),
  tradeId: uuid('trade_id').references(() => trades.id),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  // Lo que el vecino le deja dicho a la guardia ("viene en un Gol rojo"). No
  // confundir con entry_log.note, que es la observación del guardia en una carga manual.
  note: text('note'),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to').notNull(),
  weekdays: smallint('weekdays').array(),
  capacity: integer('capacity').notNull().default(1),
  token: text('token').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // null = no la anuló la portería (la anuló el vecino, o no está anulada).
  // Distinto de null = la anuló un guardia; '' es "sin motivo", porque el motivo
  // es opcional. Es lo que el vecino lee después: "anulada por portería".
  revokedReason: text('revoked_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invitation_token_uq').on(t.token),
  index('invitation_unit_idx').on(t.unitId, t.validTo),
  index('invitation_creator_idx').on(t.createdBy, t.createdAt),
  // Sin 'evento': un evento es una invitación por invitado, no un tipo aparte.
  check('invitation_kind_ck', sql`${t.kind} in ('visita','frecuente','proveedor')`),
  // Solo una frecuente lo lleva. Una frecuente sin él cuenta como visita: la API
  // siempre lo completa, y así un insert crudo (tests, scripts) no se rompe.
  check('invitation_frequent_as_ck', sql`${t.frequentAs} is null
    or (${t.kind} = 'frecuente' and ${t.frequentAs} in ('visita','proveedor'))`),
  check('invitation_trade_ck', sql`${t.tradeId} is null or ${t.kind} = 'proveedor'
    or (${t.kind} = 'frecuente' and ${t.frequentAs} = 'proveedor')`),
  check('invitation_window_ck', sql`${t.validTo} >= ${t.validFrom}`),
  check('invitation_capacity_ck', sql`${t.capacity} >= 1`),
  check('invitation_note_ck', sql`char_length(${t.note}) <= 140`),
])

export const entryLogs = pgTable('entry_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  invitationId: uuid('invitation_id').notNull().references(() => invitations.id),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  guardId: uuid('guard_id').references(() => people.id),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  // NULL mientras la persona siga adentro. Una visita es UNA fila con sus dos
  // horarios, no dos filas: así un egreso no agrega fila y ningún conteo de
  // cupo cambia de significado.
  exitedAt: timestamp('exited_at', { withTimezone: true }),
  // El guardia de la salida no es el mismo que el de la entrada cuando hubo
  // cambio de turno, y "quién lo dejó pasar" es un dato de auditoría.
  exitGuardId: uuid('exit_guard_id').references(() => people.id),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  note: text('note'),
  // 'manual' = cargado después a mano (un corte de luz, una planilla de papel).
  // La hora es la que se declaró, no la del servidor: la auditoría lo marca.
  source: text('source').notNull().default('normal'),
  loadedBy: uuid('loaded_by').references(() => people.id),
  // Cuándo se cargó a mano. La hora del movimiento es la declarada; esta es la real.
  loadedAt: timestamp('loaded_at', { withTimezone: true }),
  // El estado de cada seguro en el momento del ingreso. El padrón cambia (se
  // renueva una póliza): la auditoría tiene que decir cómo estaba ese día.
  // NULL = fila anterior al padrón, o carga manual (que no controla seguros).
  providerInsurance: text('provider_insurance'),
  vehicleInsurance: text('vehicle_insurance'),
}, (t) => [
  index('entry_unit_idx').on(t.unitId, t.enteredAt),
  index('entry_invitation_idx').on(t.invitationId),
  check('entry_source_ck', sql`${t.source} in ('normal','manual')`),
  check('entry_provider_insurance_ck', sql`${t.providerInsurance} in ('no_aplica','sin_cargar','vencido','por_vencer','vigente')`),
  check('entry_vehicle_insurance_ck', sql`${t.vehicleInsurance} in ('no_aplica','sin_cargar','vencido','por_vencer','vigente')`),
])

/*
 * El padrón del barrio. Sin FK desde la invitación: el DNI es opcional al
 * invitar y la garita es la que lo ve. Se cruza por la clave normalizada
 * (lib/padron.ts). Solo proveedores: de una visita no hay nada que recordar
 * más allá de lo que trae la invitación.
 */
export const providers = pgTable('provider', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  doc: text('doc').notNull(),
  // El último que registró la garita (o la invitación, si vino del link).
  name: text('name').notNull(),
  // El de su último ingreso como proveedor: es el rubro que muestra el listado.
  tradeId: uuid('trade_id').references(() => trades.id),
  insuranceCompany: text('insurance_company'),
  insurancePolicy: text('insurance_policy'),
  insuranceExpiresOn: date('insurance_expires_on'),
  // 'garita' lo vio un guardia; 'link' lo declaró el proveedor.
  insuranceSource: text('insurance_source'),
  insuranceUpdatedBy: uuid('insurance_updated_by').references(() => people.id),
  insuranceUpdatedAt: timestamp('insurance_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('provider_doc_uq').on(t.neighborhoodId, t.doc),
  check('provider_doc_ck', sql`${t.doc} ~ '^[0-9A-Z]+$'`),
  check('provider_insurance_company_ck', sql`char_length(${t.insuranceCompany}) <= 80`),
  check('provider_insurance_policy_ck', sql`char_length(${t.insurancePolicy}) <= 40`),
  check('provider_insurance_all_or_none_ck', sql`(${t.insuranceCompany} is null) = (${t.insurancePolicy} is null)
    and (${t.insurancePolicy} is null) = (${t.insuranceExpiresOn} is null)`),
  check('provider_insurance_source_ck', sql`${t.insuranceSource} in ('garita','link')`),
])

/** Un auto existe en el padrón solo si tiene seguro cargado, y lo carga siempre un guardia. */
export const vehicles = pgTable('vehicle', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  plate: text('plate').notNull(),
  insuranceCompany: text('insurance_company').notNull(),
  insurancePolicy: text('insurance_policy').notNull(),
  insuranceExpiresOn: date('insurance_expires_on').notNull(),
  insuranceUpdatedBy: uuid('insurance_updated_by').references(() => people.id),
  insuranceUpdatedAt: timestamp('insurance_updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vehicle_plate_uq').on(t.neighborhoodId, t.plate),
  check('vehicle_plate_ck', sql`${t.plate} ~ '^[0-9A-Z]+$'`),
  check('vehicle_insurance_company_ck', sql`char_length(${t.insuranceCompany}) <= 80`),
  check('vehicle_insurance_policy_ck', sql`char_length(${t.insurancePolicy}) <= 40`),
])

/*
 * La agenda de una casa: la ven y la editan todos los que viven en la UF,
 * igual que las invitaciones. No se vincula al padrón: el estado del seguro
 * de un proveedor se cruza al leer, por el DNI normalizado.
 */
export const contacts = pgTable('contact', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  // Como lo escribió el vecino ("28.443.120"): se compara normalizado.
  doc: text('doc'),
  tradeId: uuid('trade_id').references(() => trades.id),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('contact_unit_idx').on(t.unitId, t.name),
  check('contact_kind_ck', sql`${t.kind} in ('visita','proveedor')`),
  check('contact_name_ck', sql`char_length(${t.name}) between 1 and 80`),
  check('contact_doc_ck', sql`char_length(${t.doc}) <= 40`),
  check('contact_trade_ck', sql`${t.tradeId} is null or ${t.kind} = 'proveedor'`),
])

export const auditLogs =pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  actorId: uuid('actor_id').references(() => people.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id'),
  meta: jsonb('meta'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_at_idx').on(t.neighborhoodId, t.at)])

export const authTokens = pgTable('auth_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id),
  tokenHash: text('token_hash').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('auth_token_hash_uq').on(t.tokenHash),
  check('auth_token_purpose_ck', sql`${t.purpose} in ('invite','reset')`),
])

// Sin UNIQUE en person_id: una fila por dispositivo, todas válidas a la vez.
export const sessions = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('session_hash_uq').on(t.tokenHash)])
