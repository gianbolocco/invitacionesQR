'use client'
import { useEffect } from 'react'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'

/**
 * Si una pantalla rompe, se ve esto en vez de la pantalla blanca de Next.
 * Lo que rompió queda en la consola para poder diagnosticarlo.
 */
export default function ErrorDeSeccion({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    if (error.digest) console.error('digest:', error.digest)
  }, [error])
  return (
    <main className="grid min-h-[60dvh] place-items-center">
      <ErrorConReintento
        titulo="Algo salió mal en esta pantalla"
        detalle="Probá de nuevo. Si sigue pasando, avisale a la administración."
        onReintentar={reset} />
    </main>
  )
}
