export const TZ = 'America/Argentina/Buenos_Aires'

/** 'YYYY-MM-DD' en hora de Buenos Aires. `en-CA` ya produce ese formato. */
export function todayInBuenosAires(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** 0 = domingo … 6 = sábado, en hora de Buenos Aires. */
export function weekdayInBuenosAires(now: Date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
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
