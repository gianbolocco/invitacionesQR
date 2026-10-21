import { hoyISO } from '@/lib/fechas'
import { horaCorta, temporadaRige, textoDias, type Franja } from '@/lib/franjas'

const desde = (mmdd: string) => `${Number(mmdd.slice(3))}/${Number(mmdd.slice(0, 2))}`

/** Cuándo puede entrar un rubro: las franjas de hoy primero, las de otra temporada atenuadas. */
export function HorarioRubro({ titulo, franjas }: { titulo: string; franjas: Franja[] }) {
  if (!franjas.length) return null
  const mmdd = hoyISO().slice(5)
  const rigen = franjas.filter((f) => temporadaRige(f.season, mmdd))
  const despues = franjas.filter((f) => !temporadaRige(f.season, mmdd))
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-3">
      <p className="text-[13px] font-semibold text-ink-soft">{titulo}</p>
      {[...rigen, ...despues].map((f, i) => {
        const fuera = !temporadaRige(f.season, mmdd)
        return (
          <p key={i} className={fuera ? 'text-xs text-ink-soft' : 'text-sm'}>
            <span className="flex justify-between gap-3">
              <span>{textoDias(f.days)}</span>
              <span className="tabular">{horaCorta(f.from)} a {horaCorta(f.to)}</span>
            </span>
            {fuera && f.season && <span className="block">Desde el {desde(f.season.from)}</span>}
          </p>
        )
      })}
    </div>
  )
}
