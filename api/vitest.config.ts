import { defineConfig } from 'vitest/config'

// Node 24 trae loadEnvFile: evita tener que exportar DATABASE_URL a mano.
process.loadEnvFile('.env')

export default defineConfig({
  test: {
    // Los tests comparten UNA base y la truncan en cada beforeEach. En paralelo
    // se pisarían entre archivos. Con una sola base, la suite es secuencial.
    fileParallelism: false,
  },
})
