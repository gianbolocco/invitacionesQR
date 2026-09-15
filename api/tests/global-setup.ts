import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

/**
 * Crea la base de tests si no existe y le aplica las migraciones.
 * Los tests truncan tablas en cada beforeEach: si apuntaran a la base de dev,
 * `npm test` borraría los datos con los que estás probando a mano.
 */
export default async function setup() {
  const devUrl = process.env.DATABASE_URL_DEV!
  const testUrl = process.env.DATABASE_URL!
  const testDbName = new URL(testUrl).pathname.slice(1)

  const admin = new pg.Client({ connectionString: devUrl })
  await admin.connect()
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [testDbName])
  if (!rowCount) await admin.query(`create database "${testDbName}"`)
  await admin.end()

  const pool = new pg.Pool({ connectionString: testUrl })
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  await pool.end()
}
