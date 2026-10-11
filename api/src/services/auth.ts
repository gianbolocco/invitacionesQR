import { and, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { authTokens, people } from '../db/schema.js'
import { sha256, randomToken } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { sendPasswordResetEmail } from './emails.js'

export type TokenPurpose = 'invite' | 'reset'

/** Mira el token sin consumirlo. Lo usa el GET de la página de acceso. */
export async function peekToken(token: string, purpose: TokenPurpose) {
  const [row] = await db
    .select({ personId: people.id, name: people.name, email: people.email })
    .from(authTokens)
    .innerJoin(people, eq(people.id, authTokens.personId))
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
      ne(people.status, 'disabled'),
    ))
    .limit(1)
  return row ?? null
}

/**
 * Consume el token de forma atómica: el UPDATE condicional con RETURNING hace
 * que, ante dos requests simultáneos con el mismo token, solo uno reciba fila.
 *
 * El token de alguien deshabilitado no sirve: el alta pone la cuenta en
 * 'active', y un link viejo le devolvía el acceso a quien el admin dio de baja.
 */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<string> {
  const updated = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
      inArray(authTokens.personId,
        db.select({ id: people.id }).from(people).where(ne(people.status, 'disabled'))),
    ))
    .returning({ personId: authTokens.personId })

  if (!updated.length) throw new AppError(400, 'invalid_token')
  return updated[0].personId
}

const RESET_MINUTES = 15

/**
 * Emite un token de reset y manda el mail. Devuelve el token en claro, o null
 * si el mail no corresponde a una cuenta activa. El endpoint IGNORA el valor de
 * retorno y responde siempre lo mismo: el token sale por acá solo para que los
 * tests puedan seguir el flujo sin espiar el mail.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const [person] = await db.select().from(people)
    .where(and(eq(people.email, email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  if (!person) return null

  const token = randomToken()
  await db.insert(authTokens).values({
    personId: person.id,
    tokenHash: sha256(token),
    purpose: 'reset',
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
  })

  const url = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/reset?t=${token}`
  /*
   * Sin await, a propósito. Si la respuesta esperara al mail, un mail que
   * existe tardaría lo que tarda Resend y uno que no, nada; y si Resend falla,
   * el que existe daría 500. Las dos cosas dicen quién está en el padrón. El
   * error igual queda en el log: sendMail lo registra.
   */
  void sendPasswordResetEmail(person.email, person.name, url, RESET_MINUTES)
    .catch(() => {})

  return token
}
