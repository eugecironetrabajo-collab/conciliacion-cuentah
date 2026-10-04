import { defineConfig, devices } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const authFile = join(dirname(fileURLToPath(import.meta.url)), 'e2e/.auth/user.json')
const e2eWebPort = process.env.E2E_WEB_PORT ?? '43137'
const e2eApiPort = process.env.E2E_API_PORT ?? '43138'
const e2eBaseUrl = `http://127.0.0.1:${e2eWebPort}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `DB_PATH=data/e2e.db PORT=${e2eApiPort} VITE_PORT=${e2eWebPort} AUTH_REQUIRED=true ADMIN_USER=admin ADMIN_PASSWORD=e2e-test SESSION_SECRET=e2e-test-secret npm run dev`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testMatch: /web\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
})
