/**
 * La paleta de marca, única fuente de verdad.
 *
 * No es un selector libre a propósito: el color se usa como fondo con texto
 * claro encima (`bg-marca` + `text-surface`). Un barrio que eligiera amarillo o
 * celeste dejaría ese texto ilegible, y sería un diseño que nadie probó.
 *
 * Los ocho son lo bastante oscuros como para llevar texto claro en el tema
 * claro, que es la restricción que los define. El front los recibe por API: no
 * se duplican del otro lado.
 *
 * En la base se guarda un hex, así que abrir el selector libre más adelante es
 * sacar esta validación, no migrar datos.
 */
export const PALETA = [
  '#1e6b47', // verde, el del producto
  '#14565c', // petróleo
  '#1d4e89', // azul
  '#3b3b7a', // índigo
  '#5b3a75', // violeta
  '#7a1f3d', // bordó
  '#8a3c1e', // terracota
  '#36454f', // pizarra
] as const

export const COLOR_DEFAULT = PALETA[0]

export function esColorDeLaPaleta(v: unknown): v is string {
  return typeof v === 'string' && (PALETA as readonly string[]).includes(v)
}
