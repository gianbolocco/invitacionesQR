import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { people } from '../db/schema.js'
import { AppError } from '../lib/errors.js'

export type GooglePayload = { sub: string; email: string; emailVerified: boolean }

export async function linkOrLoginWithGoogle(payload: GooglePayload): Promise<string> {
  // 1) Si ya está vinculado, manda el sub. El mail pudo haber cambiado en Google.
  const [linked] = await db.select().from(people)
    .where(and(eq(people.googleSub, payload.sub), eq(people.status, 'active')))
    .limit(1)
  if (linked) {
    await db.update(people).set({ lastLoginAt: new Date() }).where(eq(people.id, linked.id))
    return linked.id
  }

  // 2) Primera vez: se vincula SOLO por mail verificado. Sin esto, cualquiera
  //    crea una cuenta de Google con el mail de un vecino y se la roba.
  if (!payload.emailVerified) throw new AppError(400, 'email_not_verified')

  const [person] = await db.select().from(people)
    .where(and(eq(people.email, payload.email.toLowerCase().trim()), eq(people.status, 'active')))
    .limit(1)

  // 3) No hay registro abierto: si no está en el padrón, no entra.
  if (!person) throw new AppError(403, 'not_in_padron')

  await db.update(people)
    .set({ googleSub: payload.sub, lastLoginAt: new Date() })
    .where(eq(people.id, person.id))

  return person.id
}
