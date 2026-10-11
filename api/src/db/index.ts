import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL no está definida')

export const pool = new pg.Pool({ connectionString })
// Sin listener, el 'error' de una conexión inactiva (Postgres que se reinicia)
// es un evento sin atender y tira el proceso entero. El pool la descarta solo.
pool.on('error', (err) => console.error('[db] conexión inactiva perdida:', err.message))
export const db = drizzle(pool, { schema })
