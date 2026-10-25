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

export type ClaveSeguro = 'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'

/**
 * El estado de un seguro, para el proveedor y para el auto. Es lo que se
 * congela en entry_log al ingresar: el padrón cambia, la auditoría no.
 */
export function claveSeguro(pide: boolean, s: Seguro | null, warnDays: number | null, now: Date = new Date()): ClaveSeguro {
  if (!pide) return 'no_aplica'
  if (!s) return 'sin_cargar'
  if (!seguroVigente(s.expiresOn, now)) return 'vencido'
  const dias = (Date.parse(s.expiresOn) - Date.parse(todayInBuenosAires(now))) / 86_400_000
  return warnDays && dias <= warnDays ? 'por_vencer' : 'vigente'
}

const ETIQUETA_SEGURO: Record<ClaveSeguro, 'No aplica' | 'Sin cargar' | 'Vencido' | 'Por vencer' | 'Vigente'> = {
  no_aplica: 'No aplica', sin_cargar: 'Sin cargar', vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente',
}

/** Lo que se lee en una planilla. Mismas reglas que estadoSeguro del front. */
export function estadoSeguro(
  r: { requiresInsurance: boolean; company: string | null; policy: string | null; expiresOn: string | null },
  warnDays: number | null,
  now: Date = new Date(),
) {
  const s = seguroCompleto(r.company, r.policy, r.expiresOn)
    ? { company: r.company!, policy: r.policy!, expiresOn: r.expiresOn! } : null
  return ETIQUETA_SEGURO[claveSeguro(r.requiresInsurance, s, warnDays, now)]
}

/** Etiqueta de una clave congelada en entry_log; null (filas viejas o carga manual) es '—'. */
export const etiquetaClave = (c: string | null) => (c ? ETIQUETA_SEGURO[c as ClaveSeguro] : '—')
