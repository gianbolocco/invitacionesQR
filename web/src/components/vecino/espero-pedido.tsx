'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Campo } from '@/components/dominio/campo'
import { Chips } from '@/components/dominio/chips'
import { APPS_DELIVERY, type Invitation } from '@/lib/invitations'
import { ApiError } from '@/lib/api'
import { useCrearDelivery } from '@/lib/queries/invitaciones'

type App = NonNullable<Invitation['deliveryApp']>

/** "Espero un pedido": elegir de dónde viene y listo, la garita lo deja pasar 2 horas. */
export function EsperoPedido({ abierto, onAbiertoChange, units }: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  units: { id: string; label: string }[]
}) {
  const crear = useCrearDelivery()
  const [app, setApp] = useState<App>('pedidosya')
  const [otro, setOtro] = useState('')
  const [errorOtro, setErrorOtro] = useState<string | null>(null)
  const [unitId, setUnitId] = useState(units[0]?.id ?? '')

  async function avisar() {
    try {
      await crear.mutateAsync({ unitId, app, ...(app === 'otro' ? { otro: otro.trim() } : {}) })
      onAbiertoChange(false)
      setApp('pedidosya')
      setOtro('')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'falta_detalle') setErrorOtro('Contanos de dónde viene el pedido.')
    }
  }

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="bottom">
        <SheetHeader className="pr-14">
          <SheetTitle>¿De dónde viene?</SheetTitle>
          <SheetDescription>La garita lo deja pasar las próximas 2 horas.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Chips rejilla etiqueta="App del pedido" valor={app} onCambio={(v) => { setApp(v); setErrorOtro(null) }}
            opciones={APPS_DELIVERY.map((a) => ({ valor: a.valor, etiqueta: a.etiqueta }))} />
          {app === 'otro' && (
            <Campo id="delivery-otro" etiqueta="¿Qué esperás?" error={errorOtro}>
              <Input id="delivery-otro" value={otro} maxLength={40} autoComplete="off" autoFocus
                aria-invalid={Boolean(errorOtro) || undefined} aria-describedby="delivery-otro-nota"
                placeholder="Farmacia, supermercado…" onChange={(e) => { setOtro(e.target.value); setErrorOtro(null) }} />
            </Campo>
          )}
          {units.length > 1 && (
            <Campo id="delivery-unidad" etiqueta="Unidad">
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="delivery-unidad" className="h-11! w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          )}
          <Button type="button" size="lg" disabled={crear.isPending || (app === 'otro' && !otro.trim())} onClick={avisar}>
            {crear.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Avisar a la garita
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
