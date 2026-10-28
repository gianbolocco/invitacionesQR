'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Campo } from '@/components/dominio/campo'
import { Chips } from '@/components/dominio/chips'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { APPS_DELIVERY, type Invitation } from '@/lib/invitations'
import { useRubrosDelBarrio } from '@/lib/queries/invitaciones'
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
export type InicialAlta = {
  guestName: string; guestDoc: string; plate: string; unidad: UnidadHit
  kind: 'visita' | 'proveedor' | 'delivery'; tradeId: string
  app: NonNullable<Invitation['deliveryApp']>; otro: string
}

/**
 * El alta exprés: visita o proveedor, con lote. Ventana y cupo quedan fijos
 * (solo hoy, una persona) — es alguien parado en la puerta ahora, no una
 * invitación a futuro. Lo autoriza la portería: no se controla horario. Los seguros (proveedor y auto)
 * se cargan en el veredicto que abre al crear.
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
  const [nota, setNota] = useState('')
  const [kind, setKind] = useState<'visita' | 'proveedor' | 'delivery'>('visita')
  const [app, setApp] = useState<NonNullable<Invitation['deliveryApp']>>('pedidosya')
  const [otro, setOtro] = useState('')
  const esDelivery = kind === 'delivery'
  const [rubro, setRubro] = useState('')
  const [intento, setIntento] = useState(false)
  const { data: rubros } = useRubrosDelBarrio()
  const listaRubros = rubros?.trades ?? []
  // Sin rubros activos en el barrio no hay campo; un rubro precargado que ya no está activo no vale.
  const pideRubro = kind === 'proveedor' && listaRubros.length > 0
  const rubroActual = listaRubros.find((t) => t.id === rubro)
  const errorRubro = intento && pideRubro && !rubroActual ? 'Elegí el rubro.' : null
  const qDemorada = useDemora(qUnidad)
  const unidades = useBuscarUnidades(unidad ? '' : qDemorada.trim())
  const alta = useAltaExpres()

  // El nombre que escribió el último escaneo de DNI.
  // (state y no ref: aplicarDni también corre durante el render, y ahí no se leen refs.)
  const [nombreEscaneado, setNombreEscaneado] = useState('')
  function aplicarDni(l: LecturaDni, pisarNombre: boolean) {
    setGuestDoc(l.documento)
    // Un nombre sin tocar (el de la invitación rechazada) no es de quien se escanea; tampoco
    // el que dejó el DNI anterior: si no, dos DNI seguidos dejan el nombre de A con el documento de B.
    // Un nombre tipeado a mano (distinto de ambos) se respeta.
    if (pisarNombre || !guestName.trim() || guestName === inicial?.guestName || guestName === nombreEscaneado) {
      const nombre = `${l.nombre} ${l.apellido}`
      setNombreEscaneado(nombre)
      setGuestName(nombre)
    }
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
    if (!abierto) { setNombreEscaneado(''); setGuestName(''); setUnidad(null); setQUnidad(''); setGuestDoc(''); setPlate(''); setNota('')
      setKind('visita'); setRubro(''); setIntento(false); setApp('pedidosya'); setOtro('')
    }
    // "Autorizar igual": todo lo que ya se sabe de la invitación rechazada, lote incluido.
    else if (inicial) {
      setGuestName(inicial.guestName); setUnidad(inicial.unidad)
      setGuestDoc(inicial.guestDoc); setPlate(inicial.plate)
      setKind(inicial.kind); setRubro(inicial.tradeId); setApp(inicial.app); setOtro(inicial.otro)
    }
  }

  const teclaUnidad = useCampoLectora(qUnidad, (l) =>
    l.tipo === 'dni' ? (setQUnidad(''), aplicarDni(l, false)) : (setQUnidad(''), onQr(l.token)))
  const teclaPatente = useCampoLectora(plate, (l) =>
    l.tipo === 'dni' ? (setPlate(''), aplicarDni(l, false)) : (setPlate(''), onQr(l.token)))

  const teclaOtro = useCampoLectora(otro, (l) =>
    l.tipo === 'dni' ? (setOtro(''), aplicarDni(l, false)) : (setOtro(''), onQr(l.token)))
  const teclaNota = useCampoLectora(nota, (l) =>
    l.tipo === 'dni' ? (setNota(''), aplicarDni(l, false)) : (setNota(''), onQr(l.token)))

  function cerrar(v: boolean) {
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!unidad) return
    setIntento(true)
    if (pideRubro && !rubroActual) return
    const inv = await alta.mutateAsync({
      unitId: unidad.unitId, guestDoc: guestDoc.trim(), plate: plate || undefined,
      note: nota.trim() || undefined,
      kind,
      ...(esDelivery ? { app, otro: app === 'otro' ? otro.trim() : undefined } : { guestName }),
      tradeId: pideRubro ? rubro : null,
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
          <SheetDescription>Para cuando el vecino aprobó por teléfono. {esDelivery ? 'Vale por 2 horas.' : 'Vale solo por hoy.'}</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4 px-4 pb-8">
          <Campo id="tipo-expres" etiqueta="Tipo">
            <Chips etiqueta="Tipo de ingreso" valor={kind}
              onCambio={(v) => { setKind(v); if (v !== 'proveedor') { setRubro(''); setIntento(false) } }}
              opciones={[{ valor: 'visita', etiqueta: 'Visita' }, { valor: 'proveedor', etiqueta: 'Proveedor' }, { valor: 'delivery', etiqueta: 'Delivery' }]} />
          </Campo>

          {esDelivery ? (
            <Campo id="app-expres" etiqueta="App">
              <Chips etiqueta="App de delivery" rejilla valor={app} onCambio={setApp} opciones={APPS_DELIVERY} />
              {app === 'otro' && (
                <>
                  <Label htmlFor="otro-expres" className="mt-2 text-sm font-semibold text-ink">¿De dónde viene?</Label>
                  <Input id="otro-expres" required maxLength={40} onKeyDown={teclaOtro} value={otro} onChange={(e) => setOtro(e.target.value)} />
                </>
              )}
            </Campo>
          ) : (
            <Campo id="nombre-expres" etiqueta="Nombre del invitado">
              <Input id="nombre-expres" required onKeyDown={teclaNombre} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </Campo>
          )}

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
                      <Fila densa key={`${u.unitId}-${u.residentName}`} titulo={u.residentName} meta={u.unitLabel}
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

          {kind === 'proveedor' && (
            <>
              {pideRubro && (
                <Campo id="rubro-expres" etiqueta="Rubro" error={errorRubro}>
                  <Select value={rubroActual ? rubro : ''} onValueChange={setRubro}>
                    <SelectTrigger id="rubro-expres" className="h-11! w-full" aria-invalid={Boolean(errorRubro) || undefined}>
                      <SelectValue placeholder="Elegí el rubro" />
                    </SelectTrigger>
                    <SelectContent>
                      {listaRubros.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
              )}
              <p className="text-sm text-ink-soft">Lo autorizás vos: no se controla el horario. El seguro se carga en la pantalla que sigue.</p>
            </>
          )}

          <Campo id="doc-expres" etiqueta={<>{esDelivery ? 'Documento del repartidor' : 'Documento'} <span aria-hidden>*</span></>}>
            <Input id="doc-expres" required onKeyDown={teclaDoc} value={guestDoc} className="tabular" placeholder="30.123.456"
              onChange={(e) => setGuestDoc(e.target.value)} />
          </Campo>

          <Campo id="patente-expres" etiqueta={esDelivery ? 'Patente (vacío = a pie o en bici)' : 'Patente (opcional)'}>
            <Input id="patente-expres" onKeyDown={teclaPatente} value={plate} className="uppercase"
              onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </Campo>

          <Campo id="nota-expres" etiqueta="Nota (opcional)" ayuda="No pongas datos sensibles.">
            <Input id="nota-expres" onKeyDown={teclaNota} value={nota} maxLength={140} aria-describedby="nota-expres-nota"
              onChange={(e) => setNota(e.target.value)} />
          </Campo>

          <Button type="submit" disabled={!unidad || !guestDoc.trim() || (esDelivery ? app === 'otro' && !otro.trim() : !guestName.trim()) || alta.isPending}>
            {alta.isPending ? 'Creando…' : 'Autorizar ingreso'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
