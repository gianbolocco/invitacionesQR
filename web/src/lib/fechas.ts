/**
 * Fechas y horas, en un solo lugar.
 *
 * Antes `fechaCorta` estaba escrita tres veces y `hora` dos, con formatos
 * apenas distintos. Todo en hora de Buenos Aires, igual que la API.
 */
export const TZ = 'America/Argentina/Buenos_Aires'

/** 'YYYY-MM-DD' de hoy en Buenos Aires. `en-CA` ya produce ese formato. */
export function hoyISO(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/** Corre una fecha `n` días. Se calcula al mediodía UTC: ningún huso la cambia de día. */
export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
    .format(local(iso)).replace('.', '')
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
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(instante))
}

/** "04/10, 14:02". */
export function fechaHora(instante: string): string {
  return `${fechaNumerica(hoyISO(new Date(instante)))}, ${hora(instante)}`
}

/** "Hoy", "Mañana", "Ayer" o "miércoles, 14 de octubre". */
export function tituloDia(iso: string, hoy: string = hoyISO()): string {
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, 1)) return 'Mañana'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(local(iso))
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
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}
