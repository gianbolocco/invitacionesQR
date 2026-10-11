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
import { DIAS, KIND_LABEL, type Invitation } from '@/lib/invitations'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { useCrearInvitacion, useEditarInvitacion, type DatosInvitacion } from '@/lib/queries/invitaciones'

type Kind = Invitation['kind']

const AYUDA_TIPO: Record<Kind, string> = {
  visita: 'Una persona, un día.',
  frecuente: 'Entra muchas veces en un período: la empleada, el profesor, la niñera.',
  proveedor: 'Un servicio, un día: el técnico, el delivery, el flete.',
}

/** Un año para las frecuentes: no es "para siempre", obliga a revisar la lista. */
function enUnAnio(desde: string): string {
  return sumarDias(desde, 365)
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
  const [unitId, setUnitId] = useState(invitacion?.unitId ?? units[0]?.id ?? '')
  const [guestName, setGuestName] = useState(invitacion?.guestName ?? inicial?.guestName ?? '')
  const [guestDoc, setGuestDoc] = useState(invitacion?.guestDoc ?? inicial?.guestDoc ?? '')
  const [plate, setPlate] = useState(invitacion?.plate ?? inicial?.plate ?? '')
  const [validFrom, setValidFrom] = useState(invitacion?.validFrom ?? hoy)
  const [validTo, setValidTo] = useState(invitacion?.validTo ?? enUnAnio(hoy))
  const [dias, setDias] = useState<string[]>((invitacion?.weekdays ?? []).map(String))
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const frecuente = kind === 'frecuente'

  // Las reglas, en un solo lugar: lo que se muestra al salir de un campo y lo
  // que frena el envío son lo mismo.
  const errores = {
    guestName: guestName.trim() ? null : 'Escribí el nombre de quien viene.',
    validFrom: !editando && validFrom < hoy ? 'No se puede invitar para un día que ya pasó.' : null,
    validTo: frecuente && validTo < validFrom ? 'La fecha de fin tiene que ser igual o posterior al inicio.' : null,
  }
  const mostrar = (campo: keyof typeof errores) => (tocado[campo] ? errores[campo] : null)
  const tocar = (campo: string) => setTocado((t) => ({ ...t, [campo]: true }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTocado({ guestName: true, validFrom: true, validTo: true })
    if (Object.values(errores).some(Boolean)) return
    setErrorGeneral(null)

    const datos: DatosInvitacion = {
      kind,
      guestName: guestName.trim(),
      guestDoc: guestDoc.trim() || null,
      plate: plate.trim().toUpperCase() || null,
      validFrom,
      validTo: frecuente ? validTo : validFrom,
      weekdays: frecuente && dias.length ? dias.map(Number).sort((a, b) => a - b) : null,
      // Una frecuente entra muchas veces dentro de su ventana; el resto, una.
      capacity: frecuente ? 999 : 1,
    }

    try {
      const inv = editando
        ? await editar.mutateAsync(datos)
        : await crear.mutateAsync({ ...datos, unitId })
      onListo(inv)
    } catch {
      setErrorGeneral(editando
        ? 'No se pudo guardar. Si ya entró gente, no podés achicar el período por debajo de esos ingresos.'
        : 'No se pudo crear la invitación. Revisá los datos y probá de nuevo.')
    }
  }

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

        {frecuente ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="desde" etiqueta="Desde" error={mostrar('validFrom')}>
                <CampoFecha id="desde" valor={validFrom} min={editando ? undefined : hoy}
                  onCambio={(v) => { setValidFrom(v); tocar('validFrom') }} />
              </Campo>
              <Campo id="hasta" etiqueta="Hasta" error={mostrar('validTo')}>
                <CampoFecha id="hasta" valor={validTo} min={validFrom}
                  onCambio={(v) => { setValidTo(v); tocar('validTo') }} />
              </Campo>
            </div>
            <Campo id="dias" etiqueta="Días habilitados" ayuda="Sin días marcados, puede entrar todos los días.">
              <ChipsMultiples etiqueta="Días habilitados" valores={dias} onCambio={setDias}
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

      <section className="flex flex-col gap-5 rounded-lg bg-surface-sunk/70 p-4 sm:p-5">
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

      {errorGeneral && <Nota tono="error">{errorGeneral}</Nota>}

      <Button type="submit" size="lg" disabled={mutacion.isPending}>
        {mutacion.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {mutacion.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear invitación'}
      </Button>
    </form>
  )
}
