/**
 * La marca del barrio, leída en el servidor.
 *
 * OJO con la URL: el navegador le pega a `/api` relativo, pero esto corre
 * adentro del contenedor y tiene que salir por la red de Docker.
 *
 * Si la API no contesta, devuelve los valores del producto y la página se
 * dibuja igual: el color es decoración y no puede voltear la app.
 */
export type Marca = { nombre: string; color: string; tieneLogo: boolean; logoVersion: number | null }

export const COLOR_PAZZIT = '#2f5bff'

export const MARCA_DEFAULT: Marca = { nombre: 'Pazzit', color: COLOR_PAZZIT, tieneLogo: false, logoVersion: null }

/**
 * Con el azul de Pazzit la app usa la paleta diseñada a mano (globals.css). Con
 * otro color, la paleta se deriva de ese color (`data-marca="propia"`).
 */
export function esMarcaPropia(color: string): boolean {
  return color.toLowerCase() !== COLOR_PAZZIT
}

export async function leerMarca(): Promise<Marca> {
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
  try {
    // Sin caché: si no, el admin cambia el color y el HTML nuevo sale viejo.
    const res = await fetch(`${base}/branding`, { cache: 'no-store' })
    if (!res.ok) return MARCA_DEFAULT
    return { ...MARCA_DEFAULT, ...(await res.json() as Partial<Marca>) }
  } catch (e) {
    // Pasa de verdad al levantar el stack: Next atiende antes de que la API
    // termine de migrar. Se registra porque es "arrancó" contra "está roto".
    console.error('[marca] no se pudo leer la marca desde', base, (e as Error).message)
    return MARCA_DEFAULT
  }
}
