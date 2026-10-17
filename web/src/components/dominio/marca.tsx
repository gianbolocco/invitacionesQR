'use client'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import type { Marca as DatosMarca } from '@/lib/marca'
import { cn } from '@/lib/utils'

/**
 * El logo o el nombre del barrio. Es el único componente que sabe cómo se
 * pinta el barrio: si hay logo lo muestra, si no, el nombre. La marca de la
 * app es Pazzit (LogoPazzit); el barrio va en tinta, no en su color.
 *
 * - normal: en los headers, al lado del mark de Pazzit.
 * - grande: arranque y pantallas de acceso.
 *
 * `marcaOverride` la usa la vista previa de /admin/barrio: en vez de leer
 * la marca guardada, muestra la que se está editando, antes de guardar.
 */
export function Marca({ variante = 'normal', className, marcaOverride }: {
  variante?: 'normal' | 'grande'
  className?: string
  marcaOverride?: DatosMarca
}) {
  const marcaReal = useMarca()
  const marca = marcaOverride ?? marcaReal
  const url = logoUrl(marca)

  if (url) {
    const alto = { normal: 'h-7', grande: 'h-14' }[variante]
    return (
      <span className={cn('inline-flex shrink-0 items-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={marca.nombre} className={cn(alto, 'w-auto max-w-48 object-contain')} />
      </span>
    )
  }

  return (
    <span className={cn('truncate text-ink', {
      normal: 'text-base font-bold',
      grande: 't-heading',
    }[variante], className)}>
      {marca.nombre}
    </span>
  )
}
