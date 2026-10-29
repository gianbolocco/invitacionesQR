import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { neighborhoods } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { COLOR_DEFAULT, tipoDeImagen, tipoDePlano } from '../lib/marca.js'

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
    mapImageMime: neighborhoods.mapImageMime,
    mapImageUpdatedAt: neighborhoods.mapImageUpdatedAt,
    packagesEnabled: neighborhoods.packagesEnabled,
  }).from(neighborhoods).limit(1)

  return {
    // Sin barrio es una instalación recién levantada, antes del seed. No es un
    // error: la página tiene que dibujarse igual.
    nombre: row?.name ?? 'Pazzit',
    color: row?.brandColor ?? COLOR_DEFAULT,
    tieneLogo: Boolean(row?.logoMime),
    logoVersion: row?.logoMime && row.logoUpdatedAt ? row.logoUpdatedAt.getTime() : null,
    tienePlano: Boolean(row?.mapImageMime),
    planoVersion: row?.mapImageMime && row.mapImageUpdatedAt ? row.mapImageUpdatedAt.getTime() : null,
    // Config pública del barrio: el vecino decide con esto si ofrece los avisos.
    packagesEnabled: row?.packagesEnabled ?? true,
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

export async function guardarPlano(bytes: Buffer, actorId: string) {
  const mime = tipoDePlano(bytes)
  if (!mime) throw new AppError(400, 'formato_no_soportado')

  const id = await idDelBarrio()
  await db.update(neighborhoods).set({ mapImage: bytes, mapImageMime: mime, mapImageUpdatedAt: new Date() }).where(eq(neighborhoods.id, id))

  await audit(actorId, id, 'branding.plano_updated', 'neighborhood', id, { mime })
  return { mime }
}

export async function leerPlano(): Promise<{ bytes: Buffer; mime: string } | null> {
  const [row] = await db.select({ img: neighborhoods.mapImage, mime: neighborhoods.mapImageMime })
    .from(neighborhoods).limit(1)
  if (!row?.img || !row.mime) return null
  return { bytes: row.img, mime: row.mime }
}

export async function borrarPlano(actorId: string) {
  const id = await idDelBarrio()
  await db.update(neighborhoods).set({ mapImage: null, mapImageMime: null, mapImageUpdatedAt: null }).where(eq(neighborhoods.id, id))
  await audit(actorId, id, 'branding.plano_removed', 'neighborhood', id)
}
