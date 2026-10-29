'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft, ClipboardList, FileCheck, LayoutDashboard, LogOut, MoreHorizontal, Palette, ShieldCheck, Users,
} from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, HEADER, BOTON_HEADER, claseTab, type ItemBarra } from '@/components/dominio/barra-seccion'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const PESTANAS = [
  { href: '/admin', etiqueta: 'Tablero' },
  { href: '/admin/vecinos', etiqueta: 'Vecinos' },
  { href: '/admin/guardias', etiqueta: 'Guardias' },
  { href: '/admin/barrio', etiqueta: 'Configuración' },
  { href: '/auditoria', etiqueta: 'Auditoría' },
  { href: '/seguros', etiqueta: 'Seguros' },
]

/**
 * El marco del admin, pensado desde el escritorio: header de Pazzit con el
 * barrio y el rol, y los seis destinos como pestañas — sobra lugar. En
 * mobile, los cuatro de uso diario van en la barra inferior; Barrio y Seguros
 * son de consulta o configuración, no de todos los días, y quedan detrás de "Más".
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
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <header className={HEADER}>
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 md:px-6 xl:px-8">
          <Link href="/admin" aria-label="Inicio" className="flex min-w-0 items-center gap-2.5">
            {/* Sin "· Administración" al lado: con seis pestañas y un logo ancho se
                pisaba con "Tablero", y la página ya lo dice arriba del título. */}
            <Marca conPazzit sobreColor />
          </Link>

          {/* Seis pestañas no entran en una tablet: hasta 1024px sigue la barra de abajo. */}
          <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
            {PESTANAS.map((p) => (
              <Link key={p.href} href={p.href} aria-current={activo(p.href) ? 'page' : undefined} className={claseTab(activo(p.href))}>
                {p.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* El admin entra acá y, sin esto, no hay vuelta a la vista de
                invitaciones: ninguna pestaña de arriba lleva a "/". */}
            <Link href="/" aria-label="Volver a invitaciones" title="Volver a invitaciones"
              className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-[15px] font-semibold text-white transition-colors duration-(--t-hover) hover-fino:bg-white/15">
              <ArrowLeft className="size-5" aria-hidden />
              <span className="hidden xl:inline">Invitaciones</span>
            </Link>
            <span className="hidden text-[15px] text-white/90 xl:inline">{me.name}</span>
            <SelectorTema sobreColor />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className={BOTON_HEADER}>
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 sm:py-8 xl:px-8">{children}</main>

      <BarraSeccion items={barraItems} hasta="lg" central={
        <button type="button" aria-label="Más secciones" onClick={() => setMasAbierto(true)}
          className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold text-ink-soft">
          <MoreHorizontal className="size-[22px]" aria-hidden />Más
        </button>
      } />

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom">
          <SheetHeader><SheetTitle>Más</SheetTitle></SheetHeader>
          <nav className="flex flex-col gap-1 px-4 pb-8">
            <Link href="/admin/barrio" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-sm px-3 text-base font-semibold hover-fino:bg-azul-tint">
              <Palette className="size-5 text-ink-soft" aria-hidden />Configuración
            </Link>
            <Link href="/seguros" onClick={() => setMasAbierto(false)}
              className="flex min-h-14 items-center gap-3 rounded-sm px-3 text-base font-semibold hover-fino:bg-azul-tint">
              <FileCheck className="size-5 text-ink-soft" aria-hidden />Seguros
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}
