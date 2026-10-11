/**
 * "Álamo Alto" → "alamo-alto". Para nombres de archivo: sin tildes, sin
 * espacios y sin nada que un sistema de archivos o un header pueda romper.
 */
export function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
