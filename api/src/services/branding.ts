import { db } from '../db/index.js'
import { neighborhoods } from '../db/schema.js'
import { COLOR_DEFAULT } from '../lib/marca.js'

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
