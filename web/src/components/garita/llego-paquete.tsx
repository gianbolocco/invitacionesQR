'use client'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Campo } from '@/components/dominio/campo'
import { BuscadorLote } from '@/components/garita/buscador-lote'
import { useCampoLectora } from '@/lib/use-lectora'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { avisarPaquete, cancelarPaquete, clavePaquetesHoy } from '@/lib/queries/paquetes'
import { ApiError } from '@/lib/api'
import type { UnidadHit } from '@/lib/gate'

// Igual a DESHACER_SEGUNDOS de api/src/services/packages.ts: es lo que la API retiene el aviso.
const ESPERA = 5

function textoDeError(e: unknown) {
  const codigo = e instanceof ApiError ? e.message : ''
  if (codigo === 'paquetes_apagados') return 'Los avisos de paquetes están apagados.'
  if (codigo === 'ya_avisado') return 'Ya se avisó.'
  return 'No se pudo avisar. Probá de nuevo.'
}

/** Hoja de "Llegó un paquete": lote + nota, y el aviso sale con 5 s para deshacer. */
export function LlegoPaquete({ abierto, onAbiertoChange, disparador }: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  disparador: HTMLButtonElement | null
}) {
  const qc = useQueryClient()
  const [unidad, setUnidad] = useState<UnidadHit | null>(null)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const notaRef = useRef<HTMLInputElement>(null)
  // Una lectura no tiene nada que ver con un paquete: se borra del campo y se ignora
  // (si no, un DNI escaneado en la nota viajaría al celular del vecino).
  const teclaNota = useCampoLectora(nota, () => setNota(''))

  // Cualquier cierre deja el formulario limpio.
  const [abiertoVisto, setAbiertoVisto] = useState(abierto)
  if (abierto !== abiertoVisto) {
    setAbiertoVisto(abierto)
    if (!abierto) { setUnidad(null); setNota('') }
  }

  // El servidor es quien retiene el aviso 5 s; acá solo se cuenta y se ofrece cancelar.
  function cuentaRegresiva(id: string, lote: string) {
    const toastId = `paquete-${id}`
    let n = ESPERA
    const mostrar = () => toast(`Avisando al ${lote} en ${n} s`, {
      id: toastId, duration: Infinity,
      action: { label: 'Deshacer', onClick: deshacer },
    })
    const reloj = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(reloj); toast.dismiss(toastId)
        // El aviso sale recién al vencer la espera del servidor: se refresca un poco después.
        setTimeout(() => qc.invalidateQueries({ queryKey: clavePaquetesHoy }), 1500)
      } else mostrar()
    }, 1000)
    async function deshacer() {
      clearInterval(reloj)
      try { await cancelarPaquete(id); toast.success('Aviso cancelado.') }
      catch (e) { toast.error(textoDeError(e)) }
    }
    mostrar()
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!unidad || enviando) return
    setEnviando(true)
    try {
      // Sin nota se omite: la API rechaza "".
      const r = await avisarPaquete({ unitId: unidad.unitId, note: nota.trim() || undefined })
      onAbiertoChange(false)
      cuentaRegresiva(r.id, unidad.unitLabel)
    } catch (e) {
      toast.error(textoDeError(e))
    } finally { setEnviando(false) }
  }

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent onCloseAutoFocus={(e) => { e.preventDefault(); disparador?.focus() }}>
        <SheetHeader>
          <SheetTitle>Llegó un paquete</SheetTitle>
          <SheetDescription>Le avisamos a la casa al instante.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="flex flex-col gap-4 px-4 pb-8">
          {/* Al elegir, el foco pasa a la nota: nunca queda en el body con la hoja abierta. */}
          <BuscadorLote id="lote-paquete" unidad={unidad} alLeer={() => {}}
            onUnidad={(u) => { setUnidad(u); if (u) setTimeout(() => notaRef.current?.focus(), 0) }} />
          <Campo id="nota-paquete" etiqueta="Nota (opcional)">
            <Input id="nota-paquete" ref={notaRef} onKeyDown={teclaNota} value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <Button type="submit" disabled={!unidad || enviando}>
            {unidad ? `Avisar al ${unidad.unitLabel}` : 'Avisar'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
