'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, TriangleAlert } from 'lucide-react'
import { useAdentro, useMarcarVista } from '@/lib/queries/garita'
import { excedidas as calcular, sinVer, aparecieron, type Excedida } from '@/lib/permanencia'
import { hoyISO, horaODia, tiempoDesde } from '@/lib/fechas'
import { quienInvita } from '@/lib/invitations'
import { formatearDni } from '@/lib/lectora'
import { usePreferencia } from '@/lib/use-preferencia'
import { TagTipo } from '@/components/dominio/tag-tipo'
import { BOTON_HEADER } from '@/components/dominio/barra-seccion'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Alertas = { ahora: Date; excedidas: Excedida[]; pendientes: Excedida[]; porId: Map<string, Excedida> }

const AlertasContexto = createContext<Alertas | null>(null)
const SIN_ALERTAS: Alertas = { ahora: new Date(0), excedidas: [], pendientes: [], porId: new Map() }

/** Las alertas de permanencia de la garita. Fuera de `AlertasProvider`, ninguna. */
export const useAlertas = () => useContext(AlertasContexto) ?? SIN_ALERTAS

/** "1 h 20 min" si esa invitación pasó su tiempo adentro; si no, null. */
export function useExceso(id: string): string | null {
  const { porId, ahora } = useAlertas()
  const e = porId.get(id)
  return e ? tiempoDesde(e.alertaDesde, ahora) : null
}

/** Cada cuánto se mira el reloj. La red no participa: el vencimiento ya vino calculado. */
const TIC = 30_000
const CLAVE_SONIDO = 'pazzit.garita.alertas.sonido'

/**
 * Dos pitidos cortos, sin archivo. Si el navegador no deja sonar (nadie tocó
 * la página todavía), se calla: la alerta igual está en pantalla.
 */
function pitar() {
  try {
    const ctx = new AudioContext()
    for (const inicio of [0, 0.25]) {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = 880
      vol.gain.setValueAtTime(0.2, ctx.currentTime + inicio)
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.15)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + 0.15)
    }
    setTimeout(() => ctx.close(), 600)
  } catch { /* sin audio */ }
}

/**
 * Quién pasó su tiempo adentro, para todo el marco de la garita: el aviso del
 * header, el panel y el tablero leen de acá. Comparte la query de "Adentro"
 * con la agenda, así que no suma pedidos; lo único propio es el reloj.
 */
export function AlertasProvider({ children }: { children: React.ReactNode }) {
  const adentro = useAdentro(true)
  const [ahora, setAhora] = useState(() => new Date())
  const [sonido] = usePreferencia<'si' | 'no'>(CLAVE_SONIDO)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), TIC)
    return () => clearInterval(t)
  }, [])

  const valor = useMemo(() => {
    const excedidas = calcular(adentro.data ?? [], ahora)
    return { ahora, excedidas, pendientes: sinVer(excedidas), porId: new Map(excedidas.map((e) => [e.id, e])) }
  }, [adentro.data, ahora])

  // Suena solo cuando aparece una sin ver nueva, no en cada tic ni cuando se va una.
  const antes = useRef(new Set<string>())
  useEffect(() => {
    if (aparecieron(antes.current, valor.pendientes) && sonido !== 'no') pitar()
    antes.current = new Set(valor.pendientes.map((f) => f.id))
  }, [valor.pendientes, sonido])

  return <AlertasContexto.Provider value={valor}>{children}</AlertasContexto.Provider>
}

const personas = (n: number) => (n === 1 ? '1 persona pasó' : `${n} personas pasaron`)

/**
 * El aviso del header: un ícono más, como el tema o salir, con un número chico
 * de las alertas sin ver. Discreto a propósito: el que llama la atención es el
 * pitido, no el header. Sin excedidos no se muestra; con todos vistos queda
 * sin número, para poder volver a la lista.
 */
