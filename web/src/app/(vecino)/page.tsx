'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Home as Casa, Plus, Ticket } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { useInvitaciones } from '@/lib/queries/invitaciones'
import { buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Vacio } from '@/components/dominio/vacio'
import { FilaInvitacion } from '@/components/vecino/fila-invitacion'
import { ElegirContacto } from '@/components/vecino/elegir-contacto'
import { useContactos } from '@/lib/queries/contactos'
import { cn } from '@/lib/utils'

const NUEVA = '/invitaciones/nueva'

export default function InicioVecino() {
  const me = useSesion()
  const q = useInvitaciones()
  const variasUnidades = me.units.length > 1
  const sinUnidad = me.units.length === 0
  const contactos = useContactos()
  const [eligiendo, setEligiendo] = useState(false)
  // Sin contactos no hay nada que elegir: directo al formulario, como antes.
  const hayContactos = (contactos.data?.length ?? 0) > 0
  const nueva = (className: string) => hayContactos ? (
    <button type="button" onClick={() => setEligiendo(true)} className={className}>
      <Plus aria-hidden />Nueva invitación
    </button>
  ) : (
    <Link href={NUEVA} className={className}>
      <Plus aria-hidden />Nueva invitación
    </Link>
  )

  return (
    <div className="flex flex-col gap-7 pb-24 sm:pb-0">
      <EncabezadoPagina
        antetitulo={me.units[0]?.label ?? 'Tu casa'}
        titulo={<>Hola, <em>{me.name.split(' ')[0]}.</em></>}
        acciones={!sinUnidad && nueva(cn(buttonVariants({ size: 'lg' }), 'hidden sm:inline-flex'))} />

      {sinUnidad ? (
        <Vacio icono={Casa} titulo="Todavía no tenés una unidad"
          detalle="Pedile a la administración que te asigne tu lote para poder invitar." />
      ) : q.isPending ? (
        <SkeletonFilas />
      ) : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : q.data.length === 0 ? (
        <Vacio icono={Ticket} titulo="Todavía no invitaste a nadie"
          detalle="Creá una invitación y compartila por WhatsApp. Le llega el pase con el QR." />
      ) : (
        <section aria-labelledby="vigentes">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <h2 id="vigentes" className="text-[13px] font-semibold text-ink-soft">
              Invitaciones vigentes
            </h2>
            <span className="text-[13px] font-semibold text-ink-soft tabular">{q.data.length}</span>
          </div>
          {/* Entran escalonadas la primera vez; una anulada se va deslizando. */}
          <motion.ul initial="oculto" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}>
            <AnimatePresence initial={false}>
              {q.data.map((inv) => (
                <motion.li key={inv.id} layout
                  variants={{ oculto: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}>
                  <FilaInvitacion inv={inv} mostrarUnidad={variasUnidades}
                    mostrarCreador={inv.createdBy !== me.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </section>
      )}

      {!sinUnidad && nueva(cn(buttonVariants({ size: 'lg' }),
        'fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 shadow-(--sombra-flotante) sm:hidden'))}
      <ElegirContacto abierto={eligiendo} onAbiertoChange={setEligiendo} />
    </div>
  )
}
