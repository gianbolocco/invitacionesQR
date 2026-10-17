/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils'

// Proporciones de los viewBox de los SVG de public/brand.
const RATIO = { lockup: 981 / 4201, mark: 60 / 92 }

/**
 * El logo de Pazzit. Siempre `<img>`: los SVG comparten `mask id="m1"` y, en
 * línea, el segundo pisaría la máscara del primero. El lockup tiene versión
 * clara y oscura y el CSS (`.logo-claro` / `.logo-oscuro`) muestra la del
 * tema; el mark es el azul en los dos.
 */
export function LogoPazzit({ variante = 'lockup', ancho = 120, alt = 'Pazzit', className }: {
  variante?: 'lockup' | 'mark'
  ancho?: number
  alt?: string
  className?: string
}) {
  const alto = Math.round(ancho * RATIO[variante])
  if (variante === 'mark') {
    return <img src="/brand/pazzit-mark-azul.svg" alt={alt} width={ancho} height={alto}
      className={cn('shrink-0', className)} />
  }
  return (
    <span className={cn('inline-flex shrink-0 leading-none', className)}>
      <img className="logo-claro" src="/brand/pazzit-lockup-claro.svg" alt={alt} width={ancho} height={alto} />
      <img className="logo-oscuro" src="/brand/pazzit-lockup-oscuro.svg" alt={alt} width={ancho} height={alto} />
    </span>
  )
}
