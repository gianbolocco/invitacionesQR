'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { DIAS, hoyISO, type Invitation } from '@/lib/invitations'
import { Button, Field, ErrorNote, Eyebrow } from './ui'

const KINDS = [
  { id: 'visita', label: 'Visita' },
  { id: 'frecuente', label: 'Frecuente' },
  { id: 'evento', label: 'Evento' },
  { id: 'proveedor', label: 'Proveedor' },
] as const

type Kind = typeof KINDS[number]['id']

/** Rango amplio para las frecuentes: un año. No es "para siempre", pero obliga
 *  a revisar la lista una vez al año, que es sano. */
function enUnAnio(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function InvitationForm({ units, defaults, invitacion, onCreated }: {
  units: { id: string; label: string }[]
  defaults?: Partial<{ kind: Kind; guestName: string; guestDoc: string; plate: string }>
  /** Si viene, el formulario edita esa invitación en vez de crear una nueva. */
  invitacion?: Invitation
  onCreated: (inv: Invitation) => void
}) {
  const hoy = hoyISO()
  const editando = Boolean(invitacion)
  const [kind, setKind] = useState<Kind>(invitacion?.kind ?? defaults?.kind ?? 'visita')
  const [unitId, setUnitId] = useState(invitacion?.unitId ?? units[0]?.id ?? '')
  const [guestName, setGuestName] = useState(invitacion?.guestName ?? defaults?.guestName ?? '')
  const [guestDoc, setGuestDoc] = useState(invitacion?.guestDoc ?? defaults?.guestDoc ?? '')
  const [plate, setPlate] = useState(invitacion?.plate ?? defaults?.plate ?? '')
  const [validFrom, setValidFrom] = useState(invitacion?.validFrom ?? hoy)
  const [validTo, setValidTo] = useState(invitacion?.validTo ?? enUnAnio())
  const [weekdays, setWeekdays] = useState<number[]>(invitacion?.weekdays ?? [])
  const [capacity, setCapacity] = useState(invitacion?.capacity ?? 10)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const esEvento = kind === 'evento'
  const esFrecuente = kind === 'frecuente'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const cuerpo = {
      guestName,
      guestDoc: guestDoc || null,
      plate: plate || null,
      validFrom,
      validTo: esFrecuente ? validTo : validFrom,
      weekdays: esFrecuente && weekdays.length ? weekdays : null,
      capacity: esEvento ? capacity : esFrecuente ? 999 : 1,
    }

    try {
      // Editar no crea un token nuevo: quien ya tiene el link sigue usándolo.
      const inv = invitacion
        ? await api<Invitation>(`/invitations/${invitacion.id}`, {
          method: 'PATCH', body: JSON.stringify(cuerpo),
        })
        : await api<Invitation>('/invitations', {
          method: 'POST', body: JSON.stringify({ ...cuerpo, unitId, kind }),
        })
      onCreated(inv)
    } catch {
      setError(editando
        ? 'No se pudo guardar. Si ya entró gente, no podés bajar el cupo por debajo de ese número.'
        : 'No se pudo crear la invitación. Revisá el nombre y la fecha.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {!editando && (
      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow mb-2">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={`min-h-12 rounded-full border px-5 text-sm font-semibold ${
                kind === k.id
                  ? 'border-alamo bg-alamo text-white'
                  : 'border-ink/15 bg-white text-ink-soft'
              }`}>
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      )}

      {/* El selector de UF solo aparece si la persona tiene más de una. */}
      {!editando && units.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="unit" className="text-sm font-semibold">Unidad</label>
          <select id="unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}
            className="min-h-12 rounded border border-ink/15 bg-white px-3">
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
      )}

      <Field label={esEvento ? 'Nombre del evento' : 'Nombre del invitado'} required
        placeholder={esEvento ? 'Cumple de Sofi' : 'Juan Pérez'}
        value={guestName} onChange={(e) => setGuestName(e.target.value)} />

      <Field label={esFrecuente ? 'Desde' : 'Fecha'} type="date" value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)} className="tabular" />

      {esFrecuente && (
        <>
          <Field label="Hasta" type="date" value={validTo}
            onChange={(e) => setValidTo(e.target.value)} className="tabular" />
          <fieldset>
            <legend className="text-sm font-semibold">Días habilitados</legend>
            <div className="mt-2 flex gap-1">
              {DIAS.map((d, i) => (
                <button key={d} type="button" aria-pressed={weekdays.includes(i)}
                  onClick={() => setWeekdays((w) =>
                    w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort())}
                  className={`min-h-12 flex-1 rounded border text-xs font-semibold ${
                    weekdays.includes(i)
                      ? 'border-alamo bg-alamo text-white'
                      : 'border-ink/15 bg-white text-ink-soft'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-ink-soft">Sin días marcados vale todos los días.</p>
          </fieldset>
        </>
      )}

      {esEvento && (
        <Field label="Cuántos invitados" type="number" min={1} value={capacity} className="tabular"
          hint="El guardia anota el nombre de cada uno al entrar."
          onChange={(e) => setCapacity(Number(e.target.value))} />
      )}

      <div className="flex flex-col gap-4 border-t border-ink/10 pt-5">
        <Eyebrow>Opcional</Eyebrow>
        <Field label="DNI" inputMode="numeric" value={guestDoc} className="tabular"
          hint="Si lo cargás, el guardia no tiene que tipearlo en la barrera."
          onChange={(e) => setGuestDoc(e.target.value)} />
        <Field label="Patente" value={plate} className="tabular uppercase"
          onChange={(e) => setPlate(e.target.value)} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear invitación'}
      </Button>
    </form>
  )
}
