'use client'
import { use, useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, SearchX, Sun } from 'lucide-react'
import { api } from '@/lib/api'
import { KIND_LABEL, PORTERIA, vigencia, type Invitation } from '@/lib/invitations'
import { hoyISO } from '@/lib/fechas'
import { planoUrl, useMarca } from '@/lib/marca-cliente'
import { loteDeLabel } from '@/lib/plano'
import { type Franja } from '@/lib/franjas'
import { HorarioRubro } from '@/components/dominio/horario-rubro'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CamposSeguro, erroresSeguro, estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
import { Campo } from '@/components/dominio/campo'
import { PlanoBarrio } from '@/components/dominio/plano-barrio'
import { Marca } from '@/components/dominio/marca'
import { Nota } from '@/components/dominio/nota'
import { Pase } from '@/components/dominio/pase'
import { Vacio } from '@/components/dominio/vacio'
import { SelectorTema } from '@/components/selector-tema'

type Publica = {
  guestName: string
  kind: Invitation['kind']
  validFrom: string
  validTo: string
  revokedAt: string | null
  unitLabel: string
  inviterName: string
  neighborhood: { name: string; address: string | null; mapUrl: string | null }
  hasDoc: boolean
  hasPlate: boolean
  frozen: boolean
  tradeName: string | null
  franjas: Franja[]
  requiresInsurance: boolean
  insuranceState: 'sin_cargar' | 'vigente' | 'vencido'
}

/** Pide SOLO lo que falta. Los datos se piden una vez. */
function FormularioDatos({ token, faltaDoc, faltaPatente, pideSeguro, estadoSeguro }: {
  token: string; faltaDoc: boolean; faltaPatente: boolean
  pideSeguro: boolean; estadoSeguro: Publica['insuranceState']
}) {
  const qc = useQueryClient()
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [seguro, setSeguro] = useState<ValorSeguro>({ company: '', policy: '', expiresOn: '' })
  const [errorSeguro, setErrorSeguro] = useState(false)
  const guardar = useMutation({
    mutationFn: () => api(`/invitations/public/${token}`, {
      method: 'PATCH',
      body: JSON.stringify({ guestDoc: doc.trim() || undefined, plate: plate.trim() || undefined,
        // Nunca null desde acá: vaciar el seguro lo hace el vecino.
        insurance: estadoSeguroCargado(seguro) === 'completo'
          ? { company: seguro.company.trim(), policy: seguro.policy.trim(), expiresOn: seguro.expiresOn } : undefined }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publica', token] }),
  })

  if (guardar.isSuccess) return <Nota tono="exito">Listo. El guardia ya tiene tus datos.</Nota>

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const parcial = pideSeguro && estadoSeguroCargado(seguro) === 'parcial'
      setErrorSeguro(parcial)
      if (parcial) return
      if (doc.trim() || plate.trim() || (pideSeguro && estadoSeguroCargado(seguro) === 'completo')) guardar.mutate()
    }}
      className="flex flex-col gap-5 rounded-lg border border-line bg-card p-5">
      <div>
        <p className="font-display text-lg font-bold tracking-[-0.01em]">Entrá más rápido</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {faltaDoc && faltaPatente
            ? 'Cargá tus datos y el guardia no te los tiene que pedir en la barrera.'
            : !faltaDoc && !faltaPatente
              ? 'Cargá tu seguro y el guardia no te lo tiene que pedir en la barrera.'
              : faltaDoc
              ? 'Cargá tu documento y el guardia no te lo tiene que pedir en la barrera.'
              : 'Si venís en auto, cargá la patente y no te la piden en la barrera.'}
        </p>
      </div>
      {faltaDoc && (
        <Campo id="doc" etiqueta="Documento" ayuda="DNI, pasaporte o documento del país que sea.">
          <Input id="doc" value={doc} className="tabular" placeholder="30.123.456" aria-describedby="doc-nota"
            onChange={(e) => setDoc(e.target.value)} />
        </Campo>
      )}
      {faltaPatente && (
        <Campo id="patente" etiqueta="Patente">
          <Input id="patente" value={plate} className="uppercase tabular" placeholder="AB 123 CD"
            onChange={(e) => setPlate(e.target.value)} />
        </Campo>
      )}
      {pideSeguro && (
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <div>
            <p className="font-semibold">Tu seguro</p>
            <p className="text-sm text-ink-soft">Sin un seguro vigente la guardia no te deja pasar.</p>
          </div>
          {estadoSeguro === 'vigente' && <p className="text-sm font-semibold text-verde">Ya hay un seguro vigente cargado. Cargalo de nuevo solo si cambió.</p>}
          {estadoSeguro === 'vencido' && <p className="text-sm font-semibold text-alto">El seguro cargado está vencido.</p>}
          <CamposSeguro idBase="seguro" valor={seguro} onCambio={(v) => { setSeguro(v); setErrorSeguro(false) }}
            errores={errorSeguro ? erroresSeguro(seguro) : undefined} />
        </div>
      )}
      {guardar.isError && <Nota tono="error">No se pudo guardar. Probá de nuevo o mostrá el QR igual: vas a poder entrar.</Nota>}
      <Button type="submit" disabled={guardar.isPending}>
        {guardar.isPending && <Loader2 className="animate-spin" aria-hidden />}
        Guardar
      </Button>
    </form>
  )
}

