import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db/index.js'
import { authTokens, neighborhoods, people } from './db/schema.js'
import { audit } from './lib/audit.js'
import { randomToken, sha256 } from './lib/crypto.js'
import { createPerson, sendInviteMail } from './services/people.js'

/**
 * Da de alta un admin desde la terminal del contenedor. Es la instalación:
 * con la base vacía crea también el barrio, como "Mi barrio", y el admin le
 * carga nombre, dirección y mapa desde Administración → Barrio.
 *
 * No hay pantalla de alta ni variables de entorno: quien instala ya tiene la
 * terminal de Coolify, y una pantalla que se usa una vez y queda expuesta es
 * peor que un comando. Sirve también para recuperar un barrio que perdió a su
 * admin, y con un admin que no llegó a entrar reemite el link.
 *
 * El admin nace en `invited`: elige la contraseña por el flujo real, el mismo
 * que cualquier vecino. Sin RESEND_API_KEY el link sale solo por la terminal.
 */
export async function crearAdmin(email: string, nombre: string): Promise<{ resultado: 'creado' | 'reinvitado'; link: string }> {
  email = email.trim().toLowerCase()
  const origen = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

  let [barrio] = await db.select().from(neighborhoods).limit(1)
  barrio ??= (await db.insert(neighborhoods).values({ name: 'Mi barrio' }).returning())[0]

  const [existente] = await db.select().from(people).where(eq(people.email, email)).limit(1)
  if (!existente) {
    const { inviteToken } = await createPerson({
      neighborhoodId: barrio.id, email, name: nombre, role: 'admin', unitIds: [], actorId: null,
    })
    return { resultado: 'creado', link: `${origen}/acceso?t=${inviteToken}` }
  }

  // Solo se reinvita a un admin que nunca entró: a cualquier otro, un link
  // nuevo le cambiaría la contraseña a alguien que ya tiene cuenta.
  if (existente.role !== 'admin' || existente.status !== 'invited') {
    throw new Error(`${email} ya tiene cuenta (${existente.role}, ${existente.status}). Para recuperarla, "olvidé mi contraseña".`)
  }

  const token = randomToken()
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(
    eq(authTokens.personId, existente.id),
    eq(authTokens.purpose, 'invite'),
    isNull(authTokens.usedAt),
  ))
  await db.insert(authTokens).values({
    personId: existente.id,
    tokenHash: sha256(token),
    purpose: 'invite',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  })
  await audit(null, existente.neighborhoodId, 'person.reinvited', 'person', existente.id)
  // El link ya está en la terminal: que falle el mail no deshace nada.
  await sendInviteMail(email, existente.name, token).catch((e: unknown) => console.error('No salió el mail:', e))

  return { resultado: 'reinvitado', link: `${origen}/acceso?t=${token}` }
}
