'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, type Me } from '@/lib/session'
import { Wordmark } from './ui'

/**
 * Íconos propios en vez de caracteres sueltos: un rombo y un reloj tipográficos
 * no dicen nada. Un QR y una flecha que vuelve sobre un reloj sí.
 */
function IconoInvitaciones() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M17 20h4M14 20h0" />
    </svg>
  )
}

function IconoHistorial() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

const RESIDENT_NAV = [
  { href: '/', label: 'Invitaciones', Icono: IconoInvitaciones },
  { href: '/historial', label: 'Historial', Icono: IconoHistorial },
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
      {RESIDENT_NAV.map(({ href, label, Icono }) => {
        const activo = esActivo(href, path)
        return (
          <Link key={href} href={href}
            aria-current={activo ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1
              text-xs font-semibold transition-colors ${activo ? 'text-alamo' : 'text-ink-soft'}`}>
            <Icono />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Shell({ me, accion, children }: {
  me: Me
  /**
   * La acción principal de la pantalla. Se renderiza ACÁ, fuera de <main>, y no
   * es un detalle: <main> tiene la animación de entrada, que usa transform, y un
   * ancestro con transform rompe `position: fixed` — el botón quedaba anclado al
   * contenedor en vez de a la pantalla y se montaba sobre las tarjetas.
   */
  accion?: React.ReactNode
  children: React.ReactNode
}) {
  const path = usePathname()
  const esAdmin = path.startsWith('/admin')
  const nav = esAdmin ? ADMIN_NAV : RESIDENT_NAV

  return (
    <div className={`min-h-dvh ${esAdmin ? '' : 'con-barra-inferior sm:pb-0'} ${accion ? 'con-accion' : ''}`}>
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

      {accion && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-ink/10 bg-surface/95
          px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-5 sm:pb-8 sm:pt-0"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto max-w-5xl">{accion}</div>
        </div>
      )}

      {!esAdmin && <BarraInferior path={path} />}
      {!esAdmin && me.role === 'admin' && (
        <Link href="/admin" className="fixed right-4 top-3 z-40 rounded-full border
          border-alamo/30 bg-white px-3 py-1.5 text-xs font-semibold text-alamo sm:hidden">
          Admin
        </Link>
      )}
    </div>
  )
}
