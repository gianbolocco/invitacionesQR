import type { Metadata, Viewport } from 'next'
import { Archivo, Playfair_Display } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Álamo Alto · Invitaciones',
  description: 'Invitaciones y control de acceso de Álamo Alto',
}

export const viewport: Viewport = {
  themeColor: '#1e6b47',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: el vecino tiene que poder hacer zoom.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${archivo.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  )
}
