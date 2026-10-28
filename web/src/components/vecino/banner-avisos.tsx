'use client'
import { useEffect, useState } from 'react'
import { Bell, Share, SquarePlus, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { estadoBanner, type EstadoBanner } from '@/lib/avisos'
import { useMarca } from '@/lib/marca-cliente'
import { activarPush, entornoPush, guardarAhoraNo, leerAhoraNo } from '@/lib/push-cliente'

/** "Activá los avisos" en el inicio; en iPhone sin instalar, la guía para instalar la app. */
export function BannerAvisos() {
  const { packagesEnabled } = useMarca()
  const [estado, setEstado] = useState<EstadoBanner>('oculto')
  const [trabajando, setTrabajando] = useState(false)

  // El navegador solo se lee en el cliente: el servidor dibuja el banner oculto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(estadoBanner({ habilitado: packagesEnabled, ...entornoPush(), ahoraNo: leerAhoraNo() }))
  }, [packagesEnabled])

  if (estado === 'oculto') return null

  const ahoraNo = () => { guardarAhoraNo(); setEstado('oculto') }
  const activar = async () => {
    setTrabajando(true)
    try {
      const permiso = await activarPush()
      // Concedido o denegado, el banner ya no tiene nada que ofrecer.
      if (permiso !== 'default') setEstado('oculto')
    } catch (err) {
      toast.error(err instanceof Error && err.message === 'push_sin_clave' ? 'Los avisos todavía no están disponibles.' : 'No se pudieron activar los avisos. Probá de nuevo.')
    } finally { setTrabajando(false) }
  }

  return (
    <section aria-label="Avisos" className="rounded-md bg-azul-tint p-4">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-azul-text" aria-hidden />
        <h2 className="font-semibold text-ink">Activá los avisos</h2>
      </div>
      {estado === 'activar' ? (
        <p className="mt-1 text-sm text-ink-soft">Te avisamos en el celular cuando llega un paquete, aunque no tengas la app abierta.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">En iPhone los avisos funcionan con la app instalada. Son 3 pasos:</p>
          <ol className="mt-3 flex flex-col gap-2 text-sm text-ink">
            <li className="flex items-center gap-2"><Share className="size-4 shrink-0 text-azul-text" aria-hidden />Tocá Compartir en Safari.</li>
            <li className="flex items-center gap-2"><SquarePlus className="size-4 shrink-0 text-azul-text" aria-hidden />Elegí Agregar a inicio.</li>
            <li className="flex items-center gap-2"><Smartphone className="size-4 shrink-0 text-azul-text" aria-hidden />Abrí Pazzit desde el ícono y activá los avisos.</li>
          </ol>
        </>
      )}
      <div className="mt-3 flex gap-2">
        {estado === 'activar' && <Button onClick={activar} disabled={trabajando}>Activar avisos</Button>}
        <Button variant="ghost" onClick={ahoraNo} className={estado === 'instalar' ? '-ml-5' : undefined}>Ahora no</Button>
      </div>
    </section>
  )
}
