'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package, ScanLine, UserPlus } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { AgendaDia } from '@/components/garita/agenda-dia'
import { BuscarInvitado } from '@/components/garita/buscar-invitado'
import { UltimosMovimientos } from '@/components/garita/ultimos-movimientos'
import { AltaExpres } from '@/components/garita/alta-expres'
import { LlegoPaquete } from '@/components/garita/llego-paquete'
import { useMarca } from '@/lib/marca-cliente'
import { EstadoLectora } from '@/components/garita/estado-lectora'
import {
  claves, useAvisosGarita, useAbrirQr, useAnotarLectura, useDniPendiente, useDocumentoLeido,
} from '@/lib/queries/garita'
import { buscar, mensajeDeError } from '@/lib/gate'
import { useLectora } from '@/lib/use-lectora'
import { formatearDni, interpretarLectura, NO_RECONOCIDO, soloDigitos, type Lectura, type LecturaDni } from '@/lib/lectora'
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
  const anotar = useAnotarLectura()
  const dniPendiente = useDniPendiente()
  const documentoLeido = useDocumentoLeido()
  const [q, setQ] = useState('')
  // El DNI leído detrás de la lista que se está mostrando: al abrir un resultado, se precarga.
  const [dniLista, setDniLista] = useState<LecturaDni | null>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [lecturaAlta, setLecturaAlta] = useState<LecturaDni | null>(null)
  // Estado, no ref leído en el render: así Radix sabe a quién devolverle el
  // foco al cerrar el sheet (mismo patrón que DialogLote/DialogBaja del admin).
  const { packagesEnabled } = useMarca()
  const [paqueteAbierto, setPaqueteAbierto] = useState(false)
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)
  useAvisosGarita()

  // Estable: lo reciben las filas de la agenda, que van con memo.
  const abrir = useCallback((id: string) => router.push(`/garita/invitacion/${id}`), [router])
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

  // Dos lecturas seguidas pueden resolverse desordenadas: solo vale la última.
  const secuencia = useRef(0)

  /** Spec 3.7: una → veredicto; varias → lista; ninguna → por apellido (solo lista); nada → alta exprés. */
  async function resolverDni(l: LecturaDni) {
    const mia = ++secuencia.current
    setDniLista(null)
    const dni = `DNI ${formatearDni(l.documento)}`
    try {
      const porDoc = await buscarYa(l.documento)
      if (mia !== secuencia.current) return
      // La API busca por subcadena de dígitos: 1234567 también trae 11.234.567. Solo abre si es el mismo documento entero.
      if (porDoc.length === 1 && soloDigitos(porDoc[0].guestDoc ?? '') === l.documento) {
        documentoLeido.dejar(porDoc[0].id, l.documento)
        anotar(`${dni} · ${porDoc[0].guestName}`)
        router.push(`/garita/invitacion/${porDoc[0].id}`)
        return
      }
      if (porDoc.length > 0) {
        anotar(`${dni} · ${porDoc.length} posibles, elegí en la lista`)
        setQ(l.documento); setDniLista(l); return
      }
      // La palabra más larga del apellido: "De La Fuente" → "Fuente".
      const apellido = l.apellido.split(' ').reduce((a, p) => (p.length > a.length ? p : a), '')
      // Coincidir por apellido no alcanza para abrir el veredicto de alguien: solo la lista.
      const porApellido = await buscarYa(apellido)
      if (mia !== secuencia.current) return
      if (porApellido.length > 0) {
        anotar(`${dni} · sin coincidencia exacta, revisá la lista`)
        setQ(apellido); setDniLista(l); return
      }
      anotar(`${dni} · sin invitación, alta exprés`)
      setLecturaAlta(l)
      setAltaAbierta(true)
    } catch {
      if (mia === secuencia.current) {
        anotar(`${dni} · no se pudo buscar`)
        toast.error('No se pudo buscar el DNI. Revisá la conexión y probá de nuevo.')
      }
    }
  }

  async function leer(l: Lectura | null) {
    if (!l) { anotar('No reconocido'); toast.error(NO_RECONOCIDO); return }
    if (l.tipo === 'dni') {
      if (altaAbierta) { anotar(`DNI ${formatearDni(l.documento)} · completó el alta exprés`); setLecturaAlta(l) }
      else await resolverDni(l)
      return
    }
    const mia = ++secuencia.current
    try {
      const r = await abrirQr(l.token, false, () => mia === secuencia.current)
      if (mia !== secuencia.current) return
      anotar(`QR · ${r.invitation.guestName}`)
      cambiarAlta(false)
    } catch (e) {
      if (mia !== secuencia.current) return
      anotar(`QR · ${mensajeDeError(e)}`)
      toast.error(mensajeDeError(e))
    }
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
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <BuscarInvitado q={q} onQ={(v) => { setQ(v); setDniLista(null) }} onAbrir={abrirDeLista} onLectura={leer}
            onAutorizar={() => setAltaAbierta(true)} />
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline"
              onClick={(e) => { setDisparador(e.currentTarget); setAltaAbierta(true) }}>
              <UserPlus aria-hidden />Autorizar sin invitación
            </Button>
            {packagesEnabled && (
              <Button type="button" variant="outline"
                onClick={(e) => { setDisparador(e.currentTarget); setPaqueteAbierto(true) }}>
                <Package aria-hidden />Llegó un paquete
              </Button>
            )}
            {/* Solo se usa después de un corte de luz: a la vista, pero sin competir con lo de todos los días. */}
            <Link href="/garita/cargar" className="self-end rounded px-1 py-1.5 text-xs text-ink-soft underline underline-offset-4 hover:text-ink">
              Cargar movimientos de un corte
            </Link>
          </div>
          <AgendaDia onAbrir={abrir} />
        </div>
        <aside className="hidden flex-col gap-6 md:flex">
          {/* Táctil (una tablet desde 768 px): la cámara al frente, como siempre.
              Con mouse, la lectora; la cámara queda como link del recuadro. */}
          <Link href="/garita/escanear" className={cn(buttonVariants({ size: 'lg' }), 'hidden w-full pointer-coarse:inline-flex')}>
            <ScanLine aria-hidden />Escanear QR
          </Link>
          <EstadoLectora />
          <UltimosMovimientos />
        </aside>
      </div>

      <LlegoPaquete abierto={paqueteAbierto} onAbiertoChange={setPaqueteAbierto} disparador={disparador} />
      <AltaExpres abierto={altaAbierta} disparador={disparador} onCreada={abrir}
        onAbiertoChange={cambiarAlta}
        lectura={lecturaAlta} onQr={(token) => leer({ tipo: 'qr', token })} />
    </ChromeGarita>
  )
}
