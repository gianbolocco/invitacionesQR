'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, CameraOff, Loader2 } from 'lucide-react'
import { useMe } from '@/lib/session'
import { mensajeDeError } from '@/lib/gate'
import { interpretarLectura } from '@/lib/lectora'
import { useAbrirQr, useDniPendiente } from '@/lib/queries/garita'

type Estado = 'abriendo' | 'listo' | 'sin_camara'

const ESTADO_PILL: Record<Estado, { texto: string; punto: string }> = {
  abriendo: { texto: 'Conectando', punto: 'bg-[#e5c879]' },
  listo: { texto: 'Lector activo', punto: 'bg-escaner-acento' },
  sin_camara: { texto: 'Sin cámara', punto: 'bg-[#ff8b82]' },
}

/** Las cuatro esquinas del marco. Un solo SVG: escala con el marco y no hay que alinear spans. */
function Esquinas() {
  const d = 'M2 22 V10 A8 8 0 0 1 10 2 H22'
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
      {[0, 90, 180, 270].map((r) => (
        <path key={r} d={d} transform={`rotate(${r} 50 50)`} fill="none" stroke="currentColor"
          strokeWidth="3.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/**
 * El escáner es un visor de cámara: la cámara es la pantalla, y lo único que
 * se mueve es el marco. Respira mientras espera y se cierra sobre el QR
 * cuando lo agarra, así el guardia sabe que leyó antes de que cambie la
 * pantalla.
 */
export default function EscanearPage() {
  const me = useMe()
  const router = useRouter()
  const reducir = useReducedMotion()
  const abrirQr = useAbrirQr()
  const dniPendiente = useDniPendiente()
  const [estado, setEstado] = useState<Estado>('abriendo')
  const [error, setError] = useState<string | null>(null)
  const [validando, setValidando] = useState(false)
  const [marco, setMarco] = useState(240)
  const ultimoQr = useRef<string | null>(null)
  const procesando = useRef(false)
  const visorRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!me) return
    const scanner = new Html5Qrcode('reader', {
      verbose: false,
      // PDF417 es el código del DNI. El BarcodeDetector nativo (Chrome en
      // Android) lo lee bastante mejor que la implementación en JS.
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.PDF_417],
      useBarCodeDetectorIfSupported: true,
    })
    let vivo = true

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        // Proporcional a lo que se VE (el visor), no al video, que puede ser
        // más alto y quedar recortado. Sin tope fijo: en una PC el video va a
        // todo el ancho y un QR a distancia normal no entraría en 300px.
        qrbox: (ancho, alto) => {
          const visible = Math.min(alto, visorRef.current?.clientHeight ?? alto)
          const size = Math.floor(Math.min(ancho * 0.72, visible * 0.66))
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

        const l = interpretarLectura(texto)
        if (!l) {
          if (vivo) {
            setError('Ese código no es de VisitPass. Enfocá el QR de la invitación o el DNI.')
            setValidando(false)
          }
          procesando.current = false
          return
        }
        if (l.tipo === 'dni') {
          if (vivo) { dniPendiente.dejar(l); router.push('/garita') }
          return
        }
        try {
          if (vivo) await abrirQr(l.token)
        } catch (e) {
          if (vivo) { setError(mensajeDeError(e)); setValidando(false) }
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
  }, [me, router, abrirQr, dniPendiente])

  const salir = useCallback(() => router.push('/garita'), [router])
  const reintentar = useCallback(() => {
    ultimoQr.current = null
    setError(null)
  }, [])

  if (!me) {
    return (
      <main className="grid h-dvh place-items-center bg-escaner-fondo text-escaner-texto">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </main>
    )
  }

  const pill = ESTADO_PILL[estado]
  // Esperando: respira. Leyendo: se cierra y se queda quieto. Error: quieto.
  const marcoAnim = validando
    ? { scale: 0.9, opacity: 1 }
    : estado === 'listo' && !error && !reducir
      ? { scale: [1, 1.025, 1], opacity: [0.7, 1, 0.7] }
      : { scale: 1, opacity: 0.85 }
  const marcoTrans = validando
    ? { type: 'spring' as const, stiffness: 420, damping: 22 }
    : { duration: 2.6, ease: 'easeInOut' as const, repeat: Infinity }

  return (
    <main className="flex h-dvh min-h-[30rem] flex-col overflow-hidden bg-escaner-fondo text-escaner-texto">
      <header className="flex shrink-0 items-center gap-3 px-3 pb-2 pt-[calc(0.6rem+env(safe-area-inset-top,0px))] sm:px-5">
        <button onClick={salir} aria-label="Volver a garita"
          className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="font-display min-w-0 flex-1 truncate text-xl font-extrabold tracking-[-0.02em]">Escanear</h1>
        <p role="status" className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-white/[0.07] px-3 text-xs font-semibold">
          <span aria-hidden className={`size-2 rounded-full transition-colors duration-500 ${pill.punto}`} />
          {pill.texto}
        </p>
      </header>

      <section ref={visorRef} className="relative mx-2 min-h-0 flex-1 overflow-hidden rounded-[1.75rem] bg-black sm:mx-5">
        {/* El video va en su proporción natural y centrado, nunca estirado:
            la librería traduce el marco a coordenadas del video suponiendo
            que lo ve entero (con object-cover una webcam horizontal leería
            una región deformada). Si es más alto que el visor, se recorta
            parejo arriba y abajo, y el centro sigue coincidiendo. */}
        <div id="reader" aria-label="Vista de cámara para leer el código QR"
          className="!absolute inset-x-0 top-1/2 -translate-y-1/2 [&_video]:!h-auto [&_video]:!w-full" />

        {/* Viñeta: oscurece todo lo que no es el marco, sin tapar la cámara. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="relative rounded-[1.4rem] shadow-[0_0_0_100vmax_rgb(0_0_0/0.42)] transition-[width,height] duration-300"
            style={{ width: marco, height: marco }}>
            <motion.div className="absolute -inset-1 text-escaner-acento drop-shadow-[0_0_10px_var(--escaner-acento)]"
              animate={marcoAnim} transition={marcoTrans}>
              <Esquinas />
            </motion.div>
          </div>
        </div>

        {estado === 'abriendo' && (
          <div className="absolute inset-0 z-20 grid place-items-center">
            <Loader2 className="size-7 animate-spin opacity-70" aria-label="Abriendo la cámara" />
          </div>
        )}

        {estado === 'sin_camara' && (
          <div className="absolute inset-0 z-20 flex flex-col items-start justify-end gap-3 bg-escaner-fondo p-6 sm:p-8">
            <CameraOff className="size-8 opacity-60" aria-hidden />
            <p className="font-display text-3xl font-extrabold leading-tight tracking-[-0.02em]">No se pudo abrir la cámara</p>
            <p className="max-w-sm text-sm leading-relaxed opacity-70">
              Dale permiso de cámara al navegador y entrá por HTTPS. Mientras tanto, buscá al invitado por nombre.
            </p>
            <button onClick={salir}
              className="mt-2 min-h-12 rounded-full bg-escaner-texto px-5 text-sm font-bold text-escaner-fondo">
              Buscar por nombre
            </button>
          </div>
        )}

        {validando && (
          <motion.p role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="absolute inset-x-0 bottom-5 z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold backdrop-blur">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Validando invitación
          </motion.p>
        )}
      </section>

      <footer aria-live="polite"
        className="flex min-h-16 shrink-0 items-center gap-3 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-7">
        {error ? (
          <>
            <p className="min-w-0 flex-1 text-sm font-semibold text-[#ffb4ad]">{error}</p>
            <button onClick={reintentar}
              className="min-h-10 shrink-0 rounded-full bg-white/10 px-4 text-sm font-semibold transition-colors hover:bg-white/15">
              Reintentar
            </button>
          </>
        ) : (
          <p className="text-sm opacity-65">Centrá el QR o el código del DNI en el marco. Si cuesta, que el invitado suba el brillo.</p>
        )}
      </footer>
    </main>
  )
}
