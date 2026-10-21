import { TZ, hoyISO } from './fechas.ts'

/** Igual que en la API: 0 = domingo, horas 'HH:MM' ('24:00' vale), temporada 'MM-DD'. */
export type Franja = {
  days: number[]
  from: string
  to: string
  season: { from: string; to: string } | null
  trades: string[] | null
}

// Local: invitations.ts importa sin extensión y node no lo puede correr directo.
const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const PLURALES = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados']
const SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const HORA = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DIA = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' })

export function nombreDiaPlural(dia: number): string {
  return PLURALES[dia]
}

/** 'MM-DD' comparado como string; si from > to, la temporada cruza el año (igual que la API). */
export function temporadaRige(season: Franja['season'], mmdd: string): boolean {
  if (!season) return true
  return season.from <= season.to
    ? mmdd >= season.from && mmdd <= season.to
    : mmdd >= season.from || mmdd <= season.to
}

export function textoDias(days: number[]): string {
  const orden = [...days].sort((a, b) => a - b)
  if (orden.length === 7) return 'Todos los días'
  if (orden.join() === '1,2,3,4,5') return 'Lunes a viernes'
  if (orden.length === 1) return PLURALES[orden[0]]
  return orden.map((d) => CORTOS[d]).join(', ')
}

/** '08:00' → '8', '08:30' → '8:30', '24:00' → '24'. */
export function horaCorta(h: string): string {
  const [hh, mm] = h.split(':')
  return mm === '00' ? String(Number(hh)) : `${Number(hh)}:${mm}`
}

export function textoHorario(f: Franja): string {
  return `${textoDias(f.days)}, ${horaCorta(f.from)} a ${horaCorta(f.to)}`
}

/** Las franjas que le tocan a un rubro: las de todos más las que lo nombran. Sin rubro, solo las de todos. */
export function franjasDelRubro(franjas: Franja[], tradeId: string | null): Franja[] {
  return franjas.filter((f) => f.trades === null || (tradeId !== null && f.trades.includes(tradeId)))
}

/** Días que ninguna franja del rubro cubre, en ninguna temporada. Sin franjas no hay restricción. */
export function diasSinFranja(franjas: Franja[], tradeId: string | null, dias: number[]): number[] {
  const propias = franjasDelRubro(franjas, tradeId)
  if (!propias.length) return []
  return dias.filter((d) => !propias.some((f) => f.days.includes(d)))
}

/** Franjas cuya temporada rige hoy (sin filtrar por día de la semana). */
export function vigentesHoy(franjas: Franja[], ahora: Date): Franja[] {
  const mmdd = hoyISO(ahora).slice(5)
  return franjas.filter((f) => temporadaRige(f.season, mmdd))
}

/** Por qué no entra: el horario de hoy de su rubro, o que hoy no entra. `franjas` ya vienen del rubro. */
export function detalleFueraDeHorario(franjas: Franja[], tradeName: string, ahora: Date): string {
  const dia = SEMANA.indexOf(DIA.format(ahora))
  const f = vigentesHoy(franjas, ahora).find((x) => x.days.includes(dia))
  if (!f) return `Su rubro no entra los ${nombreDiaPlural(dia).toLowerCase()}`
  return `${tradeName}: ${textoDias(f.days).toLowerCase()} de ${horaCorta(f.from)} a ${horaCorta(f.to)} · Son las ${HORA.format(ahora)}`
}

/** Día de la semana (0 = domingo) de una fecha ISO; al mediodía UTC, no depende del huso. */
export function diaDe(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}
