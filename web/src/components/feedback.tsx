'use client'
import { useEffect, useRef, useState } from 'react'
import { Button, Filete } from './ui'

/* ---------------------------------------------------------------- Skeletons */

/**
 * Los skeletons tienen la forma de lo que viene, no una barra genérica: si el
 * hueco no coincide con el contenido real, el salto al cargar se nota más que
 * si no hubiera habido nada.
 */
export function SkeletonLinea({ ancho = 'w-32' }: { ancho?: string }) {
  return <span className={`skeleton block h-3.5 ${ancho}`} />
}

export function SkeletonTarjetas({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: cantidad }, (_, i) => (
        <li key={i}>
          <Filete className="flex items-center justify-between gap-4 bg-white px-4 py-3.5">
            <div className="flex flex-col gap-2">
              <SkeletonLinea ancho="w-16" />
              <SkeletonLinea ancho="w-40" />
              <SkeletonLinea ancho="w-28" />
            </div>
            <span className="skeleton h-12 w-24" />
          </Filete>
        </li>
      ))}
    </ul>
  )
}

export function SkeletonFilas({ cantidad = 6, columnas = 6 }: { cantidad?: number; columnas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: columnas }, (_, c) => (
            <SkeletonLinea key={c} ancho={c === 0 ? 'w-40' : 'w-20'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonTiles({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cantidad }, (_, i) => (
        <Filete key={i} className="bg-white px-4 py-3.5">
          <SkeletonLinea ancho="w-24" />
          <span className="skeleton mt-3 block h-8 w-16" />
        </Filete>
      ))}
    </div>
  )
}

/** Para que el lector de pantalla sepa que algo está cargando. */
export function Cargando({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------- Avisos */

/**
 * Un aviso que se va solo. Antes quedaban pegados en pantalla para siempre:
 * "le mandamos la invitación a X" seguía ahí media hora después.
 */
export function useAviso(ms = 4000) {
  const [aviso, setAvisoState] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function setAviso(texto: string | null) {
    if (timer.current) clearTimeout(timer.current)
    setAvisoState(texto)
    if (texto) timer.current = setTimeout(() => setAvisoState(null), ms)
  }

  return [aviso, setAviso] as const
}

export function Aviso({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="status"
      className="surgir rounded border-l-4 border-alamo bg-alamo/5 px-3 py-2 text-sm text-alamo">
      {children}
    </p>
  )
}

/* ------------------------------------------------------------ Confirmación */

/**
 * Reemplaza al confirm() del navegador, que abre un cuadro gris del sistema
 * operativo ajeno al diseño y, en mobile, feo y desubicado.
 */
export function Confirmar({ titulo, detalle, accion, onConfirmar, onCancelar }: {
  titulo: string
  detalle?: string
  accion: string
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const aceptarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    aceptarRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancelar])

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="surgir w-full max-w-sm">
        <Filete className="flex flex-col gap-4 bg-white p-5">
          <div>
            <p className="display text-lg">{titulo}</p>
            {detalle && <p className="mt-1 text-sm text-ink-soft">{detalle}</p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button ref={aceptarRef} onClick={onConfirmar} className="sm:flex-1">{accion}</Button>
            <Button variant="quiet" onClick={onCancelar} className="sm:flex-1">Cancelar</Button>
          </div>
        </Filete>
      </div>
    </div>
  )
}
