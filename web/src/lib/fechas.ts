/**
 * Fechas y horas, en un solo lugar.
 *
 * Antes `fechaCorta` estaba escrita tres veces y `hora` dos, con formatos
 * apenas distintos. Todo en hora de Buenos Aires, igual que la API.
 */
export const TZ = 'America/Argentina/Buenos_Aires'

/*
 * Los formateadores se crean una vez: construir un Intl.DateTimeFormat cuesta
 * mucho más que usarlo. Creados en cada llamada, la agenda de la garita armaba
 * miles por refresco y trababa la página un segundo en una PC lenta.
 */
const ISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const HORA = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const CORTA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const LARGA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
const CON_ANIO = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })

/** 'YYYY-MM-DD' de hoy en Buenos Aires. `en-CA` ya produce ese formato. */
export function hoyISO(ahora: Date = new Date()): string {
  return ISO.format(ahora)
}

/** Corre una fecha `n` días. Se calcula al mediodía UTC: ningún huso la cambia de día. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * El mismo día del mes siguiente, o el último de ese mes si no existe
 * ('2026-01-31' → '2026-02-28'). Es el tope de una visita frecuente.
 */
export function unMesDespues(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const anio = m === 12 ? y + 1 : y
  const mes = m === 12 ? 1 : m + 1
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

function local(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 'YYYY-MM-DD' → Date local a medianoche (para el calendario). */
export function aFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date local → 'YYYY-MM-DD' con los campos locales, no UTC. */
export function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "14 sept": corto, para filas y tarjetas. */
export function fechaCorta(iso: string): string {
  return CORTA.format(local(iso)).replace('.', '')
}

/** "04/09": para tablas, donde las columnas no tienen que bailar. Se arma a
 *  mano: el relleno con cero de Intl depende de la versión de ICU. */
export function fechaNumerica(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** "09:05" de un instante, en Buenos Aires. en-GB con h23 siempre rellena y
 *  nunca escribe "24:05" a la medianoche. */
export function hora(instante: string): string {
  return HORA.format(new Date(instante))
}

/** "04/10, 14:02". */
export function fechaHora(instante: string): string {
  return `${fechaNumerica(hoyISO(new Date(instante)))}, ${hora(instante)}`
}

/**
 * "14:02" si el instante cae el día `dia`; si no, "04/10, 14:02". Para el que
 * entra un día y sale otro: la hora sola parecería del mismo día.
 */
export function horaODia(instante: string, dia: string): string {
  return hoyISO(new Date(instante)) === dia ? hora(instante) : fechaHora(instante)
}

/** "45 min", "3 h 20 min", "2 d 4 h": cuánto pasó desde un instante. */
export function tiempoDesde(instante: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((ahora.getTime() - new Date(instante).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/** "Hoy", "Mañana", "Ayer" o "miércoles, 14 de octubre". */
export function tituloDia(iso: string, hoy: string = hoyISO()): string {
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, 1)) return 'Mañana'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  return LARGA.format(local(iso))
}

/**
 * Qué decir del cupo de una invitación, o null si no hay nada que decir.
 *
 * Las frecuentes se crean con cupo 999, que es un centinela y no un cupo: de
 * ellas se cuentan ingresos. Una visita de una sola persona no muestra nada.
 */
export function cupoTexto(inv: { kind: string; capacity: number; usedCount: number }): string | null {
  if (inv.kind === 'frecuente') {
    if (inv.usedCount === 0) return 'Sin ingresos todavía'
    return inv.usedCount === 1 ? '1 ingreso' : `${inv.usedCount} ingresos`
  }
  if (inv.capacity > 1) return `${inv.usedCount} de ${inv.capacity} entraron`
  return null
}

/** "11/10/2026": con año, para accesos que pueden ser de hace mucho. */
export function fechaConAnio(iso: string): string {
  return CON_ANIO.format(new Date(iso))
}

/** "12/04/2027": una fecha ISO (sin hora) con año. Se arma a mano, como fechaNumerica. */
export function fechaCompleta(iso: string): string {
  return iso.split('-').reverse().join('/')
}
