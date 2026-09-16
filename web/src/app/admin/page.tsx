'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { Filete, Eyebrow } from '@/components/ui'
import { SkeletonTiles, Cargando } from '@/components/feedback'
import { BarChart, type Barra } from '@/components/bar-chart'
import { fechaHora } from '@/lib/admin'

type Kpis = {
  entriesToday: number
  entriesWeek: number
  entriesMonth: number
  activeInvitations: number
  enabledResidents: number
  activeResidents30d: number
  unitsWithoutResidents: number
}

type PorDia = { day: string; total: number }
type PorHora = { hour: number; total: number }
type PorPersona = { id: string; name: string; unitLabel: string; total: number }
type PorGuardia = { id: string | null; name: string | null; total: number; lastAt: string | null }

function Tile({ label, value, tone = 'normal' }: {
  label: string; value: number | string; tone?: 'normal' | 'alerta'
}) {
  return (
    <Filete className={`px-4 py-3.5 ${tone === 'alerta' ? 'bg-deny-field/5' : 'bg-card'}`}>
      <Eyebrow>{label}</Eyebrow>
      <p className={`display mt-1 text-3xl tabular ${tone === 'alerta' ? 'text-deny-field' : ''}`}>
        {value}
      </p>
    </Filete>
  )
}

export default function TableroPage() {
  const me = useMe()
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [porDia, setPorDia] = useState<PorDia[]>([])
  const [porHora, setPorHora] = useState<PorHora[]>([])
  const [porPersona, setPorPersona] = useState<PorPersona[]>([])
  const [porGuardia, setPorGuardia] = useState<PorGuardia[]>([])

  useEffect(() => {
    if (!me) return
    api<Kpis>('/reports/kpis').then(setKpis).catch(() => {})
    api<PorDia[]>('/reports/entries-by-day').then(setPorDia).catch(() => {})
    api<PorHora[]>('/reports/entries-by-hour').then(setPorHora).catch(() => {})
    api<PorPersona[]>('/reports/invitations-by-person').then(setPorPersona).catch(() => {})
    api<PorGuardia[]>('/reports/activity-by-guard').then(setPorGuardia).catch(() => {})
  }, [me])

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  // Las 24 horas siempre presentes, aunque no haya ingresos: los huecos son dato.
  const horas: Barra[] = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    total: porHora.find((x) => x.hour === h)?.total ?? 0,
    hint: `${String(h).padStart(2, '0')}:00`,
  }))

  const dias: Barra[] = porDia.map((d) => {
    const iso = String(d.day).slice(0, 10)
    const [y, m, dd] = iso.split('-').map(Number)
    return {
      label: `${dd}/${m}`,
      total: d.total,
      hint: new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
        .format(new Date(y, m - 1, dd)),
    }
  })

  const maxInvit = Math.max(1, ...porPersona.map((p) => p.total))

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-8">
        <h1 className="display text-2xl">Tablero</h1>

        {!kpis && <Cargando><SkeletonTiles /></Cargando>}

        {kpis && (
          <>
            {/* El agujero del padrón va primero y aparte: es el número accionable. */}
            {kpis.unitsWithoutResidents > 0 && (
              <Tile tone="alerta" label="Unidades sin ningún vecino registrado"
                value={kpis.unitsWithoutResidents} />
            )}

            <div className="escalonar grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Tile label="Ingresos hoy" value={kpis.entriesToday} />
              <Tile label="Ingresos esta semana" value={kpis.entriesWeek} />
              <Tile label="Ingresos este mes" value={kpis.entriesMonth} />
              <Tile label="Invitaciones vigentes" value={kpis.activeInvitations} />
              <Tile label="Vecinos habilitados" value={kpis.enabledResidents} />
              <Tile label="Vecinos que entraron a la app (30 días)"
                value={kpis.activeResidents30d} />
            </div>
          </>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <Filete className="bg-card p-5">
            <BarChart title="Ingresos por día · últimos 30" bars={dias} />
          </Filete>
          <Filete className="bg-card p-5">
            <BarChart title="Ingresos por hora del día" bars={horas}
              emptyText="Sin ingresos registrados todavía." />
          </Filete>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <Eyebrow>Invitaciones por vecino</Eyebrow>
            {porPersona.length === 0 && <p className="text-sm text-ink-soft">Sin invitaciones.</p>}
            <ul className="flex flex-col gap-1.5">
              {porPersona.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm">{p.name}</span>
                  <span className="h-2.5 rounded-full bg-[#0f8f52]"
                    style={{ width: `${(p.total / maxInvit) * 100}%`, minWidth: '4px' }} />
                  <span className="text-sm text-ink-soft tabular">{p.total}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <Eyebrow>Actividad por guardia</Eyebrow>
            {porGuardia.length === 0 && <p className="text-sm text-ink-soft">Sin ingresos.</p>}
            <table className="w-full text-left text-sm">
              <tbody>
                {porGuardia.map((g) => (
                  <tr key={g.id ?? 'sin'} className="border-b border-line">
                    <td className="py-2">{g.name ?? 'Sin asignar'}</td>
                    <td className="py-2 tabular">{g.total}</td>
                    <td className="py-2 text-ink-soft tabular">
                      {g.lastAt ? fechaHora(g.lastAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </Shell>
  )
}
