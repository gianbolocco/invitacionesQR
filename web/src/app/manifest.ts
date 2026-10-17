import type { MetadataRoute } from 'next'
import { leerMarca } from '@/lib/marca'

export const dynamic = 'force-dynamic'

/** La app instalada lleva el nombre y el ícono del barrio; el fondo es el de Pazzit. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const marca = await leerMarca()
  return {
    name: marca.nombre,
    short_name: marca.nombre.length > 12 ? marca.nombre.split(' ')[0] : marca.nombre,
    description: 'Invitaciones y control de acceso del barrio',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f6ff', // espeja --surface de globals.css: el manifest no puede leer variables CSS
    theme_color: marca.color,
    lang: 'es-AR',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
