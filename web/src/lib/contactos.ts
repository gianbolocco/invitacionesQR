import { fechaCompleta } from './fechas.ts'

export type Contacto = {
  id: string
  unitId: string
  kind: 'visita' | 'proveedor'
  name: string
  doc: string | null
  tradeId: string | null
  tradeName: string | null
  insuranceState: 'no_aplica' | 'sin_cargar' | 'vencido' | 'por_vencer' | 'vigente'
  insuranceExpiresOn: string | null
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Por nombre (sin tildes ni mayúsculas) o por los dígitos del DNI, como el buscador de la garita. */
export function filtrarContactos(cs: Contacto[], q: string, tipo: 'todos' | 'visita' | 'proveedor'): Contacto[] {
  const texto = sinTildes(q.trim())
  const digitos = q.replace(/\D/g, '')
  return cs.filter((c) => (tipo === 'todos' || c.kind === tipo) && (!texto
    || sinTildes(c.name).includes(texto)
    || (digitos.length >= 3 && (c.doc ?? '').replace(/\D/g, '').includes(digitos))))
}

export function agruparContactos(cs: Contacto[]) {
  return { visitas: cs.filter((c) => c.kind === 'visita'), proveedores: cs.filter((c) => c.kind === 'proveedor') }
}

/** La línea de abajo del nombre: el DNI de una visita, o el rubro y el seguro de un proveedor. */
export function lineaContacto(c: Contacto): string {
  if (c.kind === 'visita') return c.doc ? `DNI ${c.doc}` : 'Visita'
  const seguro = c.insuranceState === 'vigente' || c.insuranceState === 'por_vencer'
    ? `Seguro hasta ${fechaCompleta(c.insuranceExpiresOn!)}`
    : c.insuranceState === 'vencido' ? 'Seguro vencido'
    : c.insuranceState === 'sin_cargar' ? 'Sin seguro cargado' : null
  return [c.tradeName, seguro].filter(Boolean).join(' · ') || 'Proveedor'
}
