import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { neighborhoods } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { COLOR_DEFAULT, tipoDeImagen } from '../lib/marca.js'

/**
 * La marca del barrio, para quien todavía no tiene sesión.
 *
 * Hay una sola fila en `neighborhood` por instalación: un despliegue es un
 * barrio. Por eso no recibe id.
 *
 * El color viene SIEMPRE resuelto. Si lo devolviera en null, cada consumidor
 * tendría que conocer el default y tarde o temprano uno quedaría desfasado.
 */
export async function getBranding() {
  const [row] = await db.select({
    name: neighborhoods.name,
    brandColor: neighborhoods.brandColor,
    logoMime: neighborhoods.logoMime,
  }).from(neighborhoods).limit(1)

  return {
    // Sin barrio es una instalación recién levantada, antes del seed. No es un
    // error: la página tiene que dibujarse igual.
    nombre: row?.name ?? 'VisitPass',
    color: row?.brandColor ?? COLOR_DEFAULT,
    tieneLogo: Boolean(row?.logoMime),
  }
}

const LOGO_DIR = process.env.LOGO_DIR ?? '/data/branding'

/**
 * El archivo se llama como el uuid del barrio, sin extensión.
 *
 * Que el nombre salga de la base y no del cliente es lo que cierra cualquier
 * intento de escribir fuera del directorio: no hay nada que sanitizar porque no
 * hay nada que venga de afuera.
 */
function rutaDe(neighborhoodId: string): string {
  return join(LOGO_DIR, neighborhoodId)
}

async function elBarrio() {
  const [row] = await db.select().from(neighborhoods).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  return row
}

export async function guardarLogo(bytes: Buffer, actorId: string) {
  const mime = tipoDeImagen(bytes)
  if (!mime) throw new AppError(400, 'formato_no_soportado')

  const barrio = await elBarrio()
  await mkdir(LOGO_DIR, { recursive: true })
  await writeFile(rutaDe(barrio.id), bytes)
  await db.update(neighborhoods).set({ logoMime: mime }).where(eq(neighborhoods.id, barrio.id))

  await audit(actorId, barrio.id, 'branding.logo_updated', 'neighborhood', barrio.id, { mime })
  return { mime }
}

export async function leerLogo(): Promise<{ bytes: Buffer; mime: string } | null> {
  const [row] = await db.select().from(neighborhoods).limit(1)
  if (!row?.logoMime) return null
  try {
    return { bytes: await readFile(rutaDe(row.id)), mime: row.logoMime }
  } catch {
    // La columna dice que hay logo y el archivo no está: pasa si se restauró la
    // base sin el volumen. Se trata como "no hay", no como error del servidor.
    return null
  }
}

export async function borrarLogo(actorId: string) {
  const barrio = await elBarrio()
  await rm(rutaDe(barrio.id), { force: true })
  await db.update(neighborhoods).set({ logoMime: null }).where(eq(neighborhoods.id, barrio.id))
  await audit(actorId, barrio.id, 'branding.logo_removed', 'neighborhood', barrio.id)
}
