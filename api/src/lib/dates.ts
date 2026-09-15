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
