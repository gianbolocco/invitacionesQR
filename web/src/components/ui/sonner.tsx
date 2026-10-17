"use client"

import { usePathname } from "next/navigation"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useMedia } from "@/lib/use-media"

/*
 * Sin next-themes: el tema lo decide `data-theme` en el <html>, y los colores
 * salen de los tokens. "system" deja que sonner siga la preferencia del
 * sistema para sus detalles internos; el fondo y el texto son nuestros.
 *
 * En el celular arriba al centro (no lo tapa el pulgar ni la barra). En la
 * garita y el admin de escritorio, abajo a la derecha: lejos de la búsqueda y
 * del veredicto, que es donde mira el guardia.
 */
const SECCIONES_ESCRITORIO = ["/garita", "/auditoria", "/admin"]

function Toaster(props: ToasterProps) {
  const path = usePathname()
  const ancho = useMedia("(min-width: 1024px)")
  const abajo = ancho && SECCIONES_ESCRITORIO.some((s) => path.startsWith(s))
  return (
    <Sonner
      theme="system"
      position={abajo ? "bottom-right" : "top-center"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-verde" />,
        info: <InfoIcon className="size-5 text-azul-text" />,
        warning: <TriangleAlertIcon className="size-5 text-espera" />,
        error: <OctagonXIcon className="size-5 text-alto" />,
        loading: <Loader2Icon className="size-5 animate-spin text-azul-text" />,
      }}
      toastOptions={{ style: { boxShadow: "var(--sombra-flotante)", fontSize: 15 } }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
