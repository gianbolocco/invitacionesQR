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
export function BarraSeccion({ items, central }: { items: ItemBarra[]; central?: ReactNode }) {
  const mitad = Math.ceil(items.length / 2)
  const render = (item: ItemBarra) => {
    const Icono = item.icono
    return (
      <Link key={item.href} href={item.href} aria-current={item.activo ? 'page' : undefined}
        className={cn('relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
          'transition-colors duration-150', item.activo ? 'text-marca' : 'text-ink-soft')}>
        {item.activo && (
          <motion.span layoutId="barra-activa" aria-hidden
            className="absolute top-0 h-0.5 w-10 rounded-full bg-marca"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
        )}
        <Icono className="size-[22px]" aria-hidden />
        {item.etiqueta}
      </Link>
    )
  }
  return (
    <nav aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card/95 backdrop-blur sm:hidden"
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
