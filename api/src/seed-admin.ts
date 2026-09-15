import { parseArgs } from 'node:util'
import { db, pool } from './db/index.js'
import { neighborhoods } from './db/schema.js'
import { createPerson } from './services/people.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string', default: 'Admin' },
    barrio: { type: 'string', default: 'Mi barrio' },
  },
})

if (!values.email) {
  console.error('Uso: npm run seed:admin -- --email=vos@mail.com [--name=Nombre] [--barrio="Los Robles"]')
  process.exit(1)
}

const [existing] = await db.select().from(neighborhoods).limit(1)
const neighborhood = existing ?? (await db.insert(neighborhoods).values({ name: values.barrio! }).returning())[0]

const { inviteToken } = await createPerson({
  neighborhoodId: neighborhood.id,
  email: values.email,
  name: values.name!,
  role: 'admin',
  unitIds: [],
  actorId: null,
})

console.log(`\nAdmin creado en el barrio "${neighborhood.name}".`)
console.log(`Link de acceso: ${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/acceso?t=${inviteToken}\n`)
await pool.end()
