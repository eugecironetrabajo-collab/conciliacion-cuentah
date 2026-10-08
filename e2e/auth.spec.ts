import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('shows login and rejects invalid credentials', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'wrong-password')
  await page.getByRole('button', { name: /Ingresar/ }).click()
  await expect(page.getByText(/incorrectos|No se pudo iniciar sesión/)).toBeVisible()
})

test('logs in with valid credentials', async ({ page }) => {
  await page.goto('/')
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'e2e-test')
  await page.getByRole('button', { name: /Ingresar/ }).click()
  await expect(page.getByRole('link', { name: 'Resumen' })).toBeVisible()
  await expect(page.locator('#session-user-name')).toHaveText('admin')
})

test('navigates between routes after login', async ({ page }) => {
  await page.goto('/#/movimientos')
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'e2e-test')
  await page.getByRole('button', { name: /Ingresar/ }).click()
  await expect(page.getByRole('heading', { name: 'Búsqueda de movimientos' })).toBeVisible()
  await page.locator('#nav a[data-nav="conciliar"]').click()
  await expect(page.getByRole('heading', { name: 'Conciliar partidas' })).toBeVisible()
  await page.locator('#nav a[data-nav="resumen"]').click()
  await expect(page.getByRole('heading', { name: 'Resumen de Cuenta H' })).toBeVisible()
})
