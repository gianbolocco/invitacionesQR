/**
 * La marca del barrio, leída en el servidor.
 *
 * OJO con la URL: el navegador le pega a `/api` relativo, pero esto corre
 * adentro del contenedor y tiene que salir por la red de Docker. Son dos
 * caminos distintos a la misma API.
 *
 * Si la API no contesta, devuelve los valores del producto y la página se
 * dibuja igual: el color es decoración y no puede voltear la app.
 */
export type Marca = { nombre: string; color: string; tieneLogo: boolean }

const DEFAULT: Marca = { nombre: 'VisitPass', color: '#1e6b47', tieneLogo: false }

export async function leerMarca(): Promise<Marca> {
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
  try {
    // Sin caché: es una consulta a un servicio de la misma red de Docker, y
    // cachearla hacía que el admin cambiara el color y no lo viera. El ahorro
    // no valía la confusión.
    const res = await fetch(`${base}/branding`, { cache: 'no-store' })
    if (!res.ok) return DEFAULT
    return await res.json() as Marca
  } catch (e) {
    /*
     * Pasa de verdad, no es defensivo de más: al levantar el stack, Next
     * atiende antes de que la API termine de migrar y sembrar. Ahí la página
     * sale con el verde del producto y la siguiente ya trae el del barrio.
     * Se registra porque es la diferencia entre "arrancó" y "está roto".
     */
    console.error('[marca] no se pudo leer la marca desde', base, (e as Error).message)
    return DEFAULT
  }
}
