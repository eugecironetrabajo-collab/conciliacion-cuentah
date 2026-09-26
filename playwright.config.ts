import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:43127',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'DB_PATH=data/e2e.db npm run dev',
    url: 'http://127.0.0.1:43127',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
