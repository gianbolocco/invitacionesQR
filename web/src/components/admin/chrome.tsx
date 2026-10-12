'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft, Building2, ClipboardList, LayoutDashboard, LogOut, MoreHorizontal, Palette, ShieldCheck, Users,
} from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, type ItemBarra } from '@/components/dominio/barra-seccion'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const PILLS = [
  { href: '/admin', etiqueta: 'Tablero' },
  { href: '/admin/vecinos', etiqueta: 'Vecinos' },
  { href: '/admin/guardias', etiqueta: 'Guardias' },
  { href: '/admin/unidades', etiqueta: 'Unidades' },
  { href: '/admin/barrio', etiqueta: 'Barrio' },
  { href: '/auditoria', etiqueta: 'Auditoría' },
]

/**
 * El marco del admin: banda del barrio y navegación. En escritorio, los
 * seis destinos como pills en la banda — sobra lugar. En mobile, los
 * cuatro de uso diario van en la barra inferior; Unidades y Barrio son
 * tareas de configuración, no de todos los días, y quedan detrás de "Más".
 */
export function ChromeAdmin({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()
  const [masAbierto, setMasAbierto] = useState(false)

  const activo = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href))

  const barraItems: ItemBarra[] = [
    { href: '/admin', etiqueta: 'Tablero', icono: LayoutDashboard, activo: activo('/admin') },
    { href: '/admin/vecinos', etiqueta: 'Vecinos', icono: Users, activo: activo('/admin/vecinos') },
    { href: '/admin/guardias', etiqueta: 'Guardias', icono: ShieldCheck, activo: activo('/admin/guardias') },
    { href: '/auditoria', etiqueta: 'Auditoría', icono: ClipboardList, activo: path.startsWith('/auditoria') },
  ]

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <header className="sticky top-0 z-30 bg-marca text-sobre-marca">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/admin" aria-label="Inicio" className="min-w-0"><Marca variante="banda" /></Link>

          <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
            {PILLS.map((p) => (
              <Link key={p.href} href={p.href} aria-current={activo(p.href) ? 'page' : undefined}
                className={cn('rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
                  activo(p.href) ? 'bg-white/20' : 'opacity-80 hover:bg-white/10 hover:opacity-100')}>
                {p.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {/* El admin entra acá y, sin esto, no hay vuelta a la vista de
                invitaciones: ninguna pill de arriba lleva a "/". */}
            <Link href="/" aria-label="Volver a invitaciones" title="Volver a invitaciones"
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-sobre-marca hover:bg-white/10">
              <ArrowLeft className="size-[18px]" aria-hidden />
              <span className="hidden sm:inline">Invitaciones</span>
            </Link>
            <span className="hidden text-sm opacity-85 sm:inline">{me.name}</span>
            <SelectorTema />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="grid size-9 place-items-center rounded-full text-sobre-marca hover:bg-white/10">
              <LogOut className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>

      <BarraSeccion items={barraItems} central={
        <button type="button" aria-label="Más secciones" onClick={() => setMasAbierto(true)}
          className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-soft">
          <MoreHorizontal className="size-[22px]" aria-hidden />Más
        </button>
      } />

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader><SheetTitle>Más</SheetTitle></SheetHeader>
          <nav className="flex flex-col gap-1 px-4 pb-8">
            <Link href="/admin/unidades" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-md px-3 text-base font-semibold hover:bg-surface-sunk">
              <Building2 className="size-5 text-ink-soft" aria-hidden />Unidades
            </Link>
            <Link href="/admin/barrio" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-md px-3 text-base font-semibold hover:bg-surface-sunk">
              <Palette className="size-5 text-ink-soft" aria-hidden />Barrio
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}
