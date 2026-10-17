/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils'

// Proporciones de los viewBox de los SVG de public/brand.
const RATIO = { lockup: 981 / 4201, mark: 60 / 92 }

/**
 * El logo de Pazzit. El lockup va como `<img>`: los SVG comparten
 * `mask id="m1"` y, en línea, el segundo pisaría la máscara del primero. Tiene
 * versión clara y oscura y el CSS (`.logo-claro` / `.logo-oscuro`) muestra la
 * del tema.
 *
 * El mark es de un solo color con recortes, así que se dibuja como máscara
 * sobre `bg-azul`: toma el acento del barrio (azul de Pazzit por defecto).
 */
export function LogoPazzit({ variante = 'lockup', ancho = 120, alt = 'Pazzit', className }: {
  variante?: 'lockup' | 'mark'
  ancho?: number
  alt?: string
  className?: string
}) {
  const alto = Math.round(ancho * RATIO[variante])
  if (variante === 'mark') {
    return (
      <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
        className={cn('inline-block shrink-0 bg-azul [mask:url(/brand/pazzit-mark-azul.svg)_center/contain_no-repeat]', className)}
        style={{ width: ancho, height: alto }} />
    )
  }
  return (
    <span className={cn('inline-flex shrink-0 leading-none', className)}>
      <img className="logo-claro" src="/brand/pazzit-lockup-claro.svg" alt={alt} width={ancho} height={alto} />
      <img className="logo-oscuro" src="/brand/pazzit-lockup-oscuro.svg" alt={alt} width={ancho} height={alto} />
    </span>
  )
}
