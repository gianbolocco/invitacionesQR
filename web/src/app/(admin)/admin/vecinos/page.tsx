'use client'
import { useState } from 'react'
import { Building2, List, Search, X } from 'lucide-react'
import {
  usePersonas, useUnidades, useAltaVecino, useReenviarInvitacion, useReactivarPersona,
  useDeshabilitarPersona, useCambiarLote, copiarLinkDeAlta, ApiError,
} from '@/lib/queries/admin'
import { ESTADO, normalizarBusqueda, type Person } from '@/lib/admin'
import { fechaConAnio } from '@/lib/fechas'
import { agruparPorLote } from '@/lib/lotes'
import { usePreferencia } from '@/lib/use-preferencia'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SelectorVista, type OpcionVista } from '@/components/dominio/selector-vista'
import { VistaPorLote } from '@/components/admin/vista-por-lote'
import { SheetAlta } from '@/components/admin/sheet-alta'
import { MenuFila, type AccionFila } from '@/components/admin/menu-fila'
import { ImportarVecinos } from '@/components/admin/importar-vecinos'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

function AltaVecino({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const alta = useAltaVecino()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Se limpia el formulario al cerrar por cualquier camino — Cancelar,
  // Escape, clic afuera o un alta exitosa — no solo al mandarlo: si no,
  // abrir el sheet para otra persona arranca con los datos de la anterior
  // y se puede mandar el alta equivocada sin querer.
  function cambiarAbierto(v: boolean) {
    if (!v) { setName(''); setEmail(''); setLot(''); setError(null) }
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      // El aviso de "mail no enviado" lo da el toast de useAltaVecino, no
      // este formulario: el sheet ya se cerró y la persona quedó cargada.
      await alta.mutateAsync({ name, email, lot: lot ? Number(lot) : undefined })
      cambiarAbierto(false)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'mail_repetido'
        ? `${email} ya está en el padrón. Buscalo en la lista.`
        : 'No se pudo dar de alta. Revisá el mail y probá de nuevo.')
    }
  }

  return (
    <SheetAlta etiqueta="Dar de alta" titulo="Dar de alta un vecino"
      descripcion="Le llega un link para activar su cuenta."
      abierto={abierto} onAbiertoChange={cambiarAbierto}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo id="nombre" etiqueta="Nombre">
          <Input id="nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        </Campo>
        <Campo id="mail" etiqueta="Mail">
          <Input id="mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="lote" etiqueta="Lote (opcional)" ayuda="Si lo dejás vacío, lo completa al entrar.">
          <Input id="lote" value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142" className="tabular"
            onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" disabled={alta.isPending}>
          {alta.isPending ? 'Guardando…' : 'Dar de alta y enviar invitación'}
        </Button>
      </form>
    </SheetAlta>
  )
}

function DialogLote({ persona, disparador, onCerrar }: {
  persona: Person | null; disparador: HTMLButtonElement | null; onCerrar: () => void
}) {
  const cambiar = useCambiarLote()
  const [lot, setLot] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!persona || !lot.trim()) return
    await cambiar.mutateAsync({ personId: persona.id, lot: Number(lot) })
    setLot('')
    onCerrar()
  }

  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) { setLot(''); onCerrar() } }}>
      {/* Lo abre el menú ⋯ de la fila, no un DialogTrigger: sin esto, Radix
          no sabe a quién devolverle el foco al cerrar y lo manda al body. */}
      <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); disparador?.focus() }}>
        <DialogHeader>
          <DialogTitle>Cambiar el lote de {persona?.name}</DialogTitle>
          <DialogDescription>Lo saca de su lote actual y lo pasa a este.</DialogDescription>
        </DialogHeader>
        <form id="form-lote" onSubmit={enviar}>
          <Campo id="nuevo-lote" etiqueta="Número de lote">
            <Input id="nuevo-lote" autoFocus required value={lot} inputMode="numeric" pattern="[0-9]*"
              placeholder="142" className="tabular" onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-lote" disabled={cambiar.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogBaja({ persona, disparador, onCerrar }: {
  persona: Person | null; disparador: HTMLButtonElement | null; onCerrar: () => void
}) {
  const deshabilitar = useDeshabilitarPersona()
  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) onCerrar() }}>
      <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); disparador?.focus() }}>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {persona?.name}?</DialogTitle>
          <DialogDescription>
            No va a poder entrar, y las invitaciones vigentes que creó quedan anuladas. Se puede reactivar después.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" disabled={deshabilitar.isPending}
            onClick={async () => { if (persona) await deshabilitar.mutateAsync(persona); onCerrar() }}>
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Vista = 'lista' | 'lote'

const VISTAS: OpcionVista<Vista>[] = [
  { valor: 'lista', etiqueta: 'Lista', icono: List },
  { valor: 'lote', etiqueta: 'Por lote', icono: Building2 },
]

