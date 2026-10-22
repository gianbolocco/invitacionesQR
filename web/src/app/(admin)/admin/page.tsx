'use client'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Kpi } from '@/components/dominio/kpi'
import { Fila } from '@/components/dominio/fila'
import { BarChart, type Barra } from '@/components/bar-chart'
import {
  useActividadPorGuardia, useEntradasPorDia, useEntradasPorHora, useInvitacionesPorPersona, useKpis,
} from '@/lib/queries/admin'
import { fechaHora } from '@/lib/fechas'

/** undefined cuando la semana pasada no hay con qué comparar: mostrar "+∞%" confunde más de lo que informa. */
function variacion(hoy: number, haceUnaSemana: number): { texto: string; tono: 'sube' | 'baja' | 'neutro' } | undefined {
  if (haceUnaSemana === 0) return undefined
  const delta = Math.round(((hoy - haceUnaSemana) / haceUnaSemana) * 100)
  if (delta === 0) return { texto: 'igual que el mismo día la semana pasada', tono: 'neutro' }
  return { texto: `${Math.abs(delta)}% vs. el mismo día la semana pasada`, tono: delta > 0 ? 'sube' : 'baja' }
}

export default function TableroPage() {
  const kpis = useKpis()
  const porDia = useEntradasPorDia()
  const porHora = useEntradasPorHora()
  const porPersona = useInvitacionesPorPersona()
  const porGuardia = useActividadPorGuardia()

  const horas: Barra[] = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    total: (porHora.data ?? []).find((x) => x.hour === h)?.total ?? 0,
    hint: `${String(h).padStart(2, '0')}:00`,
  }))

  const dias: Barra[] = (porDia.data ?? []).map((d) => {
    const iso = String(d.day).slice(0, 10)
    const [y, m, dd] = iso.split('-').map(Number)
    return {
      label: `${dd}/${m}`,
      total: d.total,
      hint: new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
        .format(new Date(y, m - 1, dd)),
    }
  })

  const maxInvit = Math.max(1, ...(porPersona.data ?? []).map((p) => p.total))
  const k = kpis.data
  const hayAtencion = k && (k.unitsWithoutResidents > 0 || k.staleInside > 0 || k.invitedNeverLoggedIn > 0)

  return (
      <div className="flex flex-col gap-8">
        <EncabezadoPagina antetitulo="Administración" titulo="Tablero" />

        {k && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Ingresos hoy" valor={k.entriesToday}
                variacion={variacion(k.entriesToday, k.entriesSameDayLastWeek)} />
              <Kpi etiqueta="Adentro ahora" valor={k.insideNow} />
              <Kpi etiqueta="Invitaciones vigentes" valor={k.activeInvitations} />
            </div>

            {hayAtencion && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-ink-soft">Atención</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {k.unitsWithoutResidents > 0 && (
                    <Kpi tono="atencion" etiqueta="Unidades sin vecinos" valor={k.unitsWithoutResidents} />
                  )}
                  {k.staleInside > 0 && (
                    <Kpi tono="atencion" etiqueta="Sin salida hace más de 12 horas" valor={k.staleInside} />
                  )}
                  {k.invitedNeverLoggedIn > 0 && (
                    <Kpi tono="atencion" etiqueta="Invitados que nunca entraron" valor={k.invitedNeverLoggedIn} />
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <BarChart title="Ingresos por día · últimos 30" bars={dias} />
          <BarChart title="Ingresos por hora del día" bars={horas} emptyText="Sin ingresos registrados todavía." />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink-soft">Invitaciones por vecino</p>
            {(porPersona.data ?? []).length === 0 && <p className="text-sm text-ink-soft">Sin invitaciones.</p>}
            <ul className="flex flex-col gap-1.5">
              {(porPersona.data ?? []).slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm sm:w-40">{p.name}</span>
                  <span className="h-2.5 rounded-full bg-azul" style={{ width: `${(p.total / maxInvit) * 100}%`, minWidth: '4px' }} />
                  <span className="text-sm text-ink-soft tabular">{p.total}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink-soft">Actividad por guardia</p>
            {(porGuardia.data ?? []).length === 0 && <p className="text-sm text-ink-soft">Sin ingresos.</p>}
            {(porGuardia.data ?? []).map((g) => (
              <Fila densa key={g.id ?? 'sin'} titulo={g.name ?? 'Sin asignar'}
                meta={g.lastAt ? `Último: ${fechaHora(g.lastAt)}` : undefined}
                extremo={<span className="tabular text-sm font-semibold">{g.total}</span>} />
            ))}
          </section>
        </div>
      </div>
  )
}
