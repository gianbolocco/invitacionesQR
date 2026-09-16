'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, type Me } from '@/lib/session'
import { Wordmark } from './ui'

const RESIDENT_NAV = [
  { href: '/', label: 'Invitaciones', icono: '◆' },
  { href: '/historial', label: 'Historial', icono: '◷' },
]

const ADMIN_NAV = [
  { href: '/admin', label: 'Tablero' },
  { href: '/admin/unidades', label: 'Unidades' },
  { href: '/admin/usuarios', label: 'Vecinos' },
  { href: '/admin/guardias', label: 'Guardias' },
  { href: '/admin/barrio', label: 'Barrio' },
  { href: '/garita/auditoria', label: 'Auditoría' },
]

function esActivo(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path.startsWith(href)
}

/**
 * El admin tiene seis destinos: en mobile eran una tira que scrolleaba de
 * costado, lo peor de los dos mundos — ni se ven todos ni se lee ninguno.
 * Acá un desplegable sí se gana el toque extra.
 */
function MenuAdmin({ path }: { path: string }) {
  const [abierto, setAbierto] = useState(false)
  const actual = ADMIN_NAV.find((i) => esActivo(i.href, path))

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  return (
    <div className="relative sm:hidden">
      <button onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto} aria-haspopup="menu"
        className="flex min-h-12 w-full items-center justify-between gap-3 border-t
          border-ink/10 px-5 font-semibold">
        {actual?.label ?? 'Menú'}
        <span aria-hidden className={`transition-transform ${abierto ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {abierto && (
        <>
          <button aria-hidden tabIndex={-1} onClick={() => setAbierto(false)}
            className="fixed inset-0 z-10 cursor-default bg-ink/20" />
          <nav className="surgir absolute inset-x-0 top-full z-20 border-b border-ink/10
            bg-white shadow-lg">
            {ADMIN_NAV.map((item) => (
              // Se cierra al elegir: si no, queda abierto sobre la pantalla nueva.
              <Link key={item.href} href={item.href} onClick={() => setAbierto(false)}
                aria-current={esActivo(item.href, path) ? 'page' : undefined}
                className={`flex min-h-12 items-center border-l-4 px-5 font-semibold ${
                  esActivo(item.href, path)
                    ? 'border-alamo bg-alamo/5 text-alamo'
                    : 'border-transparent text-ink-soft'
                }`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}

/**
 * El vecino tiene dos destinos. Un desplegable para dos ítems agrega un toque
 * para llegar a todo; abajo quedan siempre visibles y en la zona del pulgar.
 */
function BarraInferior({ path }: { path: string }) {
  return (
    <nav aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink/10 bg-white sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {RESIDENT_NAV.map((item) => {
        const activo = esActivo(item.href, path)
        return (
          <Link key={item.href} href={item.href}
            aria-current={activo ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5
              text-xs font-semibold transition-colors ${activo ? 'text-alamo' : 'text-ink-soft'}`}>
            <span aria-hidden className="text-lg leading-none">{item.icono}</span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname()
  const esAdmin = path.startsWith('/admin')
  const nav = esAdmin ? ADMIN_NAV : RESIDENT_NAV

  return (
    <div className={`min-h-dvh ${esAdmin ? '' : 'con-barra-inferior sm:pb-0'}`}>
      <header className="sticky top-0 z-20 border-b border-alamo/15 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Wordmark subtitle={me.units[0]?.label ?? me.role} />
          <button onClick={logout} className="text-sm text-ink-soft underline underline-offset-4">
            Cerrar sesión
          </button>
        </div>

        {/* En pantalla ancha, las solapas de siempre para los dos roles. */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-3 sm:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
              aria-current={esActivo(item.href, path) ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold
                transition-colors ${
                  esActivo(item.href, path)
                    ? 'border-alamo text-alamo'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}>
              {item.label}
            </Link>
          ))}
          {me.role === 'admin' && !esAdmin && (
            <Link href="/admin" className="whitespace-nowrap border-b-2 border-transparent px-3
              py-2.5 text-sm font-semibold text-ink-soft hover:text-ink">
              Administración
            </Link>
          )}
        </nav>

        {esAdmin && <MenuAdmin path={path} />}
      </header>

      <main className="surgir mx-auto max-w-5xl px-5 py-6">{children}</main>

      {!esAdmin && <BarraInferior path={path} />}
      {!esAdmin && me.role === 'admin' && (
        <Link href="/admin" className="fixed bottom-20 right-4 z-20 rounded-full border
          border-alamo/30 bg-white px-4 py-2 text-sm font-semibold text-alamo shadow-md sm:hidden">
          Administración
        </Link>
      )}
    </div>
  )
}