export default function InvitacionPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const marca = useMarca()
  const q = useQuery({
    queryKey: ['publica', token],
    queryFn: ({ signal }) => api<Publica>(`/invitations/public/${token}`, { signal }),
  })

  const encabezado = (
    <header className="flex items-center justify-between gap-3">
      <Marca />
      <SelectorTema />
    </header>
  )

  if (q.isPending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
        {encabezado}
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[34rem] w-full rounded-lg" />
      </main>
    )
  }

  if (q.isError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
        {encabezado}
        <Vacio icono={SearchX} titulo="Esta invitación no existe"
          detalle="Pedile a quien te invitó que te mande el link de nuevo." />
      </main>
    )
  }

  const inv = q.data
  const anulada = Boolean(inv.revokedAt)
  const vencida = inv.validTo < hoyISO()
  const sello = anulada ? 'Anulada' : vencida ? 'Vencida' : undefined
  const url = typeof window === 'undefined' ? '' : window.location.href
  const { address, mapUrl } = inv.neighborhood
  const lote = loteDeLabel(inv.unitLabel)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      {encabezado}

      <p className="text-ink-soft">
        {inv.inviterName === PORTERIA
          ? <strong className="text-ink">{PORTERIA}</strong>
          : <>Te invita <strong className="text-ink">{inv.inviterName}</strong></>}
        {' · '}<span className="tabular">{inv.unitLabel}</span>
      </p>

      {sello && <Nota tono="error">Esta invitación está {sello.toLowerCase()}. Pedile una nueva a quien te invitó.</Nota>}

      <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        <Pase qr={url} apagado={Boolean(sello)} sello={sello} className="mx-auto"
          datos={{
            barrio: inv.neighborhood.name,
            tipo: KIND_LABEL[inv.kind],
            vigencia: vigencia({ validFrom: inv.validFrom, validTo: inv.validTo, weekdays: null }),
            invitado: inv.guestName,
            unidad: inv.unitLabel,
            invita: inv.inviterName,
          }} />
      </motion.div>

      {!sello && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-soft">
          <Sun className="size-4" aria-hidden />Mostrá esta pantalla en la garita con el brillo alto.
        </p>
      )}

      {!sello && inv.tradeName && inv.franjas.length > 0 && (
        <section className="flex flex-col gap-2">
          <HorarioRubro titulo={`Horario de ingreso · ${inv.tradeName}`} franjas={inv.franjas} />
          <p className="text-sm text-ink-soft">Fuera de ese horario la guardia no te deja pasar.</p>
        </section>
      )}

      {!sello && !inv.frozen && (!inv.hasDoc || !inv.hasPlate || inv.requiresInsurance) && (
        <FormularioDatos token={token} faltaDoc={!inv.hasDoc} faltaPatente={!inv.hasPlate}
          pideSeguro={inv.requiresInsurance} estadoSeguro={inv.insuranceState} />
      )}

      {(address || mapUrl) && (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-card p-5">
          <p className="text-[13px] font-semibold text-ink-soft">Cómo llegar</p>
          {address && <p>{address}</p>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
              <MapPin aria-hidden />Abrir en el mapa
            </a>
          )}
        </section>
      )}

      {marca.tienePlano && <PlanoBarrio src={planoUrl(marca, lote) ?? ''} lote={lote} />}
    </main>
  )
}
