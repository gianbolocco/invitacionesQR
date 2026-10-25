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
  '#2f5bff', // azul de Pazzit, el default
  '#1e6b47', // verde
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

/**
 * Qué imagen es, mirando los primeros bytes del archivo.
 *
 * No se mira la extensión ni el Content-Type: los dos los elige quien sube, y
 * un SVG con JavaScript adentro declarado como image/png sería un XSS servido
 * desde nuestro propio origen.
 *
 * Es la verificación del logo: solo PNG y JPEG. El plano del barrio también
 * acepta SVG, vía tipoDePlano().
 */
export function tipoDeImagen(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.length < 4) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  return null
}

/** SVG: texto (con o sin BOM / <?xml) que tiene un elemento <svg. PNG y JPG, por la firma de siempre. */
export function tipoDePlano(bytes: Buffer): 'image/svg+xml' | 'image/png' | 'image/jpeg' | null {
  const img = tipoDeImagen(bytes)
  if (img) return img
  const inicio = bytes.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart()
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(inicio) ? 'image/svg+xml' : null
}

/** El lote de destino, pintado con el color del barrio. Va al final para ganarle a los estilos del archivo. */
export function resaltarLote(svg: string, lote: string, color: string): string {
  const css = `<style>#lote-${lote} rect{fill:${color}}#lote-${lote} text{fill:#fff;font-weight:700}</style>`
  const i = svg.lastIndexOf('</svg>')
  return i === -1 ? svg : svg.slice(0, i) + css + svg.slice(i)
}
