import { defineConfig } from 'vitest/config'

// Node 24 trae loadEnvFile: evita exportar DATABASE_URL a mano.
process.loadEnvFile('.env')

// Los tests SIEMPRE corren contra la base de tests, nunca contra la de dev:
// truncan tablas en cada beforeEach.
process.env.DATABASE_URL_DEV = process.env.DATABASE_URL
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    // Una sola base compartida entre archivos: correrlos en paralelo se pisaría.
    fileParallelism: false,
  },
})
