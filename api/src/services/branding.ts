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
    logoUpdatedAt: neighborhoods.logoUpdatedAt,
  }).from(neighborhoods).limit(1)

  return {
    // Sin barrio es una instalación recién levantada, antes del seed. No es un
    // error: la página tiene que dibujarse igual.
    nombre: row?.name ?? 'Pazzit',
    color: row?.brandColor ?? COLOR_DEFAULT,
    tieneLogo: Boolean(row?.logoMime),
    logoVersion: row?.logoMime && row.logoUpdatedAt ? row.logoUpdatedAt.getTime() : null,
  }
}

async function idDelBarrio(): Promise<string> {
  const [row] = await db.select({ id: neighborhoods.id }).from(neighborhoods).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  return row.id
}

export async function guardarLogo(bytes: Buffer, actorId: string) {
  const mime = tipoDeImagen(bytes)
  if (!mime) throw new AppError(400, 'formato_no_soportado')

  const id = await idDelBarrio()
  await db.update(neighborhoods).set({ logo: bytes, logoMime: mime, logoUpdatedAt: new Date() }).where(eq(neighborhoods.id, id))

  await audit(actorId, id, 'branding.logo_updated', 'neighborhood', id, { mime })
  return { mime }
}

export async function leerLogo(): Promise<{ bytes: Buffer; mime: string } | null> {
  const [row] = await db.select({ logo: neighborhoods.logo, mime: neighborhoods.logoMime })
    .from(neighborhoods).limit(1)
  if (!row?.logo || !row.mime) return null
  return { bytes: row.logo, mime: row.mime }
}

export async function borrarLogo(actorId: string) {
  const id = await idDelBarrio()
  await db.update(neighborhoods).set({ logo: null, logoMime: null, logoUpdatedAt: null }).where(eq(neighborhoods.id, id))
  await audit(actorId, id, 'branding.logo_removed', 'neighborhood', id)
}
