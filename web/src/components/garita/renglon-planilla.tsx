'use client'
import { useState, type ComponentProps, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useDemora } from '@/lib/use-demora'
import { useAgenda, useBusqueda, useBuscarUnidades } from '@/lib/queries/garita'
import { momentosDe, normalizarHora, type FilaPlanilla } from '@/lib/carga-manual'

/** En la tabla las celdas no llevan caja: se ven al pasar o al entrar, como en una planilla. */
const CELDA = cn(
  'h-10 rounded-sm border-2 border-transparent bg-transparent px-2 text-[15px]',
  'hover-fino:bg-surface focus-visible:border-azul-text focus-visible:bg-card focus-visible:outline-none',
)

const TAG = 'pointer-events-none inline-flex items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold'

type Opcion = { clave: string; titulo: string; meta?: string; elegir: () => void }

/** Para buscar "Pérez" escribiendo "perez". */
const plano = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Un input con sugerencias abajo: flechas para moverse, Enter elige, Esc cierra.
 * No es un Popover: el foco se queda en el input y Tab sigue a la celda de al lado.
 */
function Buscador({ id, valor, onTexto, opciones, className, ...resto }: {
  id: string
  valor: string
  onTexto: (v: string) => void
  opciones: Opcion[]
} & Omit<ComponentProps<'input'>, 'id' | 'value' | 'onChange'>) {
  const [abierto, setAbierto] = useState(false)
  // Por clave y no por índice: si la búsqueda llega tarde, la opción marcada no se corre.
  const [activa, setActiva] = useState<string | null>(null)
  const lista = `${id}-opciones`
  const visible = abierto && valor.trim() !== '' && opciones.length > 0
  const i = Math.max(0, opciones.findIndex((o) => o.clave === activa))

  function elegir(o: Opcion) {
    o.elegir()
    setAbierto(false)
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (resto.readOnly) return
    if (e.key === 'Escape') setAbierto(false)
    if (!visible) {
      if (e.key === 'ArrowDown' && valor.trim()) { e.preventDefault(); setAbierto(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiva(opciones[(i + 1) % opciones.length].clave) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva(opciones[(i - 1 + opciones.length) % opciones.length].clave) }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(opciones[i]) }
  }

  return (
    <div className="relative">
      <Input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={visible}
        aria-controls={visible ? lista : undefined} aria-activedescendant={visible ? `${lista}-${i}` : undefined}
        value={valor} className={className} {...resto}
        onChange={(e) => { onTexto(e.target.value); setAbierto(true); setActiva(null) }}
        onBlur={() => setAbierto(false)} onKeyDown={tecla} />
      {visible && (
        <ul id={lista} role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-md border border-line bg-card p-1 shadow-(--sombra-flotante)">
          {opciones.map((o, n) => (
            <li key={o.clave} id={`${lista}-${n}`} role="option" aria-selected={n === i}
              // mousedown sin preventDefault le saca el foco al input y cierra la lista antes del click.
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiva(o.clave)} onClick={() => elegir(o)}
              className={cn('cursor-pointer rounded-sm px-3 py-2', n === i && 'bg-azul-tint')}>
              <span className="block truncate text-[15px] font-semibold text-ink">{o.titulo}</span>
              {o.meta && <span className="block truncate text-sm text-ink-soft tabular">{o.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** La hora se tipea: '2140' pasa a '21:40' al salir de la celda. Lo que no es hora queda y la fila lo marca. */
function CampoHoraTexto({ valor, onValor, ...resto }: {
  valor: string
  onValor: (v: string) => void
} & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  return (
    <Input inputMode="numeric" maxLength={5} placeholder="21:40" autoComplete="off" value={valor} {...resto}
      className={cn('tabular', resto.className)}
      onChange={(e) => onValor(e.target.value)}
      onBlur={() => { const n = normalizarHora(valor); if (n && n !== valor) onValor(n) }} />
  )
}

type Invitacion = { id: string; guestName: string; guestDoc: string | null; plate: string | null; unitLabel: string }

/**
 * Un renglón de la planilla de papel: una `<tr>` en escritorio y una tarjeta en
 * el celular, con los campos en el orden del papel (es el orden de Tab).
 * El lote de una invitación no es un campo: viene con ella y Tab lo saltea.
 */
export function RenglonPlanilla({ fila, numero, fecha, error, escritorio, bloqueada, refIngreso, onCambio, onQuitar, onEnterFinal, onSalir }: {
  fila: FilaPlanilla
  numero: number
  fecha: string
  /** Ya filtrado por la página: solo llega si hay que mostrarlo. */
  error: string | null
  escritorio: boolean
  /** readOnly y no disabled: si la API marca una fila, su Ingreso tiene que poder tomar el foco. */
  bloqueada: boolean
  refIngreso: (el: HTMLInputElement | null) => void
  onCambio: (cambios: Partial<FilaPlanilla>) => void
  onQuitar: () => void
  onEnterFinal: () => void
  /** El foco dejó la fila: desde ahí se muestran sus errores. */
  onSalir: () => void
}) {
  const { persona } = fila
  const conInvitacion = persona && 'invitationId' in persona ? persona : null
  const sinInvitacion = persona && !('invitationId' in persona) ? persona : null

  const [texto, setTexto] = useState(persona?.nombre ?? '')
  const q = texto.trim()
  const agenda = useAgenda(fecha)
  const busqueda = useBusqueda(useDemora(conInvitacion ? '' : q))
  const [qLote, setQLote] = useState('')
  const qLoteDemorado = useDemora(qLote.trim())
  const unidades = useBuscarUnidades(sinInvitacion && !sinInvitacion.unitId ? qLoteDemorado : '')

  function elegirInvitacion(x: Invitacion) {
    setTexto(x.guestName)
    onCambio({
      persona: { invitationId: x.id, nombre: x.guestName, lote: x.unitLabel, dniInvitacion: x.guestDoc, patenteInvitacion: x.plate },
      // El DNI y la patente de la invitación se completan solos; si no tiene, queda lo que se tipeó.
      dni: x.guestDoc ?? fila.dni,
      patente: x.plate ?? fila.patente,
    })
  }

  function tipearPersona(v: string) {
    setTexto(v)
    if (conInvitacion) {
      // Cambiar el nombre es buscar a otra persona: el DNI que trajo la invitación se va con ella.
      onCambio({
        persona: null,
        dni: fila.dni === conInvitacion.dniInvitacion ? '' : fila.dni,
        patente: fila.patente === conInvitacion.patenteInvitacion ? '' : fila.patente,
      })
    } else if (sinInvitacion) {
      onCambio({ persona: v.trim() ? { ...sinInvitacion, nombre: v } : null })
    }
  }

  let opcionesPersona: Opcion[] = []
  if (!conInvitacion && q) {
    const t = plano(q)
    // Primero quienes estaban invitados ese día: en un corte casi siempre es alguno de ellos.
    const delDia = (agenda.data ?? [])
      .filter((a) => [a.guestName, a.guestDoc ?? '', a.unitLabel].some((c) => plano(c).includes(t)))
      .slice(0, 5)
    const yaEstan = new Set(delDia.map((a) => a.id))
    const otras = (busqueda.data ?? []).filter((h) => !yaEstan.has(h.id)).slice(0, 5)
    opcionesPersona = [
      ...delDia.map((a) => ({
        clave: a.id, titulo: a.guestName, meta: ['Invitado ese día', a.unitLabel, a.guestDoc].filter(Boolean).join(' · '),
        elegir: () => elegirInvitacion(a),
      })),
      ...otras.map((h) => ({
        clave: h.id, titulo: h.guestName, meta: [h.unitLabel, h.guestDoc].filter(Boolean).join(' · '),
        elegir: () => elegirInvitacion(h),
      })),
      {
        clave: 'sin-invitacion', titulo: `Cargar «${q}» sin invitación`, meta: 'Después elegí el lote al que fue',
        elegir: () => onCambio({ persona: { nombre: q, unitId: sinInvitacion?.unitId ?? '', lote: sinInvitacion?.lote ?? '' } }),
      },
    ]
  }

  const opcionesLote: Opcion[] = sinInvitacion && !sinInvitacion.unitId
    ? (unidades.data ?? []).map((u) => ({
      clave: `${u.unitId}-${u.residentName}`, titulo: u.unitLabel, meta: u.residentName,
      elegir: () => { setQLote(u.unitLabel); onCambio({ persona: { ...sinInvitacion, unitId: u.unitId, lote: u.unitLabel } }) },
    }))
    : []

  const { masUnDia } = momentosDe(fecha, fila)
  const id = (campo: string) => `fila-${fila.clave}-${campo}`
  const etiqueta = (campo: string) => `${campo}, fila ${numero}`
  const celda = escritorio ? CELDA : undefined

  const ingreso = (
    <CampoHoraTexto id={id('ingreso')} readOnly={bloqueada} ref={refIngreso} aria-label={etiqueta('Ingreso')} className={celda}
      valor={fila.ingreso} onValor={(ingreso) => onCambio({ ingreso })} />
  )
  const tagSinInvitacion = sinInvitacion && <span className={cn(TAG, 'border border-dashed border-control text-ink-soft')}>Sin invitación</span>
  const campoPersona = (
    <div className="relative">
      <Buscador id={id('persona')} readOnly={bloqueada} aria-label={etiqueta('Persona')} placeholder="Nombre, DNI o lote" maxLength={120}
        className={cn(celda, 'font-semibold', escritorio && sinInvitacion && 'pr-28')}
        valor={persona?.nombre ?? texto} onTexto={tipearPersona} opciones={opcionesPersona} />
      {escritorio && tagSinInvitacion && <span className="absolute right-2 top-1/2 -translate-y-1/2">{tagSinInvitacion}</span>}
    </div>
  )
  const dni = (
    <Input id={id('dni')} readOnly={bloqueada} aria-label={etiqueta('DNI')} placeholder="DNI" maxLength={20} autoComplete="off" className={cn(celda, 'tabular')}
      value={fila.dni} onChange={(e) => onCambio({ dni: e.target.value })} />
  )
  const lote = sinInvitacion ? (
    <Buscador id={id('lote')} readOnly={bloqueada} aria-label={etiqueta('Lote')} placeholder="Lote o vecino" className={celda}
      valor={sinInvitacion.unitId ? sinInvitacion.lote : qLote} opciones={opcionesLote}
      onTexto={(v) => {
        setQLote(v)
        if (sinInvitacion.unitId) onCambio({ persona: { ...sinInvitacion, unitId: '', lote: '' } })
      }} />
  ) : (
    <span id={id('lote')} className={cn('block truncate px-2.5 text-[15px]', !escritorio && 'py-2.5', conInvitacion ? 'text-ink' : 'text-ink-soft')}>
      {conInvitacion?.lote ?? '—'}
    </span>
  )
  const masUno = masUnDia && <span className={cn(TAG, 'bg-azul-tint text-ink')} title="La salida es del día siguiente">+1 día</span>
  const salida = (
    <CampoHoraTexto id={id('salida')} readOnly={bloqueada} aria-label={etiqueta('Salida')} placeholder={escritorio ? '—' : 'Adentro'}
      className={cn(celda, escritorio && 'w-[4.75rem] shrink-0')} valor={fila.salida} onValor={(salida) => onCambio({ salida })} />
  )
  const patente = (
    <Input id={id('patente')} readOnly={bloqueada} aria-label={etiqueta('Patente')} placeholder="Opcional" maxLength={10} autoComplete="off"
      className={cn(celda, 'uppercase tabular')}
      value={fila.patente} onChange={(e) => onCambio({ patente: e.target.value.toUpperCase() })}
      onKeyDown={(e) => { if (e.key === 'Enter' && !bloqueada) { e.preventDefault(); onEnterFinal() } }} />
  )
  const quitar = (
    <Button variant="ghost" size="icon" aria-label={`Quitar la fila ${numero}`} disabled={bloqueada} onClick={onQuitar}
      className={cn('text-ink-soft', escritorio && 'size-9')}>
      <X aria-hidden />
    </Button>
  )
  const aviso = error && (
    <p role="alert" className="flex items-start gap-1.5 text-sm text-alto">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{error}
    </p>
  )
  const salir = (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget)) onSalir() }

  if (escritorio) {
    return (
      <>
        <tr onBlur={salir} className={cn('align-middle', !aviso && 'border-b border-line')}>
          <td className={cn('py-1.5 pl-3 text-sm text-ink-soft tabular', aviso && 'shadow-[inset_3px_0_0_var(--alto)]')}>{numero}</td>
          <td className="px-0.5 py-1.5">{ingreso}</td>
          <td className="px-0.5 py-1.5">{campoPersona}</td>
          <td className="px-0.5 py-1.5">{dni}</td>
          <td className="px-0.5 py-1.5">{lote}</td>
          <td className="px-0.5 py-1.5"><div className="flex items-center gap-1.5">{salida}{masUno}</div></td>
          <td className="px-0.5 py-1.5">{patente}</td>
          <td className="py-1.5 pr-2 text-right">{quitar}</td>
        </tr>
        {aviso && (
          <tr className="border-b border-line">
            <td className="shadow-[inset_3px_0_0_var(--alto)]" />
            <td colSpan={7} className="px-2.5 pb-2.5">{aviso}</td>
          </tr>
        )}
      </>
    )
  }

  const campo = (nombre: string, control: ReactNode, accesorio?: ReactNode, clase?: string) => (
    <div className={cn('flex min-w-0 flex-col gap-1.5', clase)}>
      <div className="flex items-center justify-between gap-2">
        {nombre === 'Lote' && conInvitacion
          // Con invitación el lote es un texto, no un campo: una Label apuntaría a un span.
          ? <span className="text-sm font-medium text-ink">{nombre}</span>
          : <Label htmlFor={id(nombre.toLowerCase())} className="text-sm text-ink">{nombre}</Label>}
        {accesorio}
      </div>
      {control}
    </div>
  )
  return (
    <section aria-label={`Fila ${numero}`} onBlur={salir}
      className={cn('flex flex-col gap-3 rounded-md border bg-card p-4', aviso ? 'border-alto' : 'border-line')}>
      <div className="-mr-2 -mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-soft tabular">Fila {numero}</span>
        {quitar}
      </div>
      <div className="grid grid-cols-[7.5rem_1fr] gap-3">
        {campo('Ingreso', ingreso)}
        {campo('Persona', campoPersona, tagSinInvitacion)}
        {campo('DNI', dni)}
        {campo('Lote', lote)}
        {campo('Salida', salida, masUno)}
        {campo('Patente', patente)}
      </div>
      {aviso}
    </section>
  )
}
