import { expect, test as setup } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const authFile = join(dirname(fileURLToPath(import.meta.url)), '.auth/user.json')

setup('authenticate', async ({ page }) => {
  mkdirSync(dirname(authFile), { recursive: true })
  await page.goto('/')
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'e2e-test')
  await page.getByRole('button', { name: /Ingresar/ }).click()
  await expect(page.getByRole('link', { name: 'Resumen' })).toBeVisible()
  await page.context().storageState({ path: authFile })
})
