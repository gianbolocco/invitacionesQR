import {
  pgTable, uuid, text, timestamp, integer, smallint, jsonb, date, primaryKey, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const neighborhoods = pgTable('neighborhood', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // "Cómo llegar" en la página del invitado. Un link de mapas que carga el
  // admin: sin API de mapas, sin clave, sin embeber nada.
  address: text('address'),
  mapUrl: text('map_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const units = pgTable('unit', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  label: text('label').notNull(),
}, (t) => [uniqueIndex('unit_label_uq').on(t.neighborhoodId, t.label)])

export const people = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  neighborhoodId: uuid('neighborhood_id').notNull().references(() => neighborhoods.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('invited'),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('person_email_uq').on(t.neighborhoodId, t.email),
  check('person_role_ck', sql`${t.role} in ('resident','guard','admin')`),
  check('person_status_ck', sql`${t.status} in ('invited','active','disabled')`),
])

export const unitMembers = pgTable('unit_member', {
  unitId: uuid('unit_id').notNull().references(() => units.id),
  personId: uuid('person_id').notNull().references(() => people.id),
}, (t) => [primaryKey({ columns: [t.unitId, t.personId] })])

export const invitations = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  createdBy: uuid('created_by').notNull().references(() => people.id),
  // NULL salvo que sea un anotado a un evento. La hija es una invitación normal
  // con su propio token: la garita no distingue.
  parentId: uuid('parent_id'),
  kind: text('kind').notNull(),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to').notNull(),
  weekdays: smallint('weekdays').array(),
  capacity: integer('capacity').notNull().default(1),
  token: text('token').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invitation_token_uq').on(t.token),
  index('invitation_unit_idx').on(t.unitId, t.validTo),
  index('invitation_creator_idx').on(t.createdBy, t.createdAt),
  index('invitation_parent_idx').on(t.parentId),
  check('invitation_kind_ck', sql`${t.kind} in ('visita','frecuente','evento','proveedor')`),
  check('invitation_window_ck', sql`${t.validTo} >= ${t.validFrom}`),
  check('invitation_capacity_ck', sql`${t.capacity} >= 1`),
])

export const entryLogs = pgTable('entry_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  invitationId: uuid('invitation_id').notNull().references(() => invitations.id),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  guardId: uuid('guard_id').references(() => people.id),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  guestName: text('guest_name').notNull(),
  guestDoc: text('guest_doc'),
  plate: text('plate'),
  note: text('note'),
}, (t) => [
  index('entry_unit_idx').on(t.unitId, t.enteredAt),
  index('entry_invitation_idx').on(t.invitationId),
])

export const auditLogs = pgTable('audit_log', {
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
