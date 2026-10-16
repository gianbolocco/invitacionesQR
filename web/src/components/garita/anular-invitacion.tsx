'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Campo } from '@/components/dominio/campo'
import { MOTIVO_ANULACION_MIN } from '@/lib/gate'
import { useAnularInvitacion } from '@/lib/queries/garita'

/**
 * La portería anula una invitación, y dice por qué: el motivo es obligatorio
 * y es lo que el vecino lee después en su invitación. Solo se pide cuando se
 * confirma: el diálogo no hace nada por sí solo.
 */
export function AnularInvitacion({ abierto, onAbiertoChange, invitacion, onAnulada }: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  invitacion: { id: string; guestName: string; unitLabel: string }
  onAnulada: () => void
}) {
  const anular = useAnularInvitacion()
  const [motivo, setMotivo] = useState('')
  const corto = motivo.trim().length < MOTIVO_ANULACION_MIN

  function cambiar(v: boolean) {
    onAbiertoChange(v)
    if (!v) setMotivo('')
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogContent>
        <form onSubmit={(e) => {
          e.preventDefault()
          if (corto) return
          anular.mutate({ id: invitacion.id, reason: motivo.trim() }, {
            onSuccess: () => { cambiar(false); onAnulada() },
          })
        }} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>¿Anular la invitación de {invitacion.guestName}?</DialogTitle>
            <DialogDescription>
              No va a poder entrar. El vecino del {invitacion.unitLabel} ve este motivo en su invitación
              y puede volver a habilitarla.
            </DialogDescription>
          </DialogHeader>

          <Campo id="motivo-anulacion" etiqueta="Motivo"
            ayuda={`Obligatorio, al menos ${MOTIVO_ANULACION_MIN} letras. Por ejemplo: el vecino llamó para cancelar.`}>
            <Input id="motivo-anulacion" value={motivo} maxLength={200} autoComplete="off" autoFocus
              onChange={(e) => setMotivo(e.target.value)} aria-describedby="motivo-anulacion-nota" />
          </Campo>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiar(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={corto || anular.isPending}>
              {anular.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Anular invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
