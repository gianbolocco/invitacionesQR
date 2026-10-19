import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { neighborhoods } from '../db/schema.js'
import { audit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { PALETA, esColorDeLaPaleta } from '../lib/marca.js'

export async function getNeighborhood(id: string) {
  const [row] = await db.select({
    id: neighborhoods.id,
    name: neighborhoods.name,
    address: neighborhoods.address,
    mapUrl: neighborhoods.mapUrl,
    brandColor: neighborhoods.brandColor,
    visita: neighborhoods.overstayHoursVisita,
    proveedor: neighborhoods.overstayHoursProveedor,
  }).from(neighborhoods).where(eq(neighborhoods.id, id)).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  const { visita, proveedor, ...barrio } = row
  // La paleta viaja con el barrio para que el front no la duplique: si alguna
  // vez cambia, cambia en un solo lado.
  return { ...barrio, overstayHours: { visita, proveedor }, paleta: PALETA }
}

export async function updateNeighborhood(
  id: string,
  actorId: string,
  data: {
    name?: string; address?: string; mapUrl?: string; brandColor?: string
    overstayHours?: { visita?: number | null; proveedor?: number | null }
  },
) {
  if (data.brandColor !== undefined && !esColorDeLaPaleta(data.brandColor)) {
    throw new AppError(400, 'color_invalido')
  }

  // Los strings vacíos se guardan como NULL: así el front sabe que no hay dato
  // y no muestra un "Cómo llegar" que no lleva a ningún lado.
  await db.update(neighborhoods).set({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.address !== undefined ? { address: data.address.trim() || null } : {}),
    ...(data.mapUrl !== undefined ? { mapUrl: data.mapUrl.trim() || null } : {}),
    ...(data.brandColor !== undefined ? { brandColor: data.brandColor } : {}),
    // Una clave que no viene no se toca; null la apaga.
    ...(data.overstayHours?.visita !== undefined ? { overstayHoursVisita: data.overstayHours.visita } : {}),
    ...(data.overstayHours?.proveedor !== undefined ? { overstayHoursProveedor: data.overstayHours.proveedor } : {}),
  }).where(eq(neighborhoods.id, id))

  await audit(actorId, id, 'neighborhood.updated', 'neighborhood', id, data)
  return getNeighborhood(id)
}
