import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

/*
 * El padrón cruza por texto, no por FK: el DNI y la patente se guardan como
 * los escribió cada uno ("30.123.456", "ab 123 cd") y se comparan normalizados.
 * Todo lo que entra al padrón y toda búsqueda en él pasa por acá.
 */

/** Solo dígitos y letras ASCII, en mayúscula: '30.123.456' → '30123456'. */
export const normalizarDoc = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** La misma regla: 'ab-123 cd' → 'AB123CD'. */
export const normalizarPatente = normalizarDoc

/** normalizarDoc en SQL, para cruzar una columna cruda (invitation.guest_doc) contra el padrón. */
export const docSql = (col: AnyColumn | SQL) =>
  sql`upper(regexp_replace(coalesce(${col}, ''), '[^0-9A-Za-z]', '', 'g'))`
