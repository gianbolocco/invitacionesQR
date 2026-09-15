import type { Config } from 'drizzle-kit'

// En dev lee el .env local; en Docker las variables ya vienen del entorno y el
// archivo no existe (está en .dockerignore).
try {
  process.loadEnvFile('.env')
} catch {
  // sin .env: seguimos con process.env
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
