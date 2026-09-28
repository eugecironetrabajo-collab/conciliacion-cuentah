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

test('imports several bank files once and restores a logically deleted movement', async ({ page }) => {
  const documentNo = String(Date.now()).padStart(12, '0').slice(-12)
  const chars = Array.from({ length: 207 }, () => ' ')
  const put = (start: number, value: string) => [...value].forEach((character, index) => { chars[start + index] = character })
  put(0, '41110100')
  put(33, documentNo)
  put(47, 'DA')
  put(54, 'FLETE E2E')
  put(120, '00000000125,50')
  put(136, '00000000000,00')
  put(193, '251128')
  const content = Buffer.from(`${chars.join('')}\n${chars.join('')}`)
  await page.goto('/#/importar')
  await page.locator('#dz-txt input').setInputFiles([
    { name: 'banco-a.txt', mimeType: 'text/plain', buffer: content },
    { name: 'banco-b.txt', mimeType: 'text/plain', buffer: content },
  ])
  await expect(page.locator('[data-result="banco"]')).toContainText('1 partidas nuevas')
  await expect(page.locator('[data-result="banco"]')).toContainText('Sin conciliación automática')

  await page.goto('/#/movimientos')
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#delete-selected').click()
  await page.locator('#delete-reason').fill('Eliminación de prueba E2E')
  await page.locator('#confirm-delete').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) eliminados')

  await page.locator('input[name="f-estado"][value="PENDIENTE"]').uncheck()
  await page.locator('input[name="f-estado"][value="CONCILIADO"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').check()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#restore-selected').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) restaurados')

  await page.locator('input[name="f-estado"][value="CONCILIADO"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').uncheck()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#delete-selected').click()
  await page.locator('#delete-reason').fill('Borrado definitivo de prueba')
  await page.locator('#confirm-delete').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) eliminados')
  await page.locator('input[name="f-estado"][value="PENDIENTE"]').uncheck()
  await page.locator('input[name="f-estado"][value="ELIMINADO"]').check()
  await page.locator('#f-orden').fill(documentNo)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await page.locator('.row-check').check()
  await page.locator('#purge-selected').click()
  await page.locator('#confirm-purge').click()
  await expect(page.locator('#toast')).toContainText('1 movimiento(s) borrados definitivamente')
})

test('filters a partial receipt and an amount, and shows separate balances', async ({ page }) => {
  const documentNo = `000104${String(Date.now()).slice(-6)}`
  const cents = 80_000_000 + (Date.now() % 100_000)
  const amount = (cents / 100).toFixed(2).replace('.', ',').padStart(15, '0')
  const chars = Array.from({ length: 207 }, () => ' ')
  const put = (start: number, value: string) => [...value].forEach((character, index) => { chars[start + index] = character })
  put(0, '41110100')
  put(33, documentNo)
  put(47, 'AB')
  put(54, 'SALDO FILTRO')
  put(120, amount)
  put(136, '00000000000,00')
  put(193, '251128')
  await page.goto('/#/importar')
  await page.locator('#dz-txt input').setInputFiles({
    name: 'filtro.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(chars.join('')),
  })
  await expect(page.locator('[data-result="banco"]')).toContainText('1 partidas nuevas')

  await page.goto('/#/movimientos')
  await page.locator('#f-comprobante').fill(documentNo.slice(-4))
  const shown = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
  await page.locator('#f-importe-desde').fill(shown)
  await page.locator('#f-importe-hasta').fill(shown)
  await page.locator('#f-aplicar').click()
  await expect(page.locator('#movement-body tr')).toHaveCount(1)
  await expect(page.locator('#movement-body tr')).toContainText(`AB ${documentNo}`)
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  await expect(page.locator('#movement-body tr')).toContainText(today)

  await page.goto('/#/resumen')
  await expect(page.getByRole('cell', { name: 'Saldo banco' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '(+) Débitos libros' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '(−) Créditos bancos' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Saldo libros' })).toBeVisible()
  await expect(page.getByText('Total débitos')).toHaveCount(0)
})
