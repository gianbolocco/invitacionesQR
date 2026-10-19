'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, LogOut, ScanLine, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'
import { BarraSeccion, HEADER, BOTON_HEADER, claseTab, type ItemBarra } from '@/components/dominio/barra-seccion'
import { AlertasProvider, AvisoAlertas } from './alertas-permanencia'

/**
 * El marco de la garita, pensado desde el escritorio: header de Pazzit con el
 * barrio y el rol, quién está de turno — se AFIRMA, no se elige: hace visible
 * una sesión que quedó abierta del turno anterior — y la navegación. El
 * escáner va en el centro de la barra inferior en mobile; en escritorio, el
 * botón grande vive en la columna derecha de la pantalla principal (no acá),
 * así que no es parte de `items`.
 *
 * A diferencia de `ChromeVecino`, esto NO se usa desde el layout de la
 * sección: lo montan Garita, Auditoría, Cargar y Probar lectora. Escanear y
 * el veredicto quedan a pantalla completa, sin este marco.
 *
 * También reparte las alertas de permanencia (`AlertasProvider`): el aviso va
 * en el header y la agenda las lee para marcar a los excedidos.
 */
export function ChromeGarita({ children }: { children: React.ReactNode }) {
  const me = useSesion()
  const path = usePathname()

  const items: ItemBarra[] = [
    { href: '/garita', etiqueta: 'Garita', icono: CalendarDays, activo: path === '/garita' },
    { href: '/auditoria', etiqueta: 'Auditoría', icono: ClipboardList, activo: path.startsWith('/auditoria') },
  ]

  return (
    <AlertasProvider>
      <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
        <header className={HEADER}>
          <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 md:px-6 xl:px-8">
            <Link href="/garita" aria-label="Inicio" className="flex min-w-0 items-center gap-2.5">
              <Marca conPazzit sobreColor />
              <span className="hidden shrink-0 font-semibold text-white/80 sm:inline">· Portería</span>
            </Link>

            <nav aria-label="Secciones" className="hidden items-center gap-1 sm:flex">
              {items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={i.activo ? 'page' : undefined} className={claseTab(i.activo)}>
                  {i.etiqueta}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <AvisoAlertas />
              <span className="hidden text-[15px] text-white/90 sm:inline">{me.name}</span>
              {me.role === 'admin' && (
                <Link href="/admin" aria-label="Ir a administración" title="Ir a administración" className={BOTON_HEADER}>
                  <Settings2 className="size-5" aria-hidden />
                </Link>
              )}
              <SelectorTema sobreColor />
              <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className={BOTON_HEADER}>
                <LogOut className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 sm:py-8 xl:px-8">{children}</main>

        <BarraSeccion items={items} central={
          <Link href="/garita/escanear" aria-label="Escanear QR"
            className="grid size-14 -translate-y-5 place-items-center rounded-md bg-azul text-white shadow-(--sombra-flotante)">
            <ScanLine className="size-6" aria-hidden />
          </Link>
        } />
      </div>
    </AlertasProvider>
  )
}
