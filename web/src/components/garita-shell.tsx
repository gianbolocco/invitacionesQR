'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/session'

const NAV = [
  { href: '/garita', label: 'Hoy' },
  { href: '/garita/auditoria', label: 'Auditoría' },
]

/**
 * Marco de las pantallas de garita. Separado del Shell del vecino porque la
 * garita puede ir en modo oscuro y no tiene wordmark grande: la pantalla es
 * para trabajar, no para presentar la marca.
 */
export function GaritaShell({ oscuro, onTema, children }: {
  oscuro: boolean
  onTema: () => void
  children: React.ReactNode
}) {
  const path = usePathname()

  return (
    <div className={`min-h-dvh overflow-x-hidden ${oscuro ? 'bg-alamo-deep text-alamo-line' : 'bg-surface text-ink'}`}>
      <header className={`border-b ${oscuro ? 'border-white/15' : 'border-ink/12'}`}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>Garita · Álamo Alto</p>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={onTema} className="underline underline-offset-4">
              {oscuro ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button onClick={logout} className="underline underline-offset-4">Salir</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-2">
          {NAV.map((item) => {
            const activo = item.href === '/garita' ? path === '/garita' : path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                aria-current={activo ? 'page' : undefined}
                className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${
                  activo ? 'border-current' : 'border-transparent opacity-60'
                }`}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  )
}
