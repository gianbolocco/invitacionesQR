'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Campo } from '@/components/dominio/campo'
import { Chips, ChipsMultiples } from '@/components/dominio/chips'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Nota } from '@/components/dominio/nota'
import { HorarioRubro } from '@/components/dominio/horario-rubro'
import { DIAS, KIND_LABEL, type Invitation } from '@/lib/invitations'
import { fechaCorta, hoyISO, unMesDespues } from '@/lib/fechas'
import { ApiError } from '@/lib/api'
import { useCrearInvitacion, useEditarInvitacion, useRubrosDelBarrio, type DatosInvitacion } from '@/lib/queries/invitaciones'
import { diaDe, diasSinFranja, franjasDelRubro, nombreDiaPlural } from '@/lib/franjas'

type Kind = Invitation['kind']

const AYUDA_TIPO: Record<Kind, string> = {
  visita: 'Una persona, un día.',
  frecuente: 'Entra muchas veces en un período: la empleada, el profesor, la niñera.',
  proveedor: 'Un servicio, un día: el técnico, el delivery, el flete.',
}

export function FormularioInvitacion({ units, inicial, invitacion, onListo }: {
  units: { id: string; label: string }[]
  inicial?: Partial<{ kind: Kind; guestName: string; guestDoc: string; plate: string }>
  invitacion?: Invitation
  onListo: (inv: Invitation) => void
}) {
  const hoy = hoyISO()
  const editando = Boolean(invitacion)
  const crear = useCrearInvitacion()
  const editar = useEditarInvitacion(invitacion?.id ?? '')
  const mutacion = editando ? editar : crear

  const [kind, setKind] = useState<Kind>(invitacion?.kind ?? inicial?.kind ?? 'visita')
  const [frecuenteComo, setFrecuenteComo] = useState<'visita' | 'proveedor'>(invitacion?.frequentAs ?? 'visita')
  const [unitId, setUnitId] = useState(invitacion?.unitId ?? units[0]?.id ?? '')
  const [guestName, setGuestName] = useState(invitacion?.guestName ?? inicial?.guestName ?? '')
  const [guestDoc, setGuestDoc] = useState(invitacion?.guestDoc ?? inicial?.guestDoc ?? '')
  const [plate, setPlate] = useState(invitacion?.plate ?? inicial?.plate ?? '')
  const [nota, setNota] = useState(invitacion?.note ?? '')
  const [validFrom, setValidFrom] = useState(invitacion?.validFrom ?? hoy)
  // Un mes: el tope de una visita frecuente, que es la que se elige por defecto.
  const [validTo, setValidTo] = useState(invitacion?.validTo ?? unMesDespues(hoy))
  const [dias, setDias] = useState<string[]>((invitacion?.weekdays ?? []).map(String))
  const [rubro, setRubro] = useState(invitacion?.tradeId ?? '')
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const frecuente = kind === 'frecuente'
  const { data: rubros } = useRubrosDelBarrio()
  const comoProveedor = kind === 'proveedor' || (frecuente && frecuenteComo === 'proveedor')
  const listaRubros = rubros?.trades ?? []
  // Sin rubros activos en el barrio la función está apagada: no hay campo.
  const pideRubro = comoProveedor && listaRubros.length > 0
  const archivado = Boolean(invitacion?.tradeId) && !listaRubros.some((t) => t.id === invitacion?.tradeId)
  const franjasRubro = pideRubro && rubro ? franjasDelRubro(rubros?.providerWindows ?? [], rubro) : []
  // Días que el rubro no cubre: un aviso, nunca frena el envío.
  const diasRevisar = frecuente ? (dias.length ? dias.map(Number) : [0, 1, 2, 3, 4, 5, 6]) : [diaDe(validFrom)]
  const choques = pideRubro && rubro ? diasSinFranja(rubros?.providerWindows ?? [], rubro, diasRevisar) : []
  const nombreRubro = listaRubros.find((t) => t.id === rubro)?.name ?? invitacion?.tradeName ?? ''
  // Una visita frecuente dura hasta un mes (la API lo exige igual); la de proveedor no tiene tope.
  const tope = frecuente && frecuenteComo === 'visita' ? unMesDespues(validFrom) : undefined

  // Las reglas, en un solo lugar: lo que se muestra al salir de un campo y lo
  // que frena el envío son lo mismo.
  const errores = {
    guestName: guestName.trim() ? null : 'Escribí el nombre de quien viene.',
    rubro: pideRubro && !rubro ? 'Elegí el rubro.' : null,
    validFrom: !editando && validFrom < hoy ? 'No se puede invitar para un día que ya pasó.' : null,
    validTo: frecuente && validTo < validFrom ? 'La fecha de fin tiene que ser igual o posterior al inicio.'
      : tope && validTo > tope ? `Una visita frecuente dura hasta un mes: elegí hasta el ${fechaCorta(tope)}.`
      : null,
  }
  const mostrar = (campo: keyof typeof errores) => (tocado[campo] ? errores[campo] : null)
  const tocar = (campo: string) => setTocado((t) => ({ ...t, [campo]: true }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTocado({ guestName: true, rubro: true, validFrom: true, validTo: true })
    if (Object.values(errores).some(Boolean)) return
    setErrorGeneral(null)

    const datos: DatosInvitacion = {
      kind,
      ...(frecuente ? { frequentAs: frecuenteComo } : {}),
      guestName: guestName.trim(),
      guestDoc: guestDoc.trim() || null,
      plate: plate.trim().toUpperCase() || null,
      note: nota.trim() || null,
      validFrom,
      validTo: frecuente ? validTo : validFrom,
      weekdays: frecuente && dias.length ? dias.map(Number).sort((a, b) => a - b) : null,
      // Una frecuente entra muchas veces dentro de su ventana; el resto, una.
      capacity: frecuente ? 999 : 1,
      // Si el rubro no cambió no se manda (puede estar archivado); si ya no es proveedor, se limpia.
      ...(pideRubro ? (rubro !== (invitacion?.tradeId ?? '') ? { tradeId: rubro } : {})
        : listaRubros.length ? { tradeId: null } : {}),
    }

    try {
      const inv = editando
        ? await editar.mutateAsync(datos)
        : await crear.mutateAsync({ ...datos, unitId })
      onListo(inv)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'frecuente_mas_de_un_mes') {
        setErrorGeneral('Una visita frecuente dura hasta un mes. Acortá las fechas o elegí Proveedor.')
        return
      }
      if (e instanceof ApiError && e.code === 'rubro_requerido') {
        setErrorGeneral('Elegí el rubro.')
        return
      }
      if (e instanceof ApiError && e.code === 'rubro_invalido') {
        setErrorGeneral('Ese rubro ya no está disponible. Elegí otro.')
        return
      }
      setErrorGeneral(editando
        ? 'No se pudo guardar. Una invitación que ya se usó o venció no se puede editar.'
        : 'No se pudo crear la invitación. Revisá los datos y probá de nuevo.')
    }
  }

  const campoRubro = pideRubro && (
    <>
      <Campo id="rubro" etiqueta="Rubro" error={mostrar('rubro')}>
        <Select value={rubro} onValueChange={(v) => { setRubro(v); tocar('rubro') }}>
          <SelectTrigger id="rubro" className="h-11! w-full" aria-invalid={Boolean(mostrar('rubro')) || undefined}>
            <SelectValue placeholder="Elegí el rubro" />
          </SelectTrigger>
          <SelectContent>
            {archivado && invitacion?.tradeId && (
              <SelectItem value={invitacion.tradeId}>{invitacion.tradeName} (archivado)</SelectItem>
            )}
            {listaRubros.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>
      <HorarioRubro titulo="Puede entrar" franjas={franjasRubro} />
      {choques.length > 0 && (
        <p role="status" className="rounded-md bg-espera-tint p-3 text-sm font-semibold text-espera">
          Los {new Intl.ListFormat('es', { type: 'conjunction' }).format(choques.map((d) => nombreDiaPlural(d).toLowerCase()))} no entra el rubro {nombreRubro}:
          {choques.length > 1 ? ' esos días' : ' ese día'} la guardia lo va a rechazar.
        </p>
      )}
    </>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        {!editando && (
          <Campo id="tipo" etiqueta="Tipo" ayuda={AYUDA_TIPO[kind]}>
            <Chips etiqueta="Tipo de invitación" valor={kind} onCambio={setKind}
              opciones={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ valor: k, etiqueta: KIND_LABEL[k] }))} />
          </Campo>
        )}

        {!editando && units.length > 1 && (
          <Campo id="unidad" etiqueta="Unidad">
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger id="unidad" className="h-11! w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        )}

        <Campo id="nombre" etiqueta="Nombre del invitado" error={mostrar('guestName')}>
          <Input id="nombre" value={guestName} placeholder="Juan Pérez" autoComplete="off"
            aria-invalid={Boolean(mostrar('guestName')) || undefined} aria-describedby="nombre-nota"
            onChange={(e) => setGuestName(e.target.value)} onBlur={() => tocar('guestName')} />
        </Campo>

        {!frecuente && campoRubro}

        {frecuente ? (
          <>
            <Campo id="frecuente-como" etiqueta="¿Viene de visita o a trabajar?"
              ayuda={frecuenteComo === 'visita'
                ? 'La empleada, la niñera, el profesor.'
                : 'El jardinero, el pintor, el de la pileta: en la garita se marca como proveedor.'}>
              <Chips etiqueta="Viene de visita o a trabajar" valor={frecuenteComo}
                onCambio={(v) => { setFrecuenteComo(v); tocar('validTo') }}
                opciones={[{ valor: 'visita', etiqueta: 'Visita' }, { valor: 'proveedor', etiqueta: 'Proveedor' }]} />
            </Campo>
            {campoRubro}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="desde" etiqueta="Desde" error={mostrar('validFrom')}>
                <CampoFecha id="desde" valor={validFrom} min={editando ? undefined : hoy}
                  onCambio={(v) => { setValidFrom(v); tocar('validFrom'); tocar('validTo') }} />
              </Campo>
              <Campo id="hasta" etiqueta="Hasta" error={mostrar('validTo')}>
                <CampoFecha id="hasta" valor={validTo} min={validFrom} max={tope}
                  onCambio={(v) => { setValidTo(v); tocar('validTo') }} />
              </Campo>
            </div>
            <Campo id="dias" etiqueta="Días habilitados" ayuda="Sin días marcados, puede entrar todos los días.">
              <ChipsMultiples etiqueta="Días habilitados" valores={dias} onCambio={setDias} choque={choques.map(String)}
                opciones={DIAS.map((d, i) => ({ valor: String(i), etiqueta: d }))} />
            </Campo>
          </>
        ) : (
          <Campo id="fecha" etiqueta="Fecha" error={mostrar('validFrom')}>
            <CampoFecha id="fecha" valor={validFrom} min={editando ? undefined : hoy}
              onCambio={(v) => { setValidFrom(v); tocar('validFrom') }} />
          </Campo>
        )}
      </section>

      <section className="flex flex-col gap-5 rounded-md bg-surface-sunk/70 p-4 sm:p-5">
        <div>
          <p className="font-semibold">Para entrar más rápido</p>
          <p className="text-sm text-ink-soft">Opcional. Si lo cargás, el guardia no lo tiene que pedir en la barrera.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="doc" etiqueta="Documento">
            <Input id="doc" value={guestDoc} className="tabular" placeholder="30.123.456"
              onChange={(e) => setGuestDoc(e.target.value)} />
          </Campo>
          <Campo id="patente" etiqueta="Patente">
            <Input id="patente" value={plate} className="uppercase tabular" placeholder="AB 123 CD"
              onChange={(e) => setPlate(e.target.value)} />
          </Campo>
        </div>
      </section>

      <Campo id="nota" etiqueta="Nota para la guardia (opcional)"
        accesorio={<span className="text-xs tabular text-ink-soft">{nota.length}/140</span>}
        ayuda="La lee la guardia. No pongas datos de salud ni otros datos sensibles.">
        <textarea id="nota" rows={2} maxLength={140} value={nota} aria-describedby="nota-nota" onChange={(e) => setNota(e.target.value)}
          placeholder="Viene en un Gol rojo"
          className="w-full resize-none rounded-sm border-2 border-control bg-card px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-soft focus-visible:border-azul-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      </Campo>

      {errorGeneral && <Nota tono="error">{errorGeneral}</Nota>}

      <Button type="submit" size="lg" disabled={mutacion.isPending}>
        {mutacion.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {mutacion.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear invitación'}
      </Button>
    </form>
  )
}