export default function VecinosPage() {
  const personas = usePersonas()
  const unidades = useUnidades()
  const [guardada, guardar] = usePreferencia<Vista>('visitpass.admin.vecinos.vista')
  const vista: Vista = guardada ?? 'lista'
  const reenviar = useReenviarInvitacion()
  const reactivar = useReactivarPersona()
  const [busqueda, setBusqueda] = useState('')
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Person | null>(null)
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)
  const [disparador, setDisparador] = useState<HTMLButtonElement | null>(null)

  const vecinos = (personas.data ?? []).filter((p) => p.role !== 'guard')
  const consulta = normalizarBusqueda(busqueda)
  const filtrados = consulta
    ? vecinos.filter((p) => normalizarBusqueda(p.name).includes(consulta)
      || p.units.some((u) => normalizarBusqueda(u.label).includes(consulta)
        || normalizarBusqueda(u.label.replace(/^lote\s*/i, '')).includes(consulta)))
    : vecinos

  function accionesDe(p: Person): AccionFila[] {
    const acciones: AccionFila[] = []
    if (p.status === 'invited') acciones.push(
      { etiqueta: 'Reenviar invitación', onClick: () => reenviar.mutate(p), deshabilitada: reenviar.isPending },
      { etiqueta: 'Copiar link de alta', onClick: () => copiarLinkDeAlta(p) },
    )
    acciones.push({ etiqueta: 'Cambiar lote', onClick: (btn) => { setDisparador(btn); setCorrigiendo(p) } })
    if (p.status === 'disabled') acciones.push({ etiqueta: 'Reactivar', onClick: () => reactivar.mutate(p) })
    else acciones.push({
      etiqueta: 'Dar de baja', destructiva: true,
      onClick: (btn) => { setDisparador(btn); setPorDarDeBaja(p) },
    })
    return acciones
  }

  /** Una fila del padrón. En la vista por lote el lote ya es el título del grupo: no se repite. */
  function filaVecino(p: Person, conLote: boolean) {
    return (
      <Fila key={p.id} titulo={<>{p.name}{p.role === 'admin' && <span className="ml-2 text-xs font-normal text-ink-soft">Admin</span>}</>}
        meta={[
          conLote ? (p.units.map((u) => u.label).join(' · ') || 'Sin lote asignar') : null,
          ESTADO[p.status],
          p.lastLoginAt ? `Último acceso ${fechaConAnio(p.lastLoginAt)}` : 'Sin ingresos',
        ].filter(Boolean).join(' · ')}
        extremo={<MenuFila acciones={accionesDe(p)} />}
        className={p.status === 'disabled' ? 'opacity-50' : undefined} />
    )
  }

  const grupos = agruparPorLote(filtrados, unidades.data ?? [], !consulta)

  return (
    <>
      <div className="flex flex-col gap-6">
        <EncabezadoPagina antetitulo={personas.data ? `${vecinos.length} en el padrón` : undefined}
          titulo="Vecinos"
          acciones={<AltaVecino abierto={altaAbierta} onAbiertoChange={setAltaAbierta} />} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <Input type="text" value={busqueda} placeholder="Buscar por nombre o lote"
              aria-label="Buscar vecinos por nombre o lote" className="h-11 pl-9 pr-10"
              onChange={(e) => setBusqueda(e.target.value)} />
            {busqueda && (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-ink-soft hover:bg-surface-sunk hover:text-ink">
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <ImportarVecinos onImported={() => personas.refetch()} />
          <div className="sm:ml-auto">
            <SelectorVista etiqueta="Vista del padrón" opciones={VISTAS} valor={vista} onCambio={guardar} />
          </div>
        </div>

        {personas.isPending ? (
          <SkeletonFilas filas={5} />
        ) : personas.isError ? (
          <ErrorConReintento onReintentar={() => personas.refetch()} reintentando={personas.isFetching} />
        ) : filtrados.length === 0 && (vista === 'lista' || grupos.length === 0) ? (
          <Vacio icono={Search}
            titulo={consulta ? 'No encontramos vecinos con ese nombre o lote' : 'Todavía no hay vecinos en el padrón'} />
        ) : vista === 'lote' ? (
          // Con la key, cambiar de vista entra con su animación y un refresco no.
          <div key="lote" className="entra-vista"><VistaPorLote grupos={grupos} fila={(p) => filaVecino(p, false)} /></div>
        ) : (
          <div key="lista" className="entra-vista">
            {filtrados.map((p) => filaVecino(p, true))}
          </div>
        )}
      </div>

      <DialogLote persona={corrigiendo} disparador={disparador} onCerrar={() => setCorrigiendo(null)} />
      <DialogBaja persona={porDarDeBaja} disparador={disparador} onCerrar={() => setPorDarDeBaja(null)} />
    </>
  )
}
