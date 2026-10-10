import { db } from './db/index.js'
import { neighborhoods } from './db/schema.js'
import { createPerson } from './services/people.js'

/**
 * Siembra el barrio y su primer admin desde el entorno.
 *
 * Un despliegue es un barrio, así que esto corre una sola vez por instalación y
 * después no vuelve a hacer nada. Instalar un barrio nuevo es clonar el recurso
 * y cambiar estas variables; no hay pantalla de alta porque una pantalla que se
 * usa una vez y queda muerta es peor que cuatro variables.
 *
 * El admin nace en `invited` con su token: elige la contraseña por el flujo
 * real, el mismo que cualquier vecino. Sin RESEND_API_KEY el link sale por el
 * log del contenedor.
 */
export async function sembrar(): Promise<'sembrado' | 'ya_existe' | 'sin_configurar'> {
  const nombre = process.env.BARRIO_NOMBRE?.trim()
  const email = process.env.ADMIN_EMAIL?.trim()

  // Faltando cualquiera de las dos no se siembra: es el caso de una base que se
  // configuró a mano, y adivinar sería peor.
  if (!nombre || !email) return 'sin_configurar'

  const [existente] = await db.select().from(neighborhoods).limit(1)
  if (existente) return 'ya_existe'

  const [barrio] = await db.insert(neighborhoods).values({
    name: nombre,
    address: process.env.BARRIO_DIRECCION?.trim() || null,
    mapUrl: process.env.BARRIO_MAPA?.trim() || null,
  }).returning()

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
