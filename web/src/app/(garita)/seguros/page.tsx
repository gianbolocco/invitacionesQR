'use client'
import { use, useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { apiBase } from '@/lib/api'
import { useMe } from '@/lib/session'
import { useDemora } from '@/lib/use-demora'
import { hoyISO, fechaCompleta, fechaHora } from '@/lib/fechas'
import { COLOR_ESTADO, paramsSeguros, textoEstadoListado, type EstadoListado, type FilaProveedor, type FilaVehiculo } from '@/lib/seguros'
import { useSegurosAutos, useSegurosProveedores } from '@/lib/queries/seguros'
import { useCorregirSeguro, type Correccion } from '@/lib/queries/garita'
import { ChromeGarita } from '@/components/garita/chrome'
import { ChromeAdmin } from '@/components/admin/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { CamposSeguro, estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Tab = 'autos' | 'proveedores'
/** A quién se le corrige el seguro: la Correccion sin el seguro (Omit sobre la unión pierde los campos de cada caso). */
type Destino = { tipo: 'auto'; plate: string } | { tipo: 'proveedor'; doc: string; name: string }
type Estado = 'todos' | EstadoListado
const ESTADOS: EstadoListado[] = ['vencido', 'por_vencer', 'vigente', 'sin_cargar']

function Tag({ e, vence }: { e: EstadoListado; vence: string | null }) {
  return (
    <span className={cn('whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-bold', COLOR_ESTADO[e])}>
      {textoEstadoListado(e, vence, hoyISO())}
    </span>
  )
}

/**
 * Los seguros del padrón ordenados por vencimiento, para la garita y el admin.
 * El guardia corrige desde acá (con el certificado a la vista); el admin solo
 * mira. La pestaña y el filtro llegan por la URL: el tablero linkea a
 * /seguros?estado=vencido.
 */
export default function SegurosPage({ searchParams }: { searchParams: Promise<{ tab?: string; estado?: string }> }) {
  const sp = use(searchParams)
  const me = useMe()
  const estadoUrl = ESTADOS.find((e) => e === sp.estado)
  // "Sin cargar" solo existe en proveedores: un auto sin seguro no está en el padrón.
  const [tab, setTab] = useState<Tab>(sp.tab === 'proveedores' || estadoUrl === 'sin_cargar' ? 'proveedores' : 'autos')
  const [estado, setEstado] = useState<Estado>(estadoUrl ?? 'todos')
  const [texto, setTexto] = useState('')
  const q = useDemora(texto)
  const filtro = { estado, q }
  const autos = useSegurosAutos(filtro, Boolean(me))
  const provs = useSegurosProveedores(filtro, Boolean(me))
  // Desde el tablero ("vencidos") puede que solo haya proveedores: si la pestaña
  // de autos viene vacía y la otra no, se abre la otra una vez.
  const [ajustado, setAjustado] = useState(false)
  // Solo si el usuario todavía no tocó nada: si ya cambió el filtro o buscó, no se le mueve la pestaña.
  if (!ajustado && estadoUrl && !sp.tab && estado === estadoUrl && !q && autos.data && provs.data) {
    setAjustado(true)
    const deAutos = (autos.data.counts as Partial<Record<EstadoListado, number>>)[estadoUrl] ?? 0
    if (tab === 'autos' && deAutos === 0 && (provs.data.counts[estadoUrl] ?? 0) > 0) setTab('proveedores')
  }
  const consulta = tab === 'autos' ? autos : provs
  const corregir = useCorregirSeguro()
  const [editando, setEditando] = useState<{ titulo: string; base: Destino } | null>(null)
  const [valor, setValor] = useState<ValorSeguro>({ company: '', policy: '', expiresOn: '' })

  if (!me) return <main className="p-6">Cargando…</main>
  const Chrome = me.role === 'admin' ? ChromeAdmin : ChromeGarita
  const esGuardia = me.role === 'guard'
  const counts = (consulta.data?.counts ?? {}) as Partial<Record<EstadoListado, number>>
  const total = (c: Partial<Record<EstadoListado, number>>) => Object.values(c).reduce((a, b) => a + (b ?? 0), 0)
  const opcionesEstado: { valor: Estado; etiqueta: string; contador?: number }[] = [
    { valor: 'todos', etiqueta: 'Todos', contador: total(counts) },
    { valor: 'vencido', etiqueta: 'Vencidos', contador: counts.vencido ?? 0 },
    { valor: 'por_vencer', etiqueta: 'Por vencer', contador: counts.por_vencer ?? 0 },
    { valor: 'vigente', etiqueta: 'Vigentes', contador: counts.vigente ?? 0 },
    ...(tab === 'proveedores' ? [{ valor: 'sin_cargar' as Estado, etiqueta: 'Sin cargar', contador: counts.sin_cargar ?? 0 }] : []),
  ]

  function abrir(titulo: string, base: Destino, actual: { company: string | null; policy: string | null; expiresOn: string | null }) {
    setValor({ company: actual.company ?? '', policy: actual.policy ?? '', expiresOn: actual.expiresOn ?? '' })
    setEditando({ titulo, base })
  }

  const filas = consulta.data?.rows ?? []
  return (
    <Chrome>
      <div className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Seguros" acciones={
          <a href={`${apiBase}/insurance/${tab === 'autos' ? 'vehicles' : 'providers'}.xlsx?${paramsSeguros(filtro)}`}
            className={buttonVariants({ variant: 'outline' })}><Download aria-hidden />Exportar a Excel</a>} />

        {/* El filtro de estado se conserva al cambiar de pestaña, salvo "sin cargar", que los autos no tienen. */}
        <Chips etiqueta="Qué seguros" valor={tab}
          onCambio={(t) => { setTab(t); if (t === 'autos' && estado === 'sin_cargar') setEstado('todos') }}
          opciones={[
            { valor: 'autos', etiqueta: 'Vehículos', contador: autos.data ? total(autos.data.counts) : undefined },
            { valor: 'proveedores', etiqueta: 'Proveedores', contador: provs.data ? total(provs.data.counts) : undefined },
          ]} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input aria-label="Buscar seguros" className="md:max-w-md" value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={tab === 'autos' ? 'Patente, compañía o póliza' : 'Nombre, DNI, compañía o póliza'} />
          <Chips etiqueta="Estado del seguro" valor={estado} onCambio={setEstado} desplaza opciones={opcionesEstado} />
        </div>

        {consulta.isPending ? <SkeletonFilas /> : consulta.isError ? (
          <ErrorConReintento onReintentar={() => consulta.refetch()} reintentando={consulta.isFetching} />
        ) : filas.length === 0 ? (
          <Vacio icono={ShieldCheck} titulo="No hay seguros para mostrar"
            detalle={tab === 'autos' ? 'Los autos aparecen cuando la garita les carga el seguro.' : 'Los proveedores aparecen al entrar o al cargar su seguro desde el link.'} />
        ) : tab === 'autos' ? (
          <TablaAutos filas={filas as FilaVehiculo[]}
            onCorregir={esGuardia ? (r) => abrir(r.plate, { tipo: 'auto', plate: r.plate }, r) : undefined} />
        ) : (
          <TablaProveedores filas={filas as FilaProveedor[]}
            onCorregir={esGuardia ? (r) => abrir(r.name, { tipo: 'proveedor', doc: r.doc, name: r.name }, r) : undefined} />
        )}
      </div>

      <Sheet open={editando !== null} onOpenChange={(v) => { if (!v) setEditando(null) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Seguro de {editando?.titulo}</SheetTitle>
            <SheetDescription>Con el certificado a la vista. Queda a tu nombre en la auditoría.</SheetDescription>
          </SheetHeader>
          <form className="flex flex-col gap-4 px-4 pb-8" onSubmit={(e) => {
            e.preventDefault()
            if (!editando || estadoSeguroCargado(valor) !== 'completo') return
            corregir.mutate(
              { ...editando.base, insurance: { company: valor.company.trim(), policy: valor.policy.trim(), expiresOn: valor.expiresOn } } as Correccion,
              { onSuccess: () => setEditando(null) })
          }}>
            <CamposSeguro idBase="seguro-lista" valor={valor} onCambio={setValor} min={hoyISO()} />
            <Button type="submit" disabled={corregir.isPending || estadoSeguroCargado(valor) !== 'completo'}>
              {corregir.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </Chrome>
  )
}

const TH = 'px-3 py-2 text-left text-xs font-semibold text-ink-soft'
const TD = 'px-3 py-2.5 align-top text-sm'

function Ultimo({ u }: { u: FilaVehiculo['ultimoIngreso'] | FilaProveedor['ultimoIngreso'] }) {
  if (!u) return <span className="text-ink-soft">—</span>
  return (
    <>
      <span className="tabular">{fechaHora(u.at)}</span>
      <span className="block text-xs text-ink-soft">
        {'guestName' in u ? `${u.guestName} · ` : ''}{u.unitLabel}
        {u.sinSeguro && <span className="font-semibold text-alto"> · autorizado sin seguro</span>}
      </span>
    </>
  )
}

function TablaAutos({ filas, onCorregir }: { filas: FilaVehiculo[]; onCorregir?: (r: FilaVehiculo) => void }) {
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-md border border-line bg-card md:table">
        <thead className="bg-surface-sunk"><tr>
          <th className={TH}>Patente</th><th className={TH}>Seguro</th><th className={TH}>Vence</th><th className={TH}>Estado</th>
          <th className={TH}>Último ingreso</th><th className={TH}>Cargado por</th>
          {onCorregir && <th className={TH}><span className="sr-only">Acciones</span></th>}
        </tr></thead>
        <tbody>{filas.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className={cn(TD, 'font-bold tabular')}>{r.plate}</td>
            <td className={TD}>{r.company}<span className="block text-xs text-ink-soft tabular">Póliza {r.policy}</span></td>
            <td className={cn(TD, 'tabular')}>{fechaCompleta(r.expiresOn)}</td>
            <td className={TD}><Tag e={r.estado} vence={r.expiresOn} /></td>
            <td className={TD}><Ultimo u={r.ultimoIngreso} /></td>
            <td className={TD}>{r.updatedByName ?? '—'}<span className="block text-xs text-ink-soft tabular">{fechaHora(r.updatedAt)}</span></td>
            {onCorregir && <td className={TD}><Button size="sm" variant="ghost" aria-label={`Corregir el seguro de ${r.plate}`} onClick={() => onCorregir(r)}>Corregir</Button></td>}
          </tr>
        ))}</tbody>
      </table>
      <ul className="md:hidden">{filas.map((r) => (
        <li key={r.id}><Fila densa titulo={r.plate}
          meta={`${r.company} · vence ${fechaCompleta(r.expiresOn)}${r.ultimoIngreso?.sinSeguro ? ' · autorizado sin seguro' : ''}`}
          extremo={<Tag e={r.estado} vence={r.expiresOn} />} onClick={onCorregir ? () => onCorregir(r) : undefined} /></li>
      ))}</ul>
    </>
  )
}

