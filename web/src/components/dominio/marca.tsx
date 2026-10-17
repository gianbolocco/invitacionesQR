'use client'
import { logoUrl, useMarca } from '@/lib/marca-cliente'
import type { Marca as DatosMarca } from '@/lib/marca'
import { LogoPazzit } from '@/components/dominio/logo-pazzit'
import { cn } from '@/lib/utils'

/**
 * El logo o el nombre del barrio. Es el único componente que sabe cómo se
 * pinta el barrio: si hay logo lo muestra, si no, el nombre.
 *
 * - normal: en los headers. Con `conPazzit` y sin logo, el nombre va
 *   acompañado del mark de Pazzit (en blanco sobre el color del barrio); con
 *   logo cargado va solo el logo, que ya es la identidad del barrio.
 * - grande: arranque y pantallas de acceso.
 *
 * `marcaOverride` la usa la vista previa de /admin/barrio: en vez de leer
 * la marca guardada, muestra la que se está editando, antes de guardar.
 */
export function Marca({ variante = 'normal', conPazzit = false, sobreColor = false, className, marcaOverride }: {
  variante?: 'normal' | 'grande'
  conPazzit?: boolean
  /** Sobre el color del barrio (headers): nombre y mark en blanco. */
  sobreColor?: boolean
  className?: string
  marcaOverride?: DatosMarca
}) {
  const marcaReal = useMarca()
  const marca = marcaOverride ?? marcaReal
  const url = logoUrl(marca)

  if (url) {
    const alto = { normal: 'h-9', grande: 'h-14' }[variante]
    return (
      <span className={cn('inline-flex shrink-0 items-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={marca.nombre} className={cn(alto, 'w-auto max-w-48 object-contain')} />
      </span>
    )
  }

  const nombre = (
    <span className={cn('truncate', sobreColor ? 'text-white' : 'text-ink', {
      normal: 'text-base font-bold',
      grande: 't-heading',
    }[variante], !conPazzit && className)}>
      {marca.nombre}
    </span>
  )
  if (!conPazzit) return nombre
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <LogoPazzit variante="mark" ancho={variante === 'grande' ? 40 : 24} alt="" className={sobreColor ? 'bg-white' : undefined} />
      {nombre}
    </span>
  )
}
