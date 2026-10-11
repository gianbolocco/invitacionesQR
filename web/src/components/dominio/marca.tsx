'use client'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import { cn } from '@/lib/utils'

/**
 * El logo o el nombre del barrio. Es el único componente que sabe cómo se
 * pinta la marca: si hay logo lo muestra, si no, el nombre en display.
 *
 * - normal: sobre el fondo, el nombre va en el color del barrio.
 * - banda: sobre la banda de color; el logo va en una pastilla blanca para
 *   que uno oscuro no desaparezca sobre el fondo.
 * - grande: arranque y pantallas de acceso.
 */
export function Marca({ variante = 'normal', className }: {
  variante?: 'normal' | 'banda' | 'grande'
  className?: string
}) {
  const marca = useMarca()
  const url = logoUrl(marca)

  if (url) {
    const alto = { normal: 'h-8', banda: 'h-6', grande: 'h-14' }[variante]
    return (
      <span className={cn('inline-flex shrink-0 items-center',
        variante === 'banda' && 'rounded-md bg-white px-2 py-1', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={marca.nombre} className={cn(alto, 'w-auto max-w-48 object-contain')} />
      </span>
    )
  }

  return (
    <span className={cn('truncate font-display font-extrabold tracking-[-0.02em]', {
      normal: 'text-xl text-marca',
      banda: 'text-[15px] text-sobre-marca',
      grande: 'text-[32px] text-marca',
    }[variante], className)}>
      {marca.nombre}
    </span>
  )
}
