'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/session'
import { useTema } from '@/lib/theme'
import { TemaToggle } from './ui'

const NAV = [
  { href: '/garita', label: 'Hoy' },
  { href: '/garita/auditoria', label: 'Auditoría' },
]

/**
 * Marco de las pantallas de garita.
 *
 * Ya no recibe ni propaga un flag de tema: el claro y el oscuro son valores de
 * las variables CSS, así que los componentes no necesitan saber en cuál están.
 * Antes cada borde y cada fondo era un condicional `oscuro ? … : …`.
 */
export function GaritaShell({ guardName, children }: {
  guardName: string
  children: React.ReactNode
}) {
  const path = usePathname()
  const [tema, setTema] = useTema()

  return (
    <div className="min-h-dvh overflow-x-hidden bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          {/* Quién está de turno se AFIRMA, no se elige: cada ingreso queda a
              nombre de quien está logueado. Mostrarlo acá es lo que hace visible
              una sesión que quedó abierta del turno anterior. */}
          <div className="min-w-0">
            <p className="eyebrow">Garita · Álamo Alto</p>
            <p className="truncate font-semibold">{guardName}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <TemaToggle tema={tema} onTema={setTema} />
            <button onClick={logout} className="underline underline-offset-4">Cambiar de guardia</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-2">
          {NAV.map((item) => {
            const activo = item.href === '/garita' ? path === '/garita' : path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                aria-current={activo ? 'page' : undefined}
                className={`border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  activo ? 'border-alamo text-alamo' : 'border-transparent text-ink-soft'
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
