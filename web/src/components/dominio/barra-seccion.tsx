'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export type ItemBarra = { href: string; etiqueta: string; icono: LucideIcon; activo: boolean }

/**
 * La barra de abajo en el celular: pocos destinos, siempre a la vista y donde
 * llega el pulgar. El indicador de la sección activa se desliza en vez de
 * saltar. `central` deja un lugar en el medio para una acción grande.
 */
export function BarraSeccion({ items, central, hasta = 'sm' }: {
  items: ItemBarra[]
  central?: ReactNode
  /** Desde qué ancho la navegación pasa al header y esta barra se esconde. */
  hasta?: 'sm' | 'lg'
}) {
  const mitad = Math.ceil(items.length / 2)
  const render = (item: ItemBarra) => {
    const Icono = item.icono
    return (
      <Link key={item.href} href={item.href} aria-current={item.activo ? 'page' : undefined}
        className={cn('relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold',
          'transition-colors duration-(--t-hover)', item.activo ? 'text-azul-text' : 'text-ink-soft')}>
        {item.activo && (
          <motion.span layoutId="barra-activa" aria-hidden
            className="absolute top-0 h-[3px] w-6 rounded-[2px] bg-azul"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
        )}
        <Icono className="size-[22px]" aria-hidden />
        {item.etiqueta}
      </Link>
    )
  }
  return (
    <nav aria-label="Secciones"
      className={cn('fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card', hasta === 'sm' ? 'sm:hidden' : 'lg:hidden')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {central ? (
        <>
          {items.slice(0, mitad).map(render)}
          <div className="flex flex-1 items-center justify-center">{central}</div>
          {items.slice(mitad).map(render)}
        </>
      ) : items.map(render)}
    </nav>
  )
}

/** La pestaña de los headers de escritorio: la activa en azul-tint, radio 8. */
export function claseTab(activo: boolean): string {
  return cn('flex h-11 items-center gap-1.5 rounded-sm px-3.5 text-[15px] font-semibold transition-colors duration-(--t-hover)',
    activo ? 'bg-azul-tint text-azul-text' : 'text-ink hover-fino:bg-azul-tint/60')
}

/** Los botones de ícono de los headers (tema, cerrar sesión, admin): 44×44. */
export const BOTON_HEADER =
  'grid size-11 shrink-0 place-items-center rounded-md text-ink transition-colors duration-(--t-hover) hover-fino:bg-azul-tint'
