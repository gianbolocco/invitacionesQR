'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Ban, Check, Copy, Loader2, Pencil, RotateCcw, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { useMarca } from '@/lib/marca-cliente'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { urlVolverAInvitar, type Invitation } from '@/lib/invitations'
import { hoyISO } from '@/lib/fechas'

/**
 * Lo que se puede hacer con un pase. Compartir es lo principal: abre el
 * selector del sistema (WhatsApp incluido) sin librería ni API de Meta.
 */
export function AccionesPase({ inv, url, onAnular, onHabilitar, habilitando }: {
  inv: Invitation
  url: string
  onAnular: () => void
  onHabilitar: () => void
  habilitando: boolean
}) {
  const marca = useMarca()
  const [copiado, setCopiado] = useState(false)
  const estado = estadoInvitacion(inv, hoyISO())

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Mantené apretado el link para copiarlo a mano.')
    }
  }

  async function compartir() {
    const texto = `Hola ${inv.guestName}, te dejo el acceso a ${marca.nombre}: ${url}`
    if (navigator.share) {
      await navigator.share({ title: `Invitación a ${marca.nombre}`, text: texto, url }).catch(() => {})
      return
    }
    await copiar()
  }

  if (estado === 'anulada') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button size="lg" onClick={onHabilitar} disabled={habilitando}>
          {habilitando ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          Volver a habilitar
        </Button>
        <Link href={urlVolverAInvitar(inv)} className={buttonVariants({ variant: 'outline' })}>Invitar de nuevo</Link>
      </div>
    )
  }

  if (estado === 'vencida' || estado === 'salio') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Link href={urlVolverAInvitar(inv)} className={buttonVariants({ size: 'lg' })}>
          <RotateCcw aria-hidden />Volver a invitar
        </Link>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Button size="lg" onClick={compartir}><Share2 aria-hidden />Compartir</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copiar}>
          {copiado ? <Check className="animate-in zoom-in duration-200" aria-hidden /> : <Copy aria-hidden />}
          {copiado ? 'Copiado' : 'Copiar link'}
        </Button>
        <Link href={`/invitaciones/${inv.id}/editar`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil aria-hidden />Editar
        </Link>
      </div>
      {/* No se puede anular con el invitado adentro — el servidor lo
          rechaza, así que acá ni se ofrece. */}
      {estado === 'adentro' ? (
        <p className="text-center text-sm text-ink-soft">No se puede anular mientras está adentro.</p>
      ) : (
        <Button variant="ghost" className="text-peligro hover:bg-peligro/10 hover:text-peligro" onClick={onAnular}>
          <Ban aria-hidden />Anular invitación
        </Button>
      )}
    </div>
  )
}
