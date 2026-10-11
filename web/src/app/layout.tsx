import type { Metadata, Viewport } from 'next'
import { Geist, Bricolage_Grotesque } from 'next/font/google'
import { SCRIPT_ANTI_PARPADEO } from '@/lib/theme'
import { leerMarca } from '@/lib/marca'
import { Proveedores } from '@/components/proveedores'
import './globals.css'

// Geist para toda la interfaz; Bricolage solo para títulos, el saludo, el
// nombre en el pase y el veredicto. Dos familias, una para cada voz.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' })

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
    // El claro lleva el color del barrio; AplicarMarca lo actualiza en vivo.
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
    <html lang="es-AR" className={`${geist.variable} ${bricolage.variable}`}
      suppressHydrationWarning>
      <head>
        {/* Antes de pintar: si no, la pantalla arranca clara y salta a oscura. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
        {/* El color del barrio, en el HTML y no en un fetch del cliente: así no
            hay un parpadeo del verde por defecto antes de pintarse el propio.
            Solo se inyecta la base; las variantes las deriva el CSS. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--marca-base:${marca.color}}` }} />
      </head>
      <body>
        <Proveedores marca={marca}>{children}</Proveedores>
      </body>
    </html>
  )
}
