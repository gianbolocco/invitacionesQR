import { db } from './db/index.js'
import { neighborhoods } from './db/schema.js'
import { createPerson } from './services/people.js'

/**
 * Siembra el barrio y su primer admin.
 *
 * Un despliegue es un barrio, así que esto corre una sola vez por instalación y
 * después no vuelve a hacer nada. Del entorno sale solo el mail del admin: el
 * barrio nace con un nombre provisorio y el admin carga nombre, dirección y
 * mapa desde Administración → Barrio, donde igual iba a tener que volver.
 *
 * El admin nace en `invited` con su token: elige la contraseña por el flujo
 * real, el mismo que cualquier vecino. Sin RESEND_API_KEY el link sale por el
 * log del contenedor.
 */
export async function sembrar(): Promise<'sembrado' | 'ya_existe' | 'sin_configurar'> {
  // La base primero y el entorno después: una instalación hecha pide "ya
  // existe", aunque las variables ya no estén. Al revés, el barrio que se
  // configuró a mano gritaría "sin configurar" en cada arranque y alguien iría
  // a buscar un problema que no hay.
  const [existente] = await db.select().from(neighborhoods).limit(1)
  if (existente) return 'ya_existe'

  const email = process.env.ADMIN_EMAIL?.trim()

  // Sin admin no se siembra: un barrio en el que nadie puede entrar no sirve.
  if (!email) return 'sin_configurar'

  const [barrio] = await db.insert(neighborhoods).values({ name: 'Mi barrio' }).returning()

  const { inviteToken } = await createPerson({
    neighborhoodId: barrio.id,
    email,
    name: process.env.ADMIN_NOMBRE?.trim() || 'Admin',
    role: 'admin',
    unitIds: [],
    actorId: null,
  })

  const origen = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  console.log(`\nBarrio "${barrio.name}" creado con el admin ${email}.`)
  console.log(`Link de alta: ${origen}/acceso?t=${inviteToken}\n`)

  return 'sembrado'
}
