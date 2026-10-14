'use client'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanLine, UserPlus } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { AgendaDia } from '@/components/garita/agenda-dia'
import { BuscarInvitado } from '@/components/garita/buscar-invitado'
import { UltimosMovimientos } from '@/components/garita/ultimos-movimientos'
import { AltaExpres } from '@/components/garita/alta-expres'
import {
  claves, useAvisosGarita, useAbrirQr, useDniPendiente, useDocumentoLeido,
} from '@/lib/queries/garita'
import { buscar, mensajeDeError } from '@/lib/gate'
import { useLectora } from '@/lib/use-lectora'
import { interpretarLectura, NO_RECONOCIDO, type Lectura, type LecturaDni } from '@/lib/lectora'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * "Hoy": buscador y agenda siempre visibles. El botón de escanear vive en el
 * centro de la barra inferior en mobile (lo pone `ChromeGarita`); acá, en la
 * columna derecha, solo aparece a partir de 768px —agenda a la izquierda,
 * escanear + buscar + últimos movimientos a la derecha—, porque antes de ese
 * ancho la columna se aprieta.
 */
export default function GaritaHoy() {
  const router = useRouter()
  const qc = useQueryClient()
  const abrirQr = useAbrirQr()
  const dniPendiente = useDniPendiente()
  const documentoLeido = useDocumentoLeido()
  const [q, setQ] = useState('')
  // El DNI leído detrás de la lista que se está mostrando: al abrir un resultado, se precarga.
  const [dniLista, setDniLista] = useState<LecturaDni | null>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [lecturaAlta, setLecturaAlta] = useState<LecturaDni | null>(null)
  // Estado, no ref leído en el render: así Radix sabe a quién devolverle el
  // foco al cerrar el sheet (mismo patrón que DialogLote/DialogBaja del admin).
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)
  useAvisosGarita()

  const abrir = (id: string) => router.push(`/garita/invitacion/${id}`)
  // Solo los resultados de la lista armada por un DNI llevan el documento leído.
  function abrirDeLista(id: string) {
    if (dniLista) documentoLeido.dejar(id, dniLista.documento)
    abrir(id)
  }
  function cambiarAlta(v: boolean) {
    setAltaAbierta(v)
    if (!v) setLecturaAlta(null)
  }
  const buscarYa = (texto: string) => qc.fetchQuery({ queryKey: claves.busqueda(texto), queryFn: () => buscar(texto) })

  /** Spec 3.7: una → veredicto; varias → lista; ninguna → por apellido (solo lista); nada → alta exprés. */
  async function resolverDni(l: LecturaDni) {
    setDniLista(null)
    try {
      const porDoc = await buscarYa(l.documento)
      if (porDoc.length === 1) {
        documentoLeido.dejar(porDoc[0].id, l.documento)
        router.push(`/garita/invitacion/${porDoc[0].id}`)
        return
      }
      if (porDoc.length > 1) { setQ(l.documento); setDniLista(l); return }
      const apellido = l.apellido.split(' ')[0]
      // Coincidir por apellido no alcanza para abrir el veredicto de alguien: solo la lista.
      if ((await buscarYa(apellido)).length > 0) { setQ(apellido); setDniLista(l); return }
      setLecturaAlta(l)
      setAltaAbierta(true)
    } catch {
      toast.error('No se pudo buscar el DNI. Revisá la conexión y probá de nuevo.')
    }
  }

  async function leer(l: Lectura | null) {
    if (!l) { toast.error(NO_RECONOCIDO); return }
    if (l.tipo === 'dni') {
      if (altaAbierta) setLecturaAlta(l)
      else await resolverDni(l)
      return
    }
    try { await abrirQr(l.token); cambiarAlta(false) } catch (e) { toast.error(mensajeDeError(e)) }
  }

  useLectora({ onLectura: (texto) => leer(interpretarLectura(texto)) })

  // Un DNI leído en el escáner o en un veredicto llega acá para resolverse.
  useEffect(() => {
    const l = dniPendiente.tomar()
    // Los setState de resolverDni ocurren después de un await, no síncronos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (l) resolverDni(l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ChromeGarita>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <BuscarInvitado q={q} onQ={(v) => { setQ(v); setDniLista(null) }} onAbrir={abrirDeLista} onLectura={leer} />
          <Button type="button" variant="outline"
            onClick={(e) => { setDisparador(e.currentTarget); setAltaAbierta(true) }}>
            <UserPlus aria-hidden />Autorizar sin invitación
          </Button>
          <AgendaDia onAbrir={abrir} />
        </div>
        <aside className="hidden flex-col gap-6 md:flex">
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <Link href="/garita/lectora" className="text-sm text-ink-soft underline underline-offset-4">Probar lectora</Link>
          <UltimosMovimientos />
        </aside>
      </div>

      <AltaExpres abierto={altaAbierta} disparador={disparador} onCreada={abrir}
        onAbiertoChange={cambiarAlta}
        lectura={lecturaAlta} onQr={(token) => leer({ tipo: 'qr', token })} />
    </ChromeGarita>
  )
}
