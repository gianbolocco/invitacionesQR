import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { neighborhoods, trades, type Franja } from '../db/schema.js'
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
    delivery: neighborhoods.overstayMinutesDelivery,
    providerWindows: neighborhoods.providerWindows,
    insuranceWarnDays: neighborhoods.insuranceWarnDays,
    vehicleInsuranceRequired: neighborhoods.vehicleInsuranceRequired,
    vehicleInsuranceOverride: neighborhoods.vehicleInsuranceOverride,
    packagesEnabled: neighborhoods.packagesEnabled,
  }).from(neighborhoods).where(eq(neighborhoods.id, id)).limit(1)
  if (!row) throw new AppError(404, 'not_found')
  const { visita, proveedor, delivery, ...barrio } = row
  // La paleta viaja con el barrio para que el front no la duplique: si alguna
  // vez cambia, cambia en un solo lado.
  return { ...barrio, overstayHours: { visita, proveedor }, overstayMinutes: { delivery }, paleta: PALETA }
}

export async function updateNeighborhood(
  id: string,
  actorId: string,
  data: {
    name?: string; address?: string; mapUrl?: string; brandColor?: string
    overstayHours?: { visita?: number | null; proveedor?: number | null }
    overstayMinutes?: { delivery?: number | null }
    providerWindows?: Franja[]
    insuranceWarnDays?: number | null
    vehicleInsuranceRequired?: boolean; vehicleInsuranceOverride?: boolean
    packagesEnabled?: boolean
  },
) {
  if (data.brandColor !== undefined && !esColorDeLaPaleta(data.brandColor)) {
    throw new AppError(400, 'color_invalido')
  }

  if (data.providerWindows) {
    const ids = [...new Set(data.providerWindows.flatMap((f) => f.trades ?? []))]
    if (ids.length) {
      const propios = await db.select({ id: trades.id }).from(trades)
        .where(and(eq(trades.neighborhoodId, id), inArray(trades.id, ids)))
      if (propios.length !== ids.length) throw new AppError(400, 'franja_invalida')
    }
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
    ...(data.overstayMinutes?.delivery !== undefined ? { overstayMinutesDelivery: data.overstayMinutes.delivery } : {}),
    ...(data.insuranceWarnDays !== undefined ? { insuranceWarnDays: data.insuranceWarnDays } : {}),
    ...(data.vehicleInsuranceRequired !== undefined ? { vehicleInsuranceRequired: data.vehicleInsuranceRequired } : {}),
    ...(data.vehicleInsuranceOverride !== undefined ? { vehicleInsuranceOverride: data.vehicleInsuranceOverride } : {}),
    ...(data.packagesEnabled !== undefined ? { packagesEnabled: data.packagesEnabled } : {}),
    ...(data.providerWindows !== undefined ? { providerWindows: data.providerWindows } : {}),
  }).where(eq(neighborhoods.id, id))

  await audit(actorId, id, 'neighborhood.updated', 'neighborhood', id, data)
  return getNeighborhood(id)
}
