import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { authTokens, people } from '../db/schema.js'
import { sha256, randomToken } from '../lib/crypto.js'
import { sendMail } from '../lib/mail.js'
import { AppError } from '../lib/errors.js'

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
    ))
    .limit(1)
  return row ?? null
}

/**
 * Consume el token de forma atómica: el UPDATE condicional con RETURNING hace
 * que, ante dos requests simultáneos con el mismo token, solo uno reciba fila.
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
  await sendMail(person.email, 'Restablecer tu contraseña',
    `<p>Hola ${person.name}, para elegir una contraseña nueva entrá acá:</p>
     <p><a href="${url}">Restablecer contraseña</a></p>
     <p>El link vence en ${RESET_MINUTES} minutos. Si no lo pediste, ignorá este mail.</p>`)

  return token
}
