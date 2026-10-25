import { fechaNumerica } from './fechas.ts'

export type EstadoSeguro = 'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'

/** Días de `hoy` a `iso` ('YYYY-MM-DD'). Date.UTC sobre los componentes: no depende de la zona. */
function diasHasta(iso: string, hoy: string): number {
  const utc = (f: string) => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(iso) - utc(hoy)) / 86_400_000)
}

export function estadoSeguro(
  inv: { requiresInsurance: boolean; insuranceCompany: string | null; insurancePolicy: string | null; insuranceExpiresOn: string | null },
  hoy: string,
  warnDays: number | null,
): EstadoSeguro {
  if (!inv.requiresInsurance) return 'no_aplica'
  // Igual que seguroCompleto de la API: con un dato en blanco, el seguro no está cargado.
  const lleno = (v: string | null) => Boolean(v?.trim())
  if (!lleno(inv.insuranceCompany) || !lleno(inv.insurancePolicy) || !inv.insuranceExpiresOn) return 'sin_cargar'
  const dias = diasHasta(inv.insuranceExpiresOn, hoy)
  if (dias < 0) return 'vencido'
  return warnDays !== null && dias <= warnDays ? 'por_vencer' : 'vigente'
}

export function textoVence(expiresOn: string, hoy: string): string {
  const dias = diasHasta(expiresOn, hoy)
  if (dias < 0) return `venció el ${fechaNumerica(expiresOn)}`
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return `vence mañana (${fechaNumerica(expiresOn)})`
  return `vence en ${dias} días (${fechaNumerica(expiresOn)})`
}

export type SeguroDatos = { company: string; policy: string; expiresOn: string }

/** El estado de un seguro suelto (el del padrón: proveedor o auto). Mismas reglas que estadoSeguro. */
export function estadoDe(s: SeguroDatos | null, pide: boolean, hoy: string, warnDays: number | null): EstadoSeguro {
  return estadoSeguro({
    requiresInsurance: pide,
    insuranceCompany: s?.company ?? null, insurancePolicy: s?.policy ?? null, insuranceExpiresOn: s?.expiresOn ?? null,
  }, hoy, warnDays)
}

/** Lo que va al lado del título de la sección en el veredicto. */
export function textoEstado(e: EstadoSeguro, expiresOn: string | null, hoy: string): string {
  if (e === 'vigente') return 'Seguro vigente'
  if (e === 'vencido') return 'Seguro vencido'
  if (e === 'sin_cargar') return 'Falta el seguro'
  if (e === 'por_vencer' && expiresOn) {
    const dias = diasHasta(expiresOn, hoy)
    return dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`
  }
  return ''
}
