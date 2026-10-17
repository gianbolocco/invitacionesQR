'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, Settings2, Ticket, UserRound } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { Marca } from '@/components/dominio/marca'
import { BarraSeccion, claseTab, type ItemBarra } from '@/components/dominio/barra-seccion'

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

/**
 * El marco de la sección del vecino: header de Pazzit con el nombre del
 * barrio, la navegación (arriba en pantalla ancha, abajo en el celular) y el
 * contenido a 640px. Se monta una vez para toda la sección: navegar no lo
 * vuelve a dibujar.
 */
export function ChromeVecino({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()

  const items: ItemBarra[] = [
    { href: '/', etiqueta: 'Invitaciones', icono: Ticket,
      activo: path === '/' || path.startsWith('/invitaciones') },
    { href: '/historial', etiqueta: 'Historial', icono: History, activo: path.startsWith('/historial') },
    { href: '/perfil', etiqueta: 'Perfil', icono: UserRound, activo: path.startsWith('/perfil') },
    ...(me.role === 'admin'
      ? [{ href: '/admin', etiqueta: 'Administración', icono: Settings2, activo: path.startsWith('/admin') }]
      : []),
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-card">
        <div className="mx-auto flex h-14 max-w-[calc(640px+3rem)] items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Inicio" className="flex min-w-0 items-center gap-2.5">
            <Marca conPazzit />
          </Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={i.activo ? 'page' : undefined} className={claseTab(i.activo)}>
                {/* Solo Administración lleva ícono acá: es la única pestaña que
                    cambia de "modo" en vez de sección, y conviene que se
                    distinga del resto. */}
                {i.href === '/admin' && <i.icono aria-hidden className="size-4" />}
                {i.etiqueta}
              </Link>
            ))}
          </nav>

          <Link href="/perfil" aria-label="Tu perfil"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-azul-tint text-sm font-bold text-azul-text sm:hidden">
            <span aria-hidden>{iniciales(me.name)}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[calc(640px+3rem)] px-4 py-6 sm:py-10 md:px-6">{children}</main>

      <BarraSeccion items={items} />
    </div>
  )
}
