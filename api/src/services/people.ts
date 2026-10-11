import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people, unitMembers, authTokens, units } from '../db/schema.js'
import { randomToken, sha256, hashPassword } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'
import { sendMail } from '../lib/mail.js'
import { revokeAllSessions } from './sessions.js'
import { AppError } from '../lib/errors.js'

const INVITE_DAYS = 7

/**
 * Si el error viene de violar esa constraint.
 *
 * Drizzle envuelve los errores de pg: el mensaje es "Failed query: …" y el
 * nombre de la constraint vive en `cause.constraint`.
 */
function violates(err: unknown, constraint: string): boolean {
  return (err as { cause?: { constraint?: string } })?.cause?.constraint === constraint
}

export type CreatePersonInput = {
  neighborhoodId: string
  email: string
  name: string
  role: 'resident' | 'guard' | 'admin'
  unitIds: string[]
  actorId: string | null
}

export async function createPerson(input: CreatePersonInput) {
  /*
   * El mail es único en todo el sistema, no por barrio. Se deja que la base lo
   * rechace en vez de consultar antes: un SELECT previo no cierra la ventana
   * entre la lectura y el INSERT, y el índice sí.
   */
  const [person] = await db.insert(people).values({
    neighborhoodId: input.neighborhoodId,
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role,
    status: 'invited',
  }).returning().catch((err: unknown) => {
    if (violates(err, 'person_email_uq')) throw new AppError(409, 'mail_repetido')
    throw err
  })

  if (input.unitIds.length) {
    await db.insert(unitMembers).values(input.unitIds.map((unitId) => ({ unitId, personId: person.id })))
  }

  const inviteToken = await issueInviteToken(person.id)

  await audit(input.actorId, input.neighborhoodId, 'person.created', 'person', person.id, { role: input.role })

  /*
   * El mail va al final y su falla no deshace el alta: la persona ya existe, y
   * tirar un 500 acá hacía que el admin reintentara y chocara con
   * "mail_repetido" sin que nadie hubiera recibido nada. Se le avisa y reenvía.
   */
  const mailEnviado = await sendInviteMail(person.email, person.name, inviteToken)
    .then(() => true, () => false)

  return { person, inviteToken, mailEnviado }
}

async function issueInviteToken(personId: string): Promise<string> {
  const token = randomToken()
  await db.insert(authTokens).values({
    personId,
    tokenHash: sha256(token),
    purpose: 'invite',
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })
  return token
}

export async function sendInviteMail(email: string, name: string, token: string): Promise<void> {
  const url = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/acceso?t=${token}`
  await sendMail(
    email,
    'Ya podés gestionar las visitas de tu casa',
    `<p>Hola ${name}, la administración te dio de alta en el sistema de invitaciones.</p>
     <p><a href="${url}">Entrar y crear mi contraseña</a></p>
     <p>El link vence en ${INVITE_DAYS} días.</p>`,
  )
}

/**
 * Cambia la contraseña y cierra TODAS las sesiones abiertas de esa persona.
 *
 * Las dos cosas van juntas acá y no en cada endpoint porque los tres caminos
 * —alta, "olvidé mi contraseña" y reset del admin— pasan por esta función, y
 * uno solo que se olvidara dejaría viva la sesión que se quería echar.
 *
 * Quien tenga que seguir adentro (el que hace su propio reset) crea su sesión
 * DESPUÉS de esto, así que no se autoexpulsa.
 */
export async function setPassword(personId: string, plain: string): Promise<void> {
  await db.update(people).set({ passwordHash: await hashPassword(plain) }).where(eq(people.id, personId))
  await revokeAllSessions(personId)
}

export async function listPeople(neighborhoodId: string) {
  const rows = await db.select({
    id: people.id, email: people.email, name: people.name, role: people.role,
    status: people.status, lastLoginAt: people.lastLoginAt,
    unitId: units.id, unitLabel: units.label,
  })
    .from(people)
    .leftJoin(unitMembers, eq(unitMembers.personId, people.id))
    .leftJoin(units, eq(units.id, unitMembers.unitId))
    .where(eq(people.neighborhoodId, neighborhoodId))

  // Una fila por (persona, UF) -> se agrupa en memoria. El padrón de un barrio
  // entra de sobra en RAM; no justifica un json_agg.
  const byId = new Map<string, {
    id: string; email: string; name: string; role: string; status: string
    lastLoginAt: Date | null; units: { id: string; label: string }[]
  }>()

  for (const r of rows) {
    const current = byId.get(r.id) ?? {
      id: r.id, email: r.email, name: r.name, role: r.role,
      status: r.status, lastLoginAt: r.lastLoginAt, units: [],
    }
    if (r.unitId && r.unitLabel) current.units.push({ id: r.unitId, label: r.unitLabel })
    byId.set(r.id, current)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/*
 * Estas funciones reciben neighborhoodId y solo lo usan para el audit log:
 * buscan la persona por id y nada más. Es deliberado. Un despliegue es un
 * barrio, así que hay una sola fila en `neighborhood` y toda persona pertenece
 * a ella; filtrar por barrio no cambiaría ningún resultado.
 *
 * Si alguna vez varios barrios comparten una base, esto SÍ hay que filtrarlo, y
 * lo mismo en units.ts (setPersonLot) y entries.ts (loadForCheck).
 */
export async function disablePerson(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  await db.update(people).set({ status: 'disabled' }).where(eq(people.id, personId))
  // Los links pendientes (alta, reset) mueren con la baja. Si se la reactiva,
  // el admin le reenvía uno nuevo.
  await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.personId, personId), isNull(authTokens.usedAt)))
  await audit(actorId, neighborhoodId, 'person.disabled', 'person', personId)
}

export async function resendInvite(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
  if (!person) throw new AppError(404, 'not_found')
  // A alguien dado de baja primero se lo reactiva: el link no puede ser la
  // puerta trasera de la baja.
  if (person.status === 'disabled') throw new AppError(409, 'deshabilitada')

  const token = await issueInviteToken(personId)
  // Acá el mail ES la acción: si no salió, el admin lo tiene que saber.
  await sendInviteMail(person.email, person.name, token).catch(() => {
    throw new AppError(502, 'mail_no_enviado')
  })
  await audit(actorId, neighborhoodId, 'person.reinvited', 'person', personId)
}

export async function setGuardPassword(
  personId: string, plain: string, actorId: string, neighborhoodId: string,
): Promise<void> {
  await setPassword(personId, plain)
  await db.update(people).set({ status: 'active' }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'guard.password_reset', 'person', personId)
}

export async function enablePerson(personId: string, actorId: string, neighborhoodId: string): Promise<void> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1)
  if (!person) throw new AppError(404, 'not_found')

  // Vuelve a 'invited' si nunca llegó a entrar: sin contraseña ni Google no
  // podría loguear, y 'active' mentiría sobre el estado de la cuenta.
  const status = person.passwordHash || person.googleSub ? 'active' : 'invited'
  await db.update(people).set({ status }).where(eq(people.id, personId))
  await audit(actorId, neighborhoodId, 'person.enabled', 'person', personId, { status })
}
