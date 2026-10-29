/** 'Lote 87' → '87'; 'Casa A' → null. El primer grupo de 1 a 6 dígitos. */
export function loteDeLabel(label: string): string | null {
  return label.match(/\d{1,6}/)?.[0] ?? null
}

export function urlPlano(base: string, version: number, lote: string | null): string {
  return `${base}/branding/plano?v=${version}${lote ? `&lote=${lote}` : ''}`
}
