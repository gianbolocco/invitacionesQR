import { defineConfig, devices } from '@playwright/test'

/**
 * Corre contra el stack de docker compose ya levantado:
 *   docker compose up -d --build   (desde la raíz)
 *   cd web && npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  globalTeardown: './e2e/limpiar.ts',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
})
