/*
 * El espejo de api/src/lib/padron.ts: la garita compara la patente tipeada con
 * la sugerida ("última vez: AB 123 CD") con la misma regla que usa el padrón.
 */

/** Solo dígitos y letras ASCII, en mayúscula: '30.123.456' → '30123456'. */
export const normalizarDoc = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** La misma regla: 'ab-123 cd' → 'AB123CD'. */
export const normalizarPatente = normalizarDoc

export const mismaPatente = (a: string | null, b: string | null) =>
  normalizarPatente(a ?? '') === normalizarPatente(b ?? '')