function TablaProveedores({ filas, onCorregir }: { filas: FilaProveedor[]; onCorregir?: (r: FilaProveedor) => void }) {
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-md border border-line bg-card md:table">
        <thead className="bg-surface-sunk"><tr>
          <th className={TH}>Proveedor</th><th className={TH}>Rubro</th><th className={TH}>Seguro</th><th className={TH}>Vence</th>
          <th className={TH}>Estado</th><th className={TH}>Trabaja en</th><th className={TH}>Lo cargó</th>
          {onCorregir && <th className={TH}><span className="sr-only">Acciones</span></th>}
        </tr></thead>
        <tbody>{filas.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className={TD}><span className="font-bold">{r.name}</span><span className="block text-xs text-ink-soft tabular">DNI {r.doc}</span></td>
            <td className={TD}>{r.tradeName ?? '—'}</td>
            <td className={TD}>{r.company ?? '—'}{r.policy && <span className="block text-xs text-ink-soft tabular">Póliza {r.policy}</span>}</td>
            <td className={cn(TD, 'tabular')}>{r.expiresOn ? fechaCompleta(r.expiresOn) : '—'}</td>
            <td className={TD}><Tag e={r.estado} vence={r.expiresOn} /></td>
            <td className={TD}>{r.lotes.length ? r.lotes.join(', ') : '—'}</td>
            <td className={TD}>{r.source === 'link' ? 'Él, desde su link' : r.updatedByName ?? '—'}
              {r.updatedAt && <span className="block text-xs text-ink-soft tabular">{fechaHora(r.updatedAt)}</span>}</td>
            {onCorregir && <td className={TD}><Button size="sm" variant="ghost" aria-label={`Corregir el seguro de ${r.name}`} onClick={() => onCorregir(r)}>Corregir</Button></td>}
          </tr>
        ))}</tbody>
      </table>
      <ul className="md:hidden">{filas.map((r) => (
        <li key={r.id}><Fila densa titulo={r.name}
          meta={[r.tradeName, r.expiresOn && `vence ${fechaCompleta(r.expiresOn)}`, r.ultimoIngreso?.sinSeguro && 'autorizado sin seguro'].filter(Boolean).join(' · ')}
          extremo={<Tag e={r.estado} vence={r.expiresOn} />} onClick={onCorregir ? () => onCorregir(r) : undefined} /></li>
      ))}</ul>
    </>
  )
}
