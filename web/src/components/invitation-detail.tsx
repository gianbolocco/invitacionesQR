'use client'
import { useState } from 'react'
import { KIND_LABEL, vigencia, type Invitation } from '@/lib/invitations'
import { Button, Eyebrow, Filete } from './ui'
import { QrShare } from './qr-share'
import { InvitationForm } from './invitation-form'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/8 py-2">
      <Eyebrow>{label}</Eyebrow>
      <span className="text-right tabular">{children}</span>
    </div>
  )
}

/**
 * El detalle de una invitación: el QR, sus datos y qué se puede hacer con ella.
 *
 * Antes la tarjeta llevaba directo al QR y anular estaba escondido ahí adentro.
 * Editar no existía: había que anular y crear de nuevo, con lo que el invitado
 * se quedaba con un link muerto.
 */
export function InvitationDetail({ inv, units, onVolver, onAnular, onGuardado, onVerAnotados }: {
  inv: Invitation
  units: { id: string; label: string }[]
  onVolver: () => void
  onAnular: () => void
  onGuardado: () => void
  onVerAnotados?: () => void
}) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <button onClick={() => setEditando(false)}
          className="self-start text-sm text-alamo underline underline-offset-4">
          ← Cancelar edición
        </button>
        <h1 className="display text-2xl">Editar invitación</h1>
        <p className="-mt-4 text-sm text-ink-soft">
          El código no cambia: quien ya tenga el link sigue usando el mismo.
        </p>
        <InvitationForm units={units} invitacion={inv} onCreated={onGuardado} />
      </div>
    )
  }

  const esEvento = inv.kind === 'evento'

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <button onClick={onVolver} className="self-start text-sm text-alamo underline underline-offset-4">
        ← Volver
      </button>

      <QrShare token={inv.token} guestName={inv.guestName} />

      <Filete className="bg-white px-4 py-2">
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
        <Button variant="quiet" onClick={() => setEditando(true)}>Editar</Button>
        <Button variant="peligro" onClick={onAnular}>Anular invitación</Button>
      </div>
    </div>
  )
}
