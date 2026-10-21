import { TZ, todayInBuenosAires, weekdayInBuenosAires } from './dates.js'
import type { Franja } from '../db/schema.js'
export type { Franja }

/** 'HH:MM' en Buenos Aires. h23: medianoche es '00', no '24'. */
export function horaEnBuenosAires(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

/** 'MM-DD' comparado como string; si from > to, la temporada cruza el año. */
export function temporadaRige(season: Franja['season'], mmdd: string): boolean {
  if (!season) return true
  return season.from <= season.to
    ? mmdd >= season.from && mmdd <= season.to
    : mmdd >= season.from || mmdd <= season.to
}

/** Una frecuente sin subtipo cuenta como visita, igual que en la alerta de permanencia. */
export function aplicaFranjas(kind: string, frequentAs: string | null): boolean {
  return kind === 'proveedor' || (kind === 'frecuente' && frequentAs === 'proveedor')
}

/** ¿Alguna franja deja pasar a este rubro ahora? Sin franjas, no hay restricción. */
export function dentroDeFranja(franjas: Franja[], tradeId: string | null, now: Date): boolean {
  if (!franjas.length) return true
  const mmdd = todayInBuenosAires(now).slice(5)
  const dia = weekdayInBuenosAires(now)
  const hora = horaEnBuenosAires(now)
  return franjas.some((f) =>
    temporadaRige(f.season, mmdd)
    && f.days.includes(dia)
    && hora >= f.from && hora < f.to
    && (f.trades === null || (tradeId !== null && f.trades.includes(tradeId))))
}
