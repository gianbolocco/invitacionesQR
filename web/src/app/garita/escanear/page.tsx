'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { useMe } from '@/lib/session'
import { guardiaDeTurno, porToken, type Resultado } from '@/lib/gate'
import { Verdict } from '@/components/verdict'

export default function EscanearPage() {
  const me = useMe()
  const router = useRouter()
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [guardId, setGuardId] = useState('')
  const [estado, setEstado] = useState<'abriendo' | 'listo' | 'sin_camara'>('abriendo')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuardId(guardiaDeTurno())
  }, [])

  useEffect(() => {
    if (!me || resultado) return
    const scanner = new Html5Qrcode('reader')
    let vivo = true

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (texto) => {
        // El QR lleva la URL pública; también se acepta el token pelado.
        const token = texto.split('/i/')[1] ?? texto
        const r = await porToken(token).catch(() => null)
        if (r && vivo) setResultado(r)
      },
      () => {},
    )
      .then(() => { if (vivo) setEstado('listo') })
      .catch(() => { if (vivo) setEstado('sin_camara') })

    return () => {
      vivo = false
      scanner.stop().catch(() => {})
    }
  }, [me, resultado])

  const salir = useCallback(() => router.push('/garita'), [router])

  if (!me) return <main className="p-6">Cargando…</main>

  if (resultado) {
    // Tras registrar, vuelve a escanear: el guardia sigue en la barrera.
    return <Verdict resultado={resultado} guardId={guardId} onSalir={() => setResultado(null)} />
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-x-hidden bg-alamo-deep text-alamo-line">
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>Escanear</p>
        <button onClick={salir} className="min-h-11 text-sm underline underline-offset-4">
          Salir
        </button>
      </header>

      {/* La cámara ocupa el espacio disponible, no un cuadrado fijo: en un
          celular angosto un aspect-square se comía la pantalla entera. */}
      <div className="relative flex-1">
        <div id="reader" className="absolute inset-0 overflow-hidden [&_video]:size-full [&_video]:object-cover" />

        {estado !== 'listo' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            {estado === 'abriendo' ? (
              <p className="opacity-80">Abriendo la cámara…</p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="display text-xl">No se pudo abrir la cámara</p>
                <p className="opacity-80">
                  Puede que el navegador no tenga permiso, o que la pantalla no esté en HTTPS.
                </p>
                <button onClick={salir}
                  className="min-h-14 rounded bg-alamo-line px-5 font-semibold text-alamo-deep">
                  Buscar por apellido
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="px-4 py-4 text-center opacity-70">
        Apuntá al código que muestra el invitado.
      </p>
    </main>
  )
}
