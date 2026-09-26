import { expect, test } from '@playwright/test'

test('shows two reconciliation quadrants and stages without confirming', async ({ page }) => {
  await page.goto('/#/conciliar')
  await expect(page.getByRole('heading', { name: 'Partidas pendientes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conciliación preparada' })).toBeVisible()

  await page.getByRole('button', { name: 'Búsqueda automática' }).click()
  await expect(page.locator('#staged-count')).not.toHaveText('0 parejas')
  await expect(page.getByRole('button', { name: /Confirmar conciliación/ })).toBeEnabled()

  await page.reload()
  await expect(page.locator('#staged-count')).toHaveText('0 parejas')
  await expect(page.getByRole('button', { name: /Confirmar conciliación/ })).toBeDisabled()
})

test('import screen states that importing does not reconcile', async ({ page }) => {
  await page.goto('/#/importar')
  await expect(page.getByText('Importación y conciliación son pasos separados')).toBeVisible()
  await expect(page.getByText(/nunca se ejecuta automáticamente/)).toBeVisible()
})

test('keeps documented movement filters', async ({ page }) => {
  await page.goto('/#/movimientos')
  await expect(page.locator('#f-estado')).toBeVisible()
  await expect(page.locator('#f-origen')).toBeVisible()
  await expect(page.locator('#f-aplicar')).toBeVisible()
})
