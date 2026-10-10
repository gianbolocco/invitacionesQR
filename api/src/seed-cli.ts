import { pool } from './db/index.js'
import { sembrar } from './seed.js'

console.log(`Seed: ${await sembrar()}`)
await pool.end()
