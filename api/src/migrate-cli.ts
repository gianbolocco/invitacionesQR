import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './db/index.js'

/*
 * Las migraciones del arranque, con el migrador de drizzle-orm y no con
 * `drizzle-kit migrate`: aquel, si no podía conectarse, mostraba el spinner y
 * salía sin decir por qué, y el contenedor quedaba reiniciando a ciegas.
 *
 * Se imprime a qué host se intenta llegar (sin la contraseña): es lo primero
 * que hay que mirar cuando la base es otro recurso.
 */
const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? '').host } catch { return '(DATABASE_URL inválida)' }
})()

try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log(`Migraciones al día (${host})`)
} catch (err) {
  // Drizzle envuelve el error de pg: el motivo real (host inexistente, clave
  // mala) está en `cause`, que es lo que hay que leer primero.
  const causa = (err as { cause?: Error }).cause ?? err
  console.error(`No se pudieron aplicar las migraciones contra ${host}: ${(causa as Error).message}`)
  console.error(err)
  process.exitCode = 1
} finally {
  await pool.end()
}
