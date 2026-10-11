'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { AgendaDia } from '@/components/garita/agenda-dia'
import { BuscarInvitado } from '@/components/garita/buscar-invitado'
import { UltimosMovimientos } from '@/components/garita/ultimos-movimientos'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * "Hoy": buscador y agenda siempre visibles. El botón de escanear vive en el
 * centro de la barra inferior en mobile (lo pone `ChromeGarita`); acá, en la
 * columna derecha, solo aparece a partir de 768px —agenda a la izquierda,
 * escanear + buscar + últimos movimientos a la derecha—, porque antes de ese
 * ancho la columna se aprieta.
 */
export default function GaritaHoy() {
  const router = useRouter()
  const abrir = (id: string) => router.push(`/garita/invitacion/${id}`)

  return (
    <ChromeGarita>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <BuscarInvitado onAbrir={abrir} />
          <AgendaDia onAbrir={abrir} />
        </div>
        <aside className="hidden flex-col gap-6 md:flex">
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <UltimosMovimientos />
        </aside>
      </div>
    </ChromeGarita>
  )
}
