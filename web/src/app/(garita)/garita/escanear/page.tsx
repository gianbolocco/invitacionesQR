'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { useMe } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { porToken } from '@/lib/gate'
import { usePrecargarVeredicto } from '@/lib/queries/garita'

function tokenDelQr(texto: string): string | null {
  try {
    const url = new URL(texto)
    return url.pathname.match(/^\/i\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null
  } catch {
    return /^[A-Za-z0-9_-]+$/.test(texto) ? texto : null
  }
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'
    if (error.status === 403) return 'Esta cuenta no tiene permiso para usar la garita.'
    if (error.status === 404) return 'El QR no corresponde a una invitación válida.'
  }
  return 'No se pudo validar el QR. Revisá la conexión e intentá de nuevo.'
}

export default function EscanearPage() {
  const me = useMe()
  const router = useRouter()
  const precargarVeredicto = usePrecargarVeredicto()
  const [estado, setEstado] = useState<'abriendo' | 'listo' | 'sin_camara'>('abriendo')
  const [error, setError] = useState<string | null>(null)
  const [validando, setValidando] = useState(false)
  const [marco, setMarco] = useState(240)
  const ultimoQr = useRef<string | null>(null)
  const procesando = useRef(false)

  useEffect(() => {
    if (!me) return
    const scanner = new Html5Qrcode('reader', { verbose: false })
    let vivo = true

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        qrbox: (ancho, alto) => {
          const size = Math.floor(Math.min(280, ancho * 0.76, alto * 0.68))
          setMarco(size)
          return { width: size, height: size }
        },
      },
      async (texto) => {
        if (procesando.current || ultimoQr.current === texto) return
        procesando.current = true
        ultimoQr.current = texto
        setError(null)
        setValidando(true)

        const token = tokenDelQr(texto)
        if (!token) {
          if (vivo) {
            setError('No reconozco este código. Enfocá una invitación de VisitPass dentro del marco.')
            setValidando(false)
          }
          procesando.current = false
          return
        }

        try {
          const r = await porToken(token)
          if (vivo) {
            precargarVeredicto(r.invitation.id, r)
            router.push(`/garita/invitacion/${r.invitation.id}`)
          }
        } catch (e) {
          if (vivo) {
            setError(mensajeDeError(e))
            setValidando(false)
          }
        } finally {
          procesando.current = false
        }
      },
      () => {},
    )
      .then(() => { if (vivo) setEstado('listo') })
      .catch(() => { if (vivo) setEstado('sin_camara') })

    return () => {
      vivo = false
      scanner.stop().catch(() => {})
    }
  }, [me, router, precargarVeredicto])

  const salir = useCallback(() => router.push('/garita'), [router])
  const reintentar = useCallback(() => {
    ultimoQr.current = null
    setError(null)
  }, [])

  if (!me) return <main className="p-6">Cargando…</main>

  const camaraLista = estado === 'listo'

  return (
    <main className="flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-escaner-fondo text-escaner-texto">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[calc(0.7rem+env(safe-area-inset-top,0px))] sm:px-6">
        <button onClick={salir} aria-label="Volver a garita"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow" style={{ color: 'inherit', opacity: 0.56 }}>Control de acceso</p>
          <p className="display text-lg leading-tight">Garita</p>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 text-[0.65rem] font-semibold tracking-[0.12em]">
          <span className={`size-2 rounded-full ${camaraLista ? 'bg-[#88dda2]' : estado === 'sin_camara' ? 'bg-[#ff8b82]' : 'bg-[#e5c879]'}`} />
          {camaraLista ? 'LECTOR ACTIVO' : estado === 'sin_camara' ? 'SIN CÁMARA' : 'CONECTANDO'}
        </div>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:pt-5">
        <div className="flex shrink-0 items-end justify-between gap-3">
          <div>
            <p className="eyebrow" style={{ color: 'inherit', opacity: 0.58 }}>Lector QR</p>
            <h1 className="display mt-1 text-[1.7rem] leading-tight sm:text-3xl">Escanear invitación</h1>
          </div>
          <span className="mb-1 hidden rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.12em] opacity-70 sm:inline-flex">
            AUTOMÁTICO
          </span>
        </div>

        <div className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-[1.35rem] border border-white/15 bg-[#07100c] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div id="reader" aria-label="Vista de cámara para leer el código QR"
            className="absolute inset-0 overflow-hidden [&_video]:size-full [&_video]:object-cover" />

          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="relative rounded-xl" style={{ width: marco, height: marco }}>
              <span className="absolute left-0 top-0 size-9 rounded-tl-xl border-l-[3px] border-t-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute right-0 top-0 size-9 rounded-tr-xl border-r-[3px] border-t-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute bottom-0 left-0 size-9 rounded-bl-xl border-b-[3px] border-l-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
              <span className="absolute bottom-0 right-0 size-9 rounded-br-xl border-b-[3px] border-r-[3px] border-[#d8f6df] shadow-[0_0_14px_rgba(150,255,180,0.3)]" />
            </div>
          </div>

          {estado === 'abriendo' && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 px-6 text-center">
              <p className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm">Abriendo la cámara…</p>
            </div>
          )}

          {estado === 'sin_camara' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07100c]/95 px-8 text-center">
              <p className="display text-2xl">No se pudo abrir la cámara</p>
              <p className="max-w-sm text-sm leading-relaxed text-white/70">
                Revisá el permiso de cámara del navegador y que estés entrando por HTTPS.
              </p>
              <button onClick={salir} className="mt-2 min-h-12 rounded-full border border-white/20 px-5 text-sm font-semibold">
                Volver a garita
              </button>
            </div>
          )}

          {validando && (
            <div role="status" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-[#07100c]/85 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur">
              Validando invitación…
            </div>
          )}
        </div>

        <footer aria-live="polite" className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
          <div aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg">
            {error ? '!' : '⌗'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{error ? 'No se pudo leer la invitación' : 'Escaneo automático'}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/65">
              {error ?? 'Centrala dentro del marco y subí el brillo de la pantalla del invitado.'}
            </p>
          </div>
          {error && (
            <button onClick={reintentar} className="min-h-10 shrink-0 rounded-full border border-white/20 px-3 text-xs font-semibold">
              Reintentar
            </button>
          )}
        </footer>
      </section>
    </main>
  )
}