export function AvisoAlertas() {
  const { excedidas, pendientes } = useAlertas()
  const [abierto, setAbierto] = useState(false)
  if (!excedidas.length) return null

  const n = pendientes.length
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        aria-label={n ? `${personas(n)} su tiempo adentro` : 'Alertas de permanencia, todas vistas'}
        title={n ? `${personas(n)} su tiempo adentro` : 'Alertas de permanencia'}
        className={cn(BOTON_HEADER, 'relative', !n && 'text-white/70')}>
        <TriangleAlert className="size-5" aria-hidden />
        {n > 0 && (
          <span aria-hidden className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-card px-1 text-[11px] font-bold leading-none text-ink tabular">
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>
      <HojaAlertas abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  )
}

function HojaAlertas({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { ahora, excedidas, pendientes } = useAlertas()
  const [sonido, setSonido] = usePreferencia<'si' | 'no'>(CLAVE_SONIDO)
  const vistas = excedidas.filter((f) => f.alertaVista)
  const router = useRouter()

  return (
    // Si se resolvieron todas mientras estaba abierto, se cierra solo.
    <Sheet open={abierto && excedidas.length > 0} onOpenChange={(o) => { if (!o) onCerrar() }}>
      <SheetContent side="auto" className="gap-0">
        <SheetHeader className="border-b border-line">
          <SheetTitle>Pasaron su tiempo</SheetTitle>
          <SheetDescription>Siguen adentro sin salida registrada, más horas de las que fijó el barrio.</SheetDescription>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <Switch checked={sonido !== 'no'} onCheckedChange={(on) => setSonido(on ? 'si' : 'no')} />
              Sonido al aparecer una nueva
            </label>
            {/* La agenda con el filtro puesto: ahí están el DNI, quién invita y las otras vistas. */}
            <Button variant="outline" className="h-11"
              onClick={() => { onCerrar(); router.push('/garita?ver=excedidos') }}>
              Ver todos
            </Button>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {pendientes.length > 0 && (
            <Grupo titulo="Sin ver" filas={pendientes} ahora={ahora} onCerrar={onCerrar} />
          )}
          {vistas.length > 0 && (
            <Grupo titulo="Ya vistas" filas={vistas} ahora={ahora} onCerrar={onCerrar} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Grupo({ titulo, filas, ahora, onCerrar }: {
  titulo: string; filas: Excedida[]; ahora: Date; onCerrar: () => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink-soft">{titulo} · {filas.length}</h3>
      <ul className="flex flex-col gap-2">
        {filas.map((f) => <FilaAlerta key={f.id} fila={f} ahora={ahora} onCerrar={onCerrar} />)}
      </ul>
    </section>
  )
}

function FilaAlerta({ fila, ahora, onCerrar }: { fila: Excedida; ahora: Date; onCerrar: () => void }) {
  const marcar = useMarcarVista()
  return (
    <li className={cn('flex flex-col gap-2 rounded-md border p-3',
      fila.alertaVista ? 'border-line bg-card' : 'border-espera bg-espera-tint')}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[15px] font-semibold leading-snug">{fila.guestName}</span>
        <TagTipo kind={fila.kind} />
      </div>
      <span className="text-[13px] text-ink-soft">
        {fila.unitLabel} · {quienInvita(fila.inviterName)}
      </span>
      {(fila.guestDoc || fila.plate) && (
        <span className="flex flex-wrap gap-x-3 text-[13px] font-medium tabular">
          {fila.guestDoc && <span>DNI {formatearDni(fila.guestDoc)}</span>}
          {fila.plate && <span>{fila.plate}</span>}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular">
        {fila.lastEntryAt && <span className="text-ink-soft">Entró {horaODia(fila.lastEntryAt, hoyISO(ahora))}</span>}
        <span className="flex items-center gap-1 font-semibold text-espera">
          <TriangleAlert className="size-3.5" aria-hidden />Se pasó {tiempoDesde(fila.alertaDesde, ahora)}
        </span>
      </span>
      <div className="mt-1 flex gap-2">
        <Button asChild variant="outline" className="h-11 flex-1">
          <Link href={`/garita/invitacion/${fila.id}`} onClick={onCerrar}>Ver</Link>
        </Button>
        {!fila.alertaVista && (
          <Button className="h-11 flex-1" disabled={marcar.isPending} onClick={() => marcar.mutate(fila.id)}>
            <Check aria-hidden />Ya lo vi
          </Button>
        )}
      </div>
    </li>
  )
}
