'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, LogOut, ScanLine, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, type ItemBarra } from '@/components/dominio/barra-seccion'
import { cn } from '@/lib/utils'

/**
 * El marco de la garita: banda del barrio, quién está de turno — se AFIRMA,
 * no se elige: hace visible una sesión que quedó abierta del turno
 * anterior — y la navegación. El escáner va en el centro de la barra
 * inferior en mobile; en escritorio, el botón grande vive en la columna
 * derecha de la pantalla principal (no acá), así que no es parte de `items`.
 *
 * A diferencia de `ChromeVecino`, esto NO se usa desde el layout de la
 * sección: solo lo monta la pantalla principal (`/garita`). Escanear y el
 * veredicto quedan a pantalla completa, sin este marco.
 */
export function ChromeGarita({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()

  const items: ItemBarra[] = [
    { href: '/garita', etiqueta: 'Garita', icono: CalendarDays, activo: path === '/garita' },
    { href: '/auditoria', etiqueta: 'Auditoría', icono: ClipboardList, activo: path.startsWith('/auditoria') },
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 bg-marca text-sobre-marca">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/garita" aria-label="Inicio" className="min-w-0"><Marca variante="banda" /></Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={i.activo ? 'page' : undefined}
                className={cn('rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
                  i.activo ? 'bg-white/20' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                {i.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm opacity-85 sm:inline">{me.name}</span>
            {me.role === 'admin' && (
              <Link href="/admin" aria-label="Ir a administración"
                className="grid size-9 place-items-center rounded-full hover:bg-white/10">
                <Settings2 className="size-[18px]" aria-hidden />
              </Link>
            )}
            <SelectorTema />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="grid size-9 place-items-center rounded-full text-sobre-marca hover:bg-white/10">
              <LogOut className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <BarraSeccion items={items} central={
        <Link href="/garita/escanear" aria-label="Escanear QR"
          className="grid size-14 -translate-y-5 place-items-center rounded-full bg-marca text-sobre-marca shadow-flotante">
          <ScanLine className="size-6" aria-hidden />
        </Link>
      } />
    </div>
  )
}
