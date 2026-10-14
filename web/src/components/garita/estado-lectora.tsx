'use client'
import Link from 'next/link'
import { CircleCheck, ScanBarcode } from 'lucide-react'
import { hora } from '@/lib/fechas'
import { useUltimaLectura } from '@/lib/queries/garita'

/**
 * El lugar de la lectora en la garita de escritorio. No dice "conectada" antes
 * de leer: para el navegador una lectora es un teclado, no hay forma de saber
 * si está enchufada. Lo afirma recién cuando lee.
 */
export function EstadoLectora() {
  const ultima = useUltimaLectura()
  return (
    <section aria-label="Lectora" className="rounded-lg border border-border p-4">
      {ultima ? (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <CircleCheck className="size-4 shrink-0" aria-hidden />Lectora funcionando
          </p>
          <p role="status" className="mt-1 text-sm tabular">{ultima.descripcion} · {hora(ultima.cuando)}</p>
        </>
      ) : (
        <p className="flex items-center gap-2 font-semibold">
          <ScanBarcode className="size-4 shrink-0" aria-hidden />Escaneá un QR o un DNI con la lectora
        </p>
      )}
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>¿No tenés lectora? <Link href="/garita/escanear" className="underline underline-offset-4">Usar la cámara</Link></span>
        <Link href="/garita/lectora" className="underline underline-offset-4">Probar lectora</Link>
      </p>
    </section>
  )
}
