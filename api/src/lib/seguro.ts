import { todayInBuenosAires } from './dates.js'
import { aplicaFranjas } from './franjas.js'

export type Seguro = { company: string; policy: string; expiresOn: string }

/** Lo pide quien entra a trabajar (como las franjas) y solo si su rubro lo pide. Sin rubro, no. */
export function pideSeguro(kind: string, frequentAs: string | null, tradeRequiresInsurance: boolean | null): boolean {
  return aplicaFranjas(kind, frequentAs) && tradeRequiresInsurance === true
}

export function seguroCompleto(company: string | null, policy: string | null, expiresOn: string | null): boolean {
  return Boolean(company?.trim() && policy?.trim() && expiresOn)
}

/** 'YYYY-MM-DD' comparado como string: vale el día del vencimiento entero. */
export function seguroVigente(expiresOn: string, now: Date): boolean {
  return expiresOn >= todayInBuenosAires(now)
}

/** Lo que se lee en una planilla. Mismas reglas que estadoSeguro del front. */
export function estadoSeguro(
  r: { requiresInsurance: boolean; company: string | null; policy: string | null; expiresOn: string | null },
  warnDays: number | null,
  now: Date = new Date(),
): 'No aplica' | 'Sin cargar' | 'Vencido' | 'Por vencer' | 'Vigente' {
  if (!r.requiresInsurance) return 'No aplica'
  if (!seguroCompleto(r.company, r.policy, r.expiresOn)) return 'Sin cargar'
  if (!seguroVigente(r.expiresOn!, now)) return 'Vencido'
  const dias = (Date.parse(r.expiresOn!) - Date.parse(todayInBuenosAires(now))) / 86_400_000
  return warnDays && dias <= warnDays ? 'Por vencer' : 'Vigente'
}
