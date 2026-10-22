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
