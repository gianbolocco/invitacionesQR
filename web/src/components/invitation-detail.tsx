'use client'
import { KIND_LABEL, vigencia, type Invitation } from '@/lib/invitations'
import { Button, Eyebrow, Filete } from './ui'
import { QrShare } from './qr-share'
import { EventShare } from './event-share'
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
  inv, units, editando, onEditar, onAnular, onHabilitar, onGuardado, onVerAnotados,
}: {
  inv: Invitation
  units: { id: string; label: string }[]
  editando: boolean
  onEditar: () => void
  onAnular: () => void
  /** Si viene, una invitación anulada se puede volver a habilitar. */
  onHabilitar?: () => void
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

  // Un anotado tiene kind 'evento' pero su link es un QR personal, no la puerta
  // de anotación del evento.
  const esEvento = inv.kind === 'evento' && !inv.parentId
  const anulada = Boolean(inv.revokedAt)

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      {anulada && (
        <p role="status" className="filete bg-deny-field/5 px-4 py-3 text-sm">
          <strong>Anulada.</strong> Con este código no puede entrar.
        </p>
      )}

      {esEvento
        ? <EventShare inv={inv} />
        : <QrShare token={inv.token} guestName={inv.guestName} />}

      <Filete className="bg-card px-4 py-2">
        <Dato label="Tipo">{KIND_LABEL[inv.kind]}</Dato>
        <Dato label="Vigencia">{vigencia(inv)}</Dato>
        {inv.guestDoc && <Dato label="Documento">{inv.guestDoc}</Dato>}
        {inv.plate && <Dato label="Patente">{inv.plate}</Dato>}
        {/* Dos números distintos: anotados es antes de la fiesta, entraron es
            durante. El vecino mira el primero para saber si repartir más. */}
        {esEvento && <Dato label="Anotados">{inv.joinedCount} de {inv.capacity}</Dato>}
        {esEvento && <Dato label="Entraron">{inv.usedCount} de {inv.capacity}</Dato>}
        <Dato label="Unidad">{inv.unitLabel}</Dato>
      </Filete>

      <div className="flex flex-col gap-2">
        {esEvento && onVerAnotados && (
          <Button variant="quiet" onClick={onVerAnotados}>
            Ver quién se anotó ({inv.joinedCount})
          </Button>
        )}
        {anulada && onHabilitar
          ? <Button onClick={onHabilitar}>Volver a habilitar</Button>
          : (
            <>
              <Button variant="quiet" onClick={onEditar}>Editar</Button>
              <Button variant="peligro" onClick={onAnular}>Anular invitación</Button>
            </>
          )}
      </div>
    </div>
  )
}
