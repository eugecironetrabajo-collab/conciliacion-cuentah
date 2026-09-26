import { expect, test } from '@playwright/test'

test('moves individual lines between quadrants with double click', async ({ page }) => {
  await page.goto('/#/conciliar')
  await expect(page.getByRole('heading', { name: 'Partidas pendientes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conciliación preparada' })).toBeVisible()

  await page.locator('#pending-grid [data-sel]').first().dblclick()
  await expect(page.locator('#staged-count')).toHaveText('1 partida')
  await page.locator('#staged-grid [data-staged-line]').dblclick()
  await expect(page.locator('#staged-count')).toHaveText('0 partidas')
  await expect(page.getByRole('button', { name: /Confirmar conciliación/ })).toBeDisabled()
})

test('import screen states that importing does not reconcile', async ({ page }) => {
  await page.goto('/#/importar')
  await expect(page.getByText('Importación y conciliación son pasos separados')).toBeVisible()
  await expect(page.getByText(/nunca se ejecuta automáticamente/)).toBeVisible()
})

test('keeps documented movement filters', async ({ page }) => {
  await page.goto('/#/movimientos')
  await expect(page.locator('#f-importe-desde')).toBeVisible()
  await expect(page.locator('#f-proceso-hasta')).toBeVisible()
  await expect(page.locator('input[name="f-estado"]')).toHaveCount(3)
  await expect(page.locator('input[name="f-origen"]')).toHaveCount(3)
  await expect(page.locator('#f-aplicar')).toBeVisible()
})

test('opens a numbered group and reverses all original movements', async ({ page }) => {
  const pendingResponse = await page.request.get('/api/movimientos?estado=PENDIENTE')
  const pendingPayload = await pendingResponse.json()
  const bank = pendingPayload.data.find((row: { origin: string }) => row.origin === 'BANCO')
  const book = pendingPayload.data.find((row: { origin: string }) => row.origin === 'LIBRO')
  expect(bank).toBeTruthy()
  expect(book).toBeTruthy()

  const reconciliationResponse = await page.request.post('/api/reconcile', {
    data: {
      movementIds: [bank.id, book.id],
      adjustment: { reason: 'Diferencia de prueba E2E' },
    },
  })
  expect(reconciliationResponse.ok()).toBeTruthy()
  const reconciliationPayload = await reconciliationResponse.json()
  const reconciliationId = reconciliationPayload.data.reconciliationId

  await page.goto('/#/movimientos')
  await page.locator(`tr[data-reconciliation="${reconciliationId}"]`).first().dblclick()
  await expect(page.getByRole('heading', { name: `Conciliación N.º ${reconciliationId}` })).toBeVisible()
  await page.getByRole('button', { name: 'Preparar reversión' }).click()
  await page.locator('[data-reverse-group]').first().dblclick()
  await page.locator('#reversal-reason').fill('Reversión controlada por prueba E2E')
  await page.getByRole('button', { name: 'Guardar reversión' }).click()
  await expect(page.locator('#toast')).toContainText(`Conciliación ${reconciliationId} revertida`)

  const detailResponse = await page.request.get(`/api/reconciliaciones/${reconciliationId}`)
  const detail = await detailResponse.json()
  expect(detail.data.status).toBe('REVERTIDA')
})
