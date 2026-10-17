import type { Metadata, Viewport } from 'next'
import { Onest } from 'next/font/google'
import { SCRIPT_ANTI_PARPADEO } from '@/lib/theme'
import { leerMarca } from '@/lib/marca'
import { Proveedores } from '@/components/proveedores'
import './globals.css'

// Onest, la letra de Pazzit, para toda la interfaz. Bagel Fat One no se carga:
// solo vive dibujada en los SVG del logo.
const onest = Onest({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-onest' })

/*
 * El layout se renderiza por request, no en el build.
 *
 * Sin esto Next lo prerenderiza al compilar, cuando la API todavía no existe:
 * el color del barrio quedaba horneado en el verde por defecto y no cambiaba
 * nunca. El costo es nulo — las pantallas son clientes que piden sus datos al
 * montarse, así que el HTML estático no ahorraba nada.
 *
 * El fetch sale sin caché: va por la red interna de Docker y cuesta nada.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const marca = await leerMarca()
  return {
    title: marca.nombre,
    description: 'Invitaciones y control de acceso para barrios cerrados',
    applicationName: marca.nombre,
    appleWebApp: { capable: true, title: marca.nombre, statusBarStyle: 'default' },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const marca = await leerMarca()
  return {
    // En claro la barra del navegador sigue al header, que lleva el color del
    // barrio (AplicarMarca la actualiza en vivo). En oscuro, el fondo de la app:
    // el header oscuro es una variante calculada en CSS que acá no se conoce.
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: marca.color },
      { media: '(prefers-color-scheme: dark)', color: '#12110e' },
    ],
    width: 'device-width',
    initialScale: 1,
    // Sin maximumScale: el vecino tiene que poder hacer zoom.
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const marca = await leerMarca()

  return (
    <html lang="es-AR" className={onest.variable}
      suppressHydrationWarning>
      <head>
        {/* Antes de pintar: si no, la pantalla arranca clara y salta a oscura. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
        {/* El color del barrio, en el HTML y no en un fetch del cliente: así el
            punto del barrio en el pase no parpadea con el verde por defecto. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--marca-base:${marca.color}}` }} />
      </head>
      <body>
        <Proveedores marca={marca}>{children}</Proveedores>
      </body>
    </html>
  )
}
