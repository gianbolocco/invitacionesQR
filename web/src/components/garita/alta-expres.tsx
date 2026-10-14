'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Campo } from '@/components/dominio/campo'
import { Fila } from '@/components/dominio/fila'
import { useDemora } from '@/lib/use-demora'
import { useBuscarUnidades, useAltaExpres } from '@/lib/queries/garita'
import type { UnidadHit } from '@/lib/gate'
import { useCampoLectora } from '@/lib/use-lectora'
import type { LecturaDni } from '@/lib/lectora'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'

/** Lo que ya se sabe de una invitación rechazada que se autoriza igual. */
export type InicialAlta = { guestName: string; guestDoc: string; plate: string; unidad: UnidadHit }

/**
 * El alta exprés: nombre + lote nada más. Tipo, ventana y cupo quedan fijos
 * (visita, solo hoy, una persona) — es alguien parado en la puerta ahora, no
 * una invitación a futuro.
 */
export function AltaExpres({ abierto, onAbiertoChange, disparador, onCreada, lectura = null, onQr, inicial }: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  disparador: HTMLButtonElement | null
  onCreada: (id: string) => void
  lectura?: LecturaDni | null
  onQr: (token: string) => void
  inicial?: InicialAlta
}) {
  const [guestName, setGuestName] = useState('')
  const [unidad, setUnidad] = useState<UnidadHit | null>(null)
  const [qUnidad, setQUnidad] = useState('')
  const [guestDoc, setGuestDoc] = useState('')
  const [plate, setPlate] = useState('')
  const qDemorada = useDemora(qUnidad)
  const unidades = useBuscarUnidades(unidad ? '' : qDemorada.trim())
  const alta = useAltaExpres()

  function aplicarDni(l: LecturaDni, pisarNombre: boolean) {
    setGuestDoc(l.documento)
    // Un nombre sin tocar (el de la invitación rechazada) no es de quien se escanea.
    if (pisarNombre || !guestName.trim() || guestName === inicial?.guestName) setGuestName(`${l.nombre} ${l.apellido}`)
  }
  // Un DNI leído con el sheet abierto (o que lo abrió): ajuste durante el render, como el veredicto.
  const [lecturaVista, setLecturaVista] = useState<LecturaDni | null>(null)
  if (lectura !== lecturaVista) {
    setLecturaVista(lectura)
    if (lectura) aplicarDni(lectura, false)
  }
  // El sheet abre con el foco en Nombre: ahí cae la lectura si el guardia escanea enseguida.
  const teclaNombre = useCampoLectora(guestName, (l) =>
    l.tipo === 'dni' ? aplicarDni(l, true) : (setGuestName(''), onQr(l.token)))
  const teclaDoc = useCampoLectora(guestDoc, (l) =>
    l.tipo === 'dni' ? aplicarDni(l, false) : (setGuestDoc(''), onQr(l.token)))

  // Cualquier cierre (botón, Esc, o el padre al leer un QR) deja el formulario limpio.
  const [abiertoVisto, setAbiertoVisto] = useState(abierto)
  if (abierto !== abiertoVisto) {
    setAbiertoVisto(abierto)
    if (!abierto) { setGuestName(''); setUnidad(null); setQUnidad(''); setGuestDoc(''); setPlate('') }
    // "Autorizar igual": todo lo que ya se sabe de la invitación rechazada, lote incluido.
    else if (inicial) {
      setGuestName(inicial.guestName); setUnidad(inicial.unidad)
      setGuestDoc(inicial.guestDoc); setPlate(inicial.plate)
    }
  }

  const teclaUnidad = useCampoLectora(qUnidad, (l) =>
    l.tipo === 'dni' ? (setQUnidad(''), aplicarDni(l, false)) : (setQUnidad(''), onQr(l.token)))
  const teclaPatente = useCampoLectora(plate, (l) =>
    l.tipo === 'dni' ? (setPlate(''), aplicarDni(l, false)) : (setPlate(''), onQr(l.token)))

  function cerrar(v: boolean) {
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!unidad) return
    const inv = await alta.mutateAsync({
      unitId: unidad.unitId, guestName, guestDoc: guestDoc || undefined, plate: plate || undefined,
    })
    cerrar(false)
    onCreada(inv.id)
  }

  return (
    <Sheet open={abierto} onOpenChange={cerrar}>
      {/* Lo abre un botón suelto en BuscarInvitado, no un SheetTrigger: sin
          onCloseAutoFocus, Radix manda el foco al body al cerrar. */}
      <SheetContent onCloseAutoFocus={(e) => { e.preventDefault(); disparador?.focus() }}>
        <SheetHeader>
          <SheetTitle>Autorizar sin invitación</SheetTitle>
          <SheetDescription>Para cuando el vecino aprobó por teléfono. Vale solo por hoy.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4 px-4 pb-8">
          <Campo id="nombre-expres" etiqueta="Nombre del invitado">
            <Input id="nombre-expres" required onKeyDown={teclaNombre} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Campo>

          <Campo id="lote-expres" etiqueta="Lote">
            {unidad ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2">
                <span className="text-sm font-semibold">{unidad.unitLabel} · {unidad.residentName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setUnidad(null)}>Cambiar</Button>
              </div>
            ) : (
              <>
                <Input id="lote-expres" onKeyDown={teclaUnidad} value={qUnidad} placeholder="Lote o apellido del vecino"
                  onChange={(e) => setQUnidad(e.target.value)} />
                {unidades.data && unidades.data.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-auto rounded-md border border-border p-2 [&>*:last-child]:border-b-0">
                    {unidades.data.map((u) => (
                      <Fila key={`${u.unitId}-${u.residentName}`} titulo={u.residentName} meta={u.unitLabel}
                        onClick={() => { setUnidad(u); setQUnidad('') }} />
                    ))}
                  </div>
                )}
                {unidades.data?.length === 0 && (
                  <p className="mt-1 text-sm text-ink-soft">Sin resultados. Probá con el lote o el apellido.</p>
                )}
              </>
            )}
          </Campo>

          <Campo id="doc-expres" etiqueta="Documento (opcional)" ayuda="Si no lo cargás acá, se pide al registrar el ingreso.">
            <Input id="doc-expres" onKeyDown={teclaDoc} value={guestDoc} className="tabular" placeholder="30.123.456"
              onChange={(e) => setGuestDoc(e.target.value)} />
          </Campo>

          <Campo id="patente-expres" etiqueta="Patente (opcional)">
            <Input id="patente-expres" onKeyDown={teclaPatente} value={plate} className="uppercase"
              onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </Campo>

          <Button type="submit" disabled={!unidad || !guestName.trim() || alta.isPending}>
            {alta.isPending ? 'Creando…' : 'Autorizar ingreso'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
