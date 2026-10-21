'use client'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useSesion } from '@/lib/sesion-contexto'
import { useInvitacion } from '@/lib/queries/invitaciones'
import { sePuedeEditar } from '@/lib/estado-invitacion'
import { hoyISO } from '@/lib/fechas'
import { Vacio } from '@/components/dominio/vacio'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { FormularioInvitacion } from '@/components/vecino/formulario-invitacion'

export default function EditarInvitacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const me = useSesion()
  const router = useRouter()
  const q = useInvitacion(id)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-7">
      <Link href={`/invitaciones/${id}`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start -ml-2' })}>
        <ArrowLeft aria-hidden />Volver al pase
      </Link>
      <EncabezadoPagina antetitulo="Editar" titulo={q.data?.guestName ?? 'Invitación'}
        subtitulo="El código no cambia: quien ya tenga el link sigue usando el mismo." />
      {q.isPending ? (
        <SkeletonFilas filas={3} />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : !sePuedeEditar(q.data, hoyISO()) ? (
        // Se llega por URL directa: el pase ya no ofrece Editar en este caso.
        <Vacio icono={Lock} titulo="Esta invitación ya no se puede editar"
          detalle="Solo se editan las invitaciones que todavía no se usaron. Para invitar de nuevo, creá una nueva desde el pase." />
      ) : (
        <FormularioInvitacion units={me.units} invitacion={q.data}
          onListo={() => { toast.success('Cambios guardados'); router.replace(`/invitaciones/${id}`) }} />
      )}
    </div>
  )
}
