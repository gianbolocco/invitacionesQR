'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { ArrowLeft, Loader2, SearchX } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAnularInvitacion, useInvitacion, useRestaurarInvitacion } from '@/lib/queries/invitaciones'
import { estadoInvitacion } from '@/lib/estado-invitacion'
import { datosPase, urlPublica } from '@/lib/invitations'
import { cupoTexto, hoyISO } from '@/lib/fechas'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Pase } from '@/components/dominio/pase'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { AccionesPase } from '@/components/vecino/acciones-pase'

const SELLO = { anulada: 'Anulada', vencida: 'Vencida' } as const

export default function DetalleInvitacion({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ creada?: string }>
}) {
  const { id } = use(params)
  const { creada } = use(searchParams)
  const router = useRouter()
  const q = useInvitacion(id)
  const anular = useAnularInvitacion()
  const restaurar = useRestaurarInvitacion()
  const [confirmando, setConfirmando] = useState(false)

  const volver = (
    <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
      <ArrowLeft aria-hidden />Invitaciones
    </Link>
  )

  if (q.isPending) {
    return (
      <div className="flex flex-col items-center gap-6">
        {volver}
        <Skeleton className="h-[34rem] w-full max-w-sm rounded-xl" />
      </div>
    )
  }

  if (q.isError) {
    const noEsTuya = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403)
    return (
      <div className="flex flex-col gap-6">
        {volver}
        {noEsTuya ? (
          <Vacio icono={SearchX} titulo="No encontramos esta invitación"
            detalle="Puede que no exista o que sea de otra casa." />
        ) : (
          <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
        )}
      </div>
    )
  }

  const inv = q.data
  const estado = estadoInvitacion(inv, hoyISO())
  const sello = estado === 'anulada' || estado === 'vencida' ? SELLO[estado] : undefined
  const url = urlPublica(inv.token)
  const cupo = cupoTexto(inv)

  return (
    <div className="flex flex-col items-center gap-6">
      {volver}
      {creada === '1' && (
        <Nota tono="exito" className="w-full max-w-sm">Listo. Compartila con {inv.guestName}.</Nota>
      )}

      {/* El pase entra con un resorte: es el momento en que la invitación existe. */}
      <motion.div className="w-full max-w-sm"
        initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        <Pase datos={datosPase(inv)} qr={url} apagado={Boolean(sello)} sello={sello} />
      </motion.div>

      <p className="max-w-sm text-center text-sm text-ink-soft">
        {cupo ? `${cupo}. ` : ''}Quien lo reciba tiene que subir el brillo para que el lector lo tome.
      </p>

      <AccionesPase inv={inv} url={url}
        onAnular={() => setConfirmando(true)}
        onHabilitar={() => restaurar.mutate(inv)}
        habilitando={restaurar.isPending} />

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Anular la invitación de {inv.guestName}?</DialogTitle>
            <DialogDescription>No va a poder entrar. Si ya estaba en la barrera, avisale.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={anular.isPending}
              onClick={() => anular.mutate(inv, {
                onSuccess: () => { setConfirmando(false); router.push('/') },
              })}>
              {anular.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
