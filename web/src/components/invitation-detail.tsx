'use client'
import { KIND_LABEL, vigencia, type Invitation } from '@/lib/invitations'
import { Button, Eyebrow, Filete } from './ui'
import { QrShare } from './qr-share'
import { InvitationForm } from './invitation-form'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <Eyebrow>{label}</Eyebrow>
      <span className="text-right tabular">{children}</span>
    </div>
  )
}

/**
 * El detalle de una invitación: el QR, sus datos y qué se puede hacer con ella.
 *
 * `editando` lo maneja la página, no este componente, porque el botón de volver
 * vive en el encabezado del Shell y tiene que saber si está saliendo de la
 * edición o del detalle.
 */
export function InvitationDetail({
  inv, units, editando, onEditar, onAnular, onGuardado, onVerAnotados,
}: {
  inv: Invitation
  units: { id: string; label: string }[]
  editando: boolean
  onEditar: () => void
  onAnular: () => void
  onGuardado: () => void
  onVerAnotados?: () => void
}) {
  if (editando) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <div>
          <h1 className="display text-2xl">Editar invitación</h1>
          <p className="mt-1 text-sm text-ink-soft">
            El código no cambia: quien ya tenga el link sigue usando el mismo.
          </p>
        </div>
        <InvitationForm units={units} invitacion={inv} onCreated={onGuardado} />
      </div>
    )
  }

  const esEvento = inv.kind === 'evento'

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <QrShare token={inv.token} guestName={inv.guestName} />

      <Filete className="bg-card px-4 py-2">
        <Dato label="Tipo">{KIND_LABEL[inv.kind]}</Dato>
        <Dato label="Vigencia">{vigencia(inv)}</Dato>
        {inv.guestDoc && <Dato label="Documento">{inv.guestDoc}</Dato>}
        {inv.plate && <Dato label="Patente">{inv.plate}</Dato>}
        {esEvento && <Dato label="Cupo">{inv.usedCount} de {inv.capacity} entraron</Dato>}
        <Dato label="Unidad">{inv.unitLabel}</Dato>
      </Filete>

      <div className="flex flex-col gap-2">
        {esEvento && onVerAnotados && (
          <Button variant="quiet" onClick={onVerAnotados}>Ver quién se anotó</Button>
        )}
        <Button variant="quiet" onClick={onEditar}>Editar</Button>
        <Button variant="peligro" onClick={onAnular}>Anular invitación</Button>
      </div>
    </div>
  )
}
