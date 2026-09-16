'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout, type Me } from '@/lib/session'
import { useTema } from '@/lib/theme'
import { NAV, TOPE_BARRA, esActivo, seccionDe, type ItemNav } from '@/lib/nav'
import { TemaToggle, Wordmark } from './ui'

/**
 * Íconos propios en vez de caracteres sueltos: un rombo y un reloj tipográficos
 * no dicen nada. Un QR y una flecha que vuelve sobre un reloj sí.
 */
const trazo = {
  viewBox: '0 0 24 24', 'aria-hidden': true, className: 'size-6', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const

function IconoInvitaciones() {
  return (
    <svg {...trazo}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M17 20h4M14 20h0" />
    </svg>
  )
}

function IconoHistorial() {
  return (
    <svg {...trazo}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconoHoy() {
  return (
    <svg {...trazo}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

/** La mira del escáner: las cuatro esquinas, que es lo que el guardia ve. */
function IconoEscanear() {
  return (
    <svg {...trazo}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M8 12h8" />
    </svg>
  )
}

function IconoAuditoria() {
  return (
    <svg {...trazo}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  )
}

const ICONOS: Record<NonNullable<ItemNav['icono']>, () => React.ReactNode> = {
  invitaciones: IconoInvitaciones,
  historial: IconoHistorial,
  hoy: IconoHoy,
  escanear: IconoEscanear,
  auditoria: IconoAuditoria,
}

/** El desplegable para los menús largos: en mobile una tira de seis no se lee. */
function MenuDesplegable({ items, path }: { items: ItemNav[]; path: string }) {
  const [abierto, setAbierto] = useState(false)
  const actual = items.find((i) => esActivo(i.href, path))

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
          border-line px-5 font-semibold">
        {actual?.label ?? 'Menú'}
        <span aria-hidden className={`transition-transform ${abierto ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {abierto && (
        <>
          <button aria-hidden tabIndex={-1} onClick={() => setAbierto(false)}
            className="fixed inset-0 z-10 cursor-default bg-ink/20" />
          <nav className="surgir absolute inset-x-0 top-full z-20 border-b border-line
            bg-card shadow-lg">
            {items.map((item) => (
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
 * Pocos destinos: abajo, siempre visibles y en la zona del pulgar. Un
 * desplegable para dos o tres ítems agrega un toque para llegar a todo.
 */
function BarraInferior({ items, path }: { items: ItemNav[]; path: string }) {
  return (
    <nav aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {items.map(({ href, label, icono }) => {
        const activo = esActivo(href, path)
        const Icono = icono ? ICONOS[icono] : null
        return (
          <Link key={href} href={href}
            aria-current={activo ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1
              text-xs font-semibold transition-colors ${activo ? 'text-alamo' : 'text-ink-soft'}`}>
            {Icono && <Icono />}
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Shell({ me, accion, atras, children }: {
  me: Me
  /**
   * La acción principal de la pantalla. Se renderiza ACÁ, fuera de <main>, y no
   * es un detalle: <main> tiene la animación de entrada, que usa transform, y un
   * ancestro con transform rompe `position: fixed` — el botón quedaba anclado al
   * contenedor en vez de a la pantalla y se montaba sobre las tarjetas.
   */
  accion?: React.ReactNode
  /**
   * Cuando la pantalla es una sub-vista, el encabezado se convierte en la
   * barra de volver. Es el patrón de mobile: el "atrás" vive arriba a la
   * izquierda, grande y siempre en el mismo lugar — no perdido adentro del
   * contenido, que es donde estaba y por eso no se veía.
   */
  atras?: { label?: string; onClick: () => void }
  children: React.ReactNode
}) {
  const path = usePathname()
  const [tema, setTema] = useTema()
  const seccion = seccionDe(path, me.role)
  const nav = NAV[seccion]
  const enBarra = nav.length <= TOPE_BARRA

  /*
   * Quién está de turno se AFIRMA, no se elige: cada ingreso queda a nombre de
   * quien está logueado, y mostrarlo acá es lo que hace visible una sesión que
   * quedó abierta del turno anterior.
   */
  const subtitulo = seccion === 'garita'
    ? me.name
    : seccion === 'admin'
      ? 'Administración'
      : me.units[0]?.label ?? 'Vecino'

  return (
    <div className={`min-h-dvh ${enBarra ? 'con-barra-inferior sm:pb-0' : ''} ${accion ? 'con-accion' : ''}`}>
      <header className="sticky top-0 z-20 border-b border-alamo/15 bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          {atras ? (
            <button onClick={atras.onClick}
              className="-ml-2 flex min-h-11 items-center gap-1.5 rounded px-2 font-semibold text-alamo">
              <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              {atras.label ?? 'Volver'}
            </button>
          ) : (
            <Wordmark subtitle={subtitulo} />
          )}

          <div className="flex shrink-0 items-center gap-2">
            {/* El admin entra y sale de su sección desde cualquier pantalla. */}
            {me.role === 'admin' && seccion !== 'admin' && (
              <Link href="/admin"
                className="rounded-full border border-alamo/30 px-3 py-1.5 text-xs
                  font-semibold text-alamo">
                Admin
              </Link>
            )}
            <TemaToggle tema={tema} onTema={setTema} />
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="flex size-11 items-center justify-center rounded text-ink-soft">
              <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>

        {/* En pantalla ancha, las solapas de siempre para los tres roles. */}
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
        </nav>

        {!enBarra && <MenuDesplegable items={nav} path={path} />}
      </header>

      <main className="surgir mx-auto max-w-5xl px-5 py-6">{children}</main>

      {accion && (
        <div className={`fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3
          backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-5 sm:pb-8 sm:pt-0
          ${enBarra ? 'bottom-16' : 'bottom-0'}`}
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="mx-auto max-w-5xl">{accion}</div>
        </div>
      )}

      {enBarra && <BarraInferior items={nav} path={path} />}
    </div>
  )
}
