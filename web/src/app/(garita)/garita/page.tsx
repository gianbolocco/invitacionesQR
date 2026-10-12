'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanLine, UserPlus } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { AgendaDia } from '@/components/garita/agenda-dia'
import { BuscarInvitado } from '@/components/garita/buscar-invitado'
import { UltimosMovimientos } from '@/components/garita/ultimos-movimientos'
import { AltaExpres } from '@/components/garita/alta-expres'
import { Button, buttonVariants } from '@/components/ui/button'
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
  const [altaAbierta, setAltaAbierta] = useState(false)
  // Estado, no ref leído en el render: así Radix sabe a quién devolverle el
  // foco al cerrar el sheet (mismo patrón que DialogLote/DialogBaja del admin).
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)

  return (
    <ChromeGarita>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <BuscarInvitado onAbrir={abrir} />
          <Button type="button" variant="outline"
            onClick={(e) => { setDisparador(e.currentTarget); setAltaAbierta(true) }}>
            <UserPlus aria-hidden />Autorizar sin invitación
          </Button>
          <AgendaDia onAbrir={abrir} />
        </div>
        <aside className="hidden flex-col gap-6 md:flex">
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <UltimosMovimientos />
        </aside>
      </div>

      <AltaExpres abierto={altaAbierta} onAbiertoChange={setAltaAbierta}
        disparador={disparador} onCreada={abrir} />
    </ChromeGarita>
  )
}
