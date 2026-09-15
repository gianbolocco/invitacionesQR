'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, type Me } from '@/lib/session'
import { Wordmark } from './ui'

const RESIDENT_NAV = [
  { href: '/', label: 'Invitaciones' },
  { href: '/historial', label: 'Historial' },
]

const ADMIN_NAV = [
  { href: '/admin', label: 'Tablero' },
  { href: '/admin/unidades', label: 'Unidades' },
  { href: '/admin/usuarios', label: 'Usuarios' },
  { href: '/admin/guardias', label: 'Guardias' },
  { href: '/admin/barrio', label: 'Barrio' },
  { href: '/admin/bitacora', label: 'Bitácora' },
]

export function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname()
  const nav = path.startsWith('/admin') ? ADMIN_NAV : RESIDENT_NAV

  return (
    <div className="min-h-dvh">
      <header className="border-b border-alamo/15 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Wordmark subtitle={me.units[0]?.label ?? me.role} />
          <button onClick={logout} className="text-sm text-ink-soft underline underline-offset-4">
            Cerrar sesión
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3">
          {nav.map((item) => {
            const active = item.href === '/' ? path === '/' : path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${
                  active ? 'border-alamo text-alamo' : 'border-transparent text-ink-soft'
                }`}>
                {item.label}
              </Link>
            )
          })}
          {me.role === 'admin' && !path.startsWith('/admin') && (
            <Link href="/admin" className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5
              text-sm font-semibold text-ink-soft">
              Administración
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  )
}
