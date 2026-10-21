import { ImageResponse } from 'next/og'
import { leerMarca, MARCA_DEFAULT } from './marca'

/**
 * El ícono de la pestaña y de la app instalada: el de Pazzit (mark blanco sobre
 * un cuadrado), en el color que eligió el admin. Es el mismo dibujo que
 * `public/brand/pazzit-app-icon.svg`, con el fondo cambiado; va como SVG dentro
 * de la imagen porque el mark se recorta con una máscara.
 *
 * `redondeado`: la pestaña y Android lo muestran tal cual; iOS redondea solo y
 * con esquinas propias quedarían bordes negros.
 */
export async function iconoMarca(lado: number, redondeado = true): Promise<ImageResponse> {
  const marca = await leerMarca()
  // El color viene validado contra la paleta, pero entra en un SVG: no se confía.
  const color = /^#[\da-f]{6}$/i.test(marca.color) ? marca.color : MARCA_DEFAULT.color
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="${redondeado ? 228 : 0}" fill="${color}"/><g transform="translate(52 52) scale(9.2)"><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="6" y="22" width="88" height="56" rx="12" fill="#fff"/><circle cx="6" cy="50" r="8" fill="#000"/><circle cx="94" cy="50" r="8" fill="#000"/><rect x="26" y="33" width="10" height="45" fill="#000"/><circle cx="47" cy="45" r="10.5" fill="none" stroke="#000" stroke-width="9"/><line x1="72" y1="28" x2="72" y2="72" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 7"/></mask><rect x="6" y="22" width="88" height="56" rx="12" fill="#fff" mask="url(#m)"/></g></svg>`

  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} alt="" width={lado} height={lado} />,
    { width: lado, height: lado },
  )
}
