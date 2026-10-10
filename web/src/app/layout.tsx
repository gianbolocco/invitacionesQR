import type { Metadata, Viewport } from 'next'
import { Archivo, Playfair_Display } from 'next/font/google'
import { SCRIPT_ANTI_PARPADEO } from '@/lib/theme'
import { leerMarca } from '@/lib/marca'
import { MarcaProvider } from '@/lib/marca-cliente'
import './globals.css'

// Archivo es variable y trae eje de ancho (wdth). Una sola carga: la jerarquía
// la da el ancho, no una segunda familia. Importa en la PC de la garita.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
})

// Solo para el lockup del encabezado. Nunca para texto de interfaz.
const playfair = Playfair_Display({
  subsets: ['latin'], style: ['italic'], weight: ['500'], variable: '--font-playfair',
})

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

export const metadata: Metadata = {
  title: 'VisitPass',
  description: 'Invitaciones y control de acceso para barrios cerrados',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1e6b47' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1712' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: el vecino tiene que poder hacer zoom.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const marca = await leerMarca()

  return (
    <html lang="es-AR" className={`${archivo.variable} ${playfair.variable}`}
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
        <MarcaProvider marca={marca}>{children}</MarcaProvider>
      </body>
    </html>
  )
}
