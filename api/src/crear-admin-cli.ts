import { z } from 'zod'
import { pool } from './db/index.js'
import { crearAdmin } from './seed.js'

// node dist/crear-admin-cli.js <mail> [nombre]
const [email = '', ...resto] = process.argv.slice(2)

try {
  if (!z.string().email().safeParse(email).success) throw new Error('Uso: node dist/crear-admin-cli.js <mail> [nombre]')
  const { resultado, link } = await crearAdmin(email, resto.join(' ').trim() || 'Admin')
  console.log(`Admin ${resultado}: ${email}`)
  console.log(`Link de alta: ${link}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
